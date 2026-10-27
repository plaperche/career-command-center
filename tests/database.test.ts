import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, it, expect } from "vitest";
let db: PGlite;
const owner = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
async function asUser(id: string) {
  await db.exec(
    `reset role; set role authenticated; select set_config('request.jwt.claim.sub','${id}',false)`,
  );
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${owner}'),('${other}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,service_role;grant execute on function auth.uid() to authenticated,service_role;
 create table public.actions(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users,title text not null,notes text,due_on date,kind text,status text,priority text);
 create table public.opportunities(id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users,title text not null,status text,updated_at timestamptz not null default now());
 alter table public.actions enable row level security;alter table public.opportunities enable row level security;
 create policy own on public.actions to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
 create policy own on public.opportunities to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
 grant select,insert,update on public.actions,public.opportunities to authenticated;
 `);
  await db.exec(
    readFileSync(
      "supabase/migrations/20261027203813_career_command_center_v2.sql",
      "utf8",
    ),
  );
}, 30000);
afterAll(async () => await db.close());
it("preserves existing RLS and isolates conversations", async () => {
  await asUser(owner);
  const r = await db.query<{ id: string }>(
    "insert into cc_conversations(title) values('private') returning id",
  );
  await asUser(other);
  expect((await db.query("select * from cc_conversations")).rows).toHaveLength(
    0,
  );
  await expect(
    db.query(
      "insert into cc_messages(conversation_id,role,content) values($1,'user','intrusion')",
      [r.rows[0].id],
    ),
  ).rejects.toThrow();
});
it("executes an owned proposal once and rejects replay", async () => {
  await asUser(owner);
  const p = await db.query<{ id: string }>(
    `insert into cc_proposals(kind,payload) values('create_action','{"title":"Follow up","notes":"Review","due_on":null}') returning id`,
  );
  const id = p.rows[0].id;
  await asUser(other);
  await expect(
    db.query("select cc_decide_proposal($1,true)", [id]),
  ).rejects.toThrow();
  await asUser(owner);
  await db.query("select cc_decide_proposal($1,true)", [id]);
  expect((await db.query("select * from actions")).rows).toHaveLength(1);
  await expect(
    db.query("select cc_decide_proposal($1,true)", [id]),
  ).rejects.toThrow();
});
it("rejecting a proposal makes no business mutation", async () => {
  await asUser(owner);
  const p = await db.query<{ id: string }>(
    `insert into cc_proposals(kind,payload) values('create_action','{"title":"Do not create"}') returning id`,
  );
  await db.query("select cc_decide_proposal($1,false)", [p.rows[0].id]);
  expect((await db.query("select * from actions")).rows).toHaveLength(1);
});
it("makes proposals immutable through direct table access", async () => {
  await asUser(owner);
  await expect(
    db.query("update cc_proposals set payload='{}'"),
  ).rejects.toThrow();
});
it("stale opportunity proposals cannot overwrite later edits", async () => {
  await asUser(owner);
  const r = await db.query<{ id: string; updated_at: string }>(
    "insert into opportunities(user_id,title,status) values(auth.uid(),'Engineer','Discovered') returning id,updated_at",
  );
  const p = await db.query<{ id: string }>(
    "insert into cc_proposals(kind,payload) values($1,$2) returning id",
    [
      "update_opportunity",
      JSON.stringify({
        id: r.rows[0].id,
        expected_updated_at: r.rows[0].updated_at,
        status: "Shortlisted",
      }),
    ],
  );
  await db.query(
    "update opportunities set updated_at=now()+interval '1 minute' where id=$1",
    [r.rows[0].id],
  );
  await expect(
    db.query("select cc_decide_proposal($1,true)", [p.rows[0].id]),
  ).rejects.toThrow();
  expect(
    (await db.query<{ status: string }>("select status from opportunities"))
      .rows[0].status,
  ).toBe("Discovered");
});
it("enforces shared daily quota without allowing reset", async () => {
  await asUser(other);
  for (let i = 0; i < 30; i++)
    expect(
      (await db.query<{ cc_consume_ai: boolean }>("select cc_consume_ai()"))
        .rows[0].cc_consume_ai,
    ).toBe(true);
  expect(
    (await db.query<{ cc_consume_ai: boolean }>("select cc_consume_ai()"))
      .rows[0].cc_consume_ai,
  ).toBe(false);
  await expect(db.query("delete from ccc_private.usage")).rejects.toThrow();
});
it("denies browser access to scheduler functions", async () => {
  await asUser(owner);
  await expect(db.query("select cc_claim_sources()")).rejects.toThrow();
});
it("commits scans atomically, deduplicates and records closures", async () => {
  await asUser(owner);
  const s = await db.query<{ id: string }>(
    "insert into cc_sources(provider,board,authorized) values('lever','example',true) returning id",
  );
  const job = {
    external_id: "external-1",
    title: "Engineer",
    location: "NY",
    source_url: "https://example.com/jobs/1",
    description: "Description",
  };
  await db.exec("reset role;set role service_role");
  await db.query("select cc_commit_scan($1,$2,now())", [
    s.rows[0].id,
    JSON.stringify([job]),
  ]);
  await db.query("select cc_commit_scan($1,$2,now())", [
    s.rows[0].id,
    JSON.stringify([job]),
  ]);
  expect(
    (await db.query("select * from cc_discovered_jobs")).rows,
  ).toHaveLength(1);
  await db.query("select cc_commit_scan($1,'[]',now())", [s.rows[0].id]);
  expect(
    (
      await db.query<{ closed_at: string }>(
        "select closed_at from cc_discovered_jobs",
      )
    ).rows[0].closed_at,
  ).not.toBeNull();
});
