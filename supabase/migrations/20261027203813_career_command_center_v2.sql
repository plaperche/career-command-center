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
 kind text not null check(kind in ('create_action','update_opportunity')),payload jsonb not null,
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
declare p public.cc_proposals; result uuid; begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 select * into p from public.cc_proposals where id=proposal_id and user_id=auth.uid() for update;
 if not found or p.status<>'pending' or p.expires_at<now() then raise exception 'Proposal unavailable';end if;
 if not approve then update public.cc_proposals set status='rejected' where id=p.id; return null;end if;
 if p.kind='create_action' then
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
