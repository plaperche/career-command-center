-- Additive migration. Existing tables, records, authentication and policies are preserved.
begin;
alter table public.opportunities
 add column fit_score integer check(fit_score between 1 and 5),
 add column salary_score integer check(salary_score between 1 and 5),
 add column growth_score integer check(growth_score between 1 and 5),
 add column location_score integer check(location_score between 1 and 5),
 add column interest_score integer check(interest_score between 1 and 5);
create table public.cc_conversations (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id),
 title text not null default 'Career conversation', created_at timestamptz not null default now()
);
create table public.cc_messages (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users(id),
 conversation_id uuid not null references public.cc_conversations(id), role text not null check(role in ('user','assistant')),
 content text not null check(length(content)<=40000), created_at timestamptz not null default now()
);
create table public.cc_proposals (
 id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users(id),
 kind text not null check(kind in ('create_action','update_opportunity','mutate_record')),payload jsonb not null,
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '24 hours', executed_id uuid
);
create table public.cc_sources (
 id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users(id),
 provider text not null check(provider in ('greenhouse','lever','ashby')),board text not null check(board ~ '^[a-zA-Z0-9_-]{1,100}$'),
 families text[] not null default '{}',enabled boolean not null default true,authorized boolean not null default false,
 frequency_hours integer not null default 24 check(frequency_hours between 6 and 168),
 last_scan timestamptz,next_scan timestamptz not null default now(),last_error text,
 unique(user_id,provider,board)
);
create table public.cc_discovered_jobs (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),source_id uuid not null references public.cc_sources(id),
 external_id text not null,title text not null,location text,source_url text not null,description text,compensation jsonb,published_at timestamptz,
 discovered_at timestamptz not null default now(),verified_at timestamptz not null default now(),closed_at timestamptz,
 unique(source_id,external_id)
);
create index cc_messages_conversation_idx on public.cc_messages(conversation_id,created_at);
create index cc_jobs_user_idx on public.cc_discovered_jobs(user_id);
create index cc_sources_user_idx on public.cc_sources(user_id);
create index cc_proposals_user_idx on public.cc_proposals(user_id);
create index cc_conversations_user_idx on public.cc_conversations(user_id);
do $$ declare t text; begin
 foreach t in array array['cc_conversations','cc_messages','cc_proposals','cc_sources','cc_discovered_jobs'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy own_select on public.%I for select to authenticated using ((select auth.uid())=user_id)',t);
 end loop;
 foreach t in array array['cc_conversations','cc_proposals','cc_sources'] loop
 execute format('create policy own_insert on public.%I for insert to authenticated with check ((select auth.uid())=user_id)',t);
 end loop;
end $$;
create policy own_messages_insert on public.cc_messages for insert to authenticated with check (
 (select auth.uid())=user_id and exists(select 1 from public.cc_conversations c where c.id=conversation_id and c.user_id=(select auth.uid()))
);
create policy own_sources_update on public.cc_sources for update to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
grant select,insert on public.cc_conversations,public.cc_messages,public.cc_proposals to authenticated;
grant select,insert,update on public.cc_sources to authenticated;
grant select on public.cc_discovered_jobs to authenticated;
-- Private state is not exposed through PostgREST. Only guarded functions can update it.
create schema if not exists ccc_private;
create table ccc_private.usage (user_id uuid not null,day date not null,calls int not null default 0,primary key(user_id,day));
alter table ccc_private.usage enable row level security;
create function ccc_private.cc_consume_ai() returns boolean language plpgsql security definer set search_path='' as $$
declare n int; begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 insert into ccc_private.usage(user_id,day,calls) values(auth.uid(),current_date,1)
 on conflict(user_id,day) do update set calls=ccc_private.usage.calls+1 returning calls into n;
 return n<=30;
end $$;
revoke all on function ccc_private.cc_consume_ai() from public,anon;
grant execute on function ccc_private.cc_consume_ai() to authenticated;
-- Immutable proposal + row lock + business write in one transaction prevents edits and replay.
create function ccc_private.cc_decide_proposal(proposal_id uuid,approve boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare p public.cc_proposals; result uuid; target text; allowed text[]; vals jsonb; key text; value jsonb; cols text; projections text; assignments text; parent text; owned boolean; required_field text; begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 select * into p from public.cc_proposals where id=proposal_id and user_id=auth.uid() for update;
 if not found or p.status<>'pending' or p.expires_at<now() then raise exception 'Proposal unavailable';end if;
 if not approve then update public.cc_proposals set status='rejected' where id=p.id; return null;end if;
 if p.kind='mutate_record' then
 target=p.payload->>'table'; vals=p.payload->'values';
 case target
 when 'companies' then allowed=array['name','website','career_url','sector','location','priority','notes','fit_score','salary_score','growth_score','location_score','interest_score'];required_field='name';
 when 'opportunities' then allowed=array['title','company_id','location','job_url','salary_min','salary_max','status','deadline','notes','fit_score','salary_score','growth_score','location_score','interest_score'];required_field='title';
 when 'applications' then allowed=array['role_title','company_id','opportunity_id','status','applied_on','next_followup','notes'];required_field='role_title';
 when 'contacts' then allowed=array['full_name','company_id','job_title','email','linkedin_url','status','next_followup','notes'];required_field='full_name';
 when 'actions' then allowed=array['title','company_id','kind','status','priority','due_on','notes'];required_field='title';
 when 'interactions' then allowed=array['summary','company_id','contact_id','channel','next_step'];required_field='summary';
 else raise exception 'Unsupported table';end case;
 if vals is null or jsonb_typeof(vals)<>'object' or vals='{}'::jsonb then raise exception 'Invalid fields';end if;
 if (p.payload->>'id' is null or vals ? required_field) and (vals->>required_field is null or length(trim(vals->>required_field)) not between 1 and 300) then raise exception 'Required title missing or too long';end if;
 for key,value in select * from jsonb_each(vals) loop
  if not key=any(allowed) then raise exception 'Unsupported field';end if;
  if jsonb_typeof(value) not in ('string','number','null') or length(value::text)>10000 then raise exception 'Invalid value';end if;
  if right(key,6)='_score' and value<>'null'::jsonb and (jsonb_typeof(value)<>'number' or (value::text)::numeric not between 1 and 5 or mod((value::text)::numeric,1)<>0) then raise exception 'Invalid score';end if;
  if key in ('salary_min','salary_max') and value<>'null'::jsonb and (jsonb_typeof(value)<>'number' or (value::text)::numeric<0) then raise exception 'Invalid salary';end if;
  if key in ('website','career_url','job_url','linkedin_url') and value<>'null'::jsonb and vals->>key !~ '^https?://' then raise exception 'Invalid URL';end if;
  parent=case key when 'company_id' then 'companies' when 'opportunity_id' then 'opportunities' when 'contact_id' then 'contacts' else null end;
  if parent is not null and value<>'null'::jsonb then
   execute format('select exists(select 1 from public.%I where id=$1 and user_id=auth.uid())',parent) into owned using (vals->>key)::uuid;
   if not owned then raise exception 'Linked record unavailable';end if;
  end if;
 end loop;
 if vals ? 'status' then
  if target='opportunities' and (vals->>'status' is null or vals->>'status' not in ('Discovered','Shortlisted','Closed')) then raise exception 'Invalid status';end if;
  if target='applications' and (vals->>'status' is null or vals->>'status' not in ('Planning','Preparing','Applied','Screening','Interview','Offer','Rejected','Withdrawn')) then raise exception 'Invalid status';end if;
  if target='actions' and (vals->>'status' is null or vals->>'status' not in ('Todo','In progress','Done')) then raise exception 'Invalid status';end if;
 end if;
 if (vals->>'salary_min')::numeric>(vals->>'salary_max')::numeric then raise exception 'Invalid salary range';end if;
 select string_agg(format('%I',k),',' order by k),string_agg(format('v.%I',k),',' order by k),string_agg(format('%1$I=v.%1$I',k),',' order by k)
 into cols,projections,assignments from jsonb_object_keys(vals) k;
 if p.payload->>'id' is null then
  execute format('insert into public.%I(user_id,%s) select auth.uid(),%s from jsonb_populate_record(null::public.%I,$1) v returning id',target,cols,projections,target) into result using vals;
 else
  execute format('update public.%I t set %s,updated_at=now() from jsonb_populate_record(null::public.%I,$1) v where t.id=$2 and t.user_id=auth.uid() and t.updated_at=$3 returning t.id',target,assignments,target)
  into result using vals,(p.payload->>'id')::uuid,(p.payload->>'expected_updated_at')::timestamptz;
  if result is null then raise exception 'Record changed; request a fresh proposal';end if;
 end if;
 elsif p.kind='create_action' then
 if length(trim(p.payload->>'title')) not between 1 and 300 then raise exception 'Invalid title';end if;
 insert into public.actions(user_id,title,notes,due_on,kind,status,priority)
 values(auth.uid(),p.payload->>'title',left(p.payload->>'notes',8000),(p.payload->>'due_on')::date,'Research','Todo','Medium') returning id into result;
 elsif p.kind='update_opportunity' then
 if p.payload->>'status' is null or p.payload->>'status' not in ('Discovered','Shortlisted','Closed') then raise exception 'Invalid status';end if;
 update public.opportunities set status=p.payload->>'status',updated_at=now()
 where id=(p.payload->>'id')::uuid and user_id=auth.uid() and updated_at=(p.payload->>'expected_updated_at')::timestamptz returning id into result;
 if result is null then raise exception 'Record changed; request a fresh proposal';end if;
 end if;
 update public.cc_proposals set status='approved',executed_id=result where id=p.id;
 return result;
end $$;
revoke all on function ccc_private.cc_decide_proposal(uuid,boolean) from public,anon;
grant execute on function ccc_private.cc_decide_proposal(uuid,boolean) to authenticated;


grant usage on schema ccc_private to authenticated;
create function public.cc_consume_ai() returns boolean language sql security invoker set search_path='' as $$ select ccc_private.cc_consume_ai() $$;
create function public.cc_decide_proposal(proposal_id uuid,approve boolean) returns uuid language sql security invoker set search_path='' as $$ select ccc_private.cc_decide_proposal(proposal_id,approve) $$;
revoke all on function public.cc_consume_ai(),public.cc_decide_proposal(uuid,boolean) from public,anon;
grant execute on function public.cc_consume_ai(),public.cc_decide_proposal(uuid,boolean) to authenticated;
create index cc_messages_user_idx on public.cc_messages(user_id);

-- Scheduler-only functions; never callable using a browser publishable key.
create function public.cc_claim_sources() returns setof public.cc_sources language sql security invoker set search_path='' as $$
 update public.cc_sources set next_scan=now()+interval '10 minutes'
 where id in (select id from public.cc_sources where enabled and authorized and next_scan<=now() order by next_scan for update skip locked limit 3)
 returning *;
$$;
create function public.cc_commit_scan(source uuid,jobs jsonb,scanned_at timestamptz) returns void language plpgsql security invoker set search_path='' as $$
declare s public.cc_sources; begin
 select * into strict s from public.cc_sources where id=source for update;
 if not s.authorized or not s.enabled then raise exception 'Source disabled';end if;
 insert into public.cc_discovered_jobs(user_id,source_id,external_id,title,location,source_url,description,compensation,published_at,verified_at,closed_at)
 select s.user_id,s.id,j->>'external_id',j->>'title',j->>'location',j->>'source_url',left(j->>'description',60000),j->'compensation',(j->>'published_at')::timestamptz,scanned_at,null
 from jsonb_array_elements(jobs) j
 on conflict(source_id,external_id) do update set title=excluded.title,location=excluded.location,source_url=excluded.source_url,description=excluded.description,compensation=excluded.compensation,published_at=excluded.published_at,verified_at=excluded.verified_at,closed_at=null;
 update public.cc_discovered_jobs set closed_at=scanned_at,verified_at=scanned_at
 where source_id=s.id and closed_at is null and not exists(select 1 from jsonb_array_elements(jobs) j where j->>'external_id'=external_id);
 update public.cc_sources set last_scan=scanned_at,last_error=null,next_scan=scanned_at+make_interval(hours=>s.frequency_hours) where id=s.id;
end $$;
revoke all on function public.cc_claim_sources() from public,anon,authenticated;
revoke all on function public.cc_commit_scan(uuid,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function public.cc_claim_sources(),public.cc_commit_scan(uuid,jsonb,timestamptz) to service_role;
grant all on public.cc_sources,public.cc_discovered_jobs to service_role;
commit;
