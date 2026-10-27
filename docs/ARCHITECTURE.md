# Audit and implementation architecture

Audit date: 2026-10-27. Repository baseline: `aeb1508b4d13d1d139879b3f6d370d17b32833c9`.

## Existing infrastructure inspected

The default branch contained a single 17 KB `index.html`, a browser Supabase client and magic-link login. Its copilot called an existing `career-assistant` Supabase Edge Function. That function's source was inspected through the Supabase connector; it uses Chat Completions and returns proposed inserts for browser confirmation. No existing build system, tests or versioned migrations were present in the GitHub tree.

Inspected all public columns, primary keys and foreign keys, plus `pg_policies`. The six existing tables are companies, opportunities, applications, contacts, actions and interactions. Each has a UUID id, user_id linked to auth.users, and ownership policies for SELECT/INSERT/UPDATE/DELETE. UPDATE policies include both USING and WITH CHECK. All have RLS enabled. Explicit count queries showed zero rows in each table at audit time; no assumption about future contents is made. No account data, policies, authentication settings, or Edge Function was changed.

The old company weighting differs from the requested scheme. The new default is technical 25%, compensation 25%, growth 20%, location 15%, interests 15%. Missing values remain null. Partial scores normalize over available weights and display percentage coverage, so an apparent 100 with 75% coverage is explicitly provisional. Company weights can be customized and are stored locally per account; job assessment uses the required default weights.

Security advisor reported existing leaked-password protection disabled. This mainly matters if password login is enabled; this app preserves email-link login. Review the project's settings separately: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection .

## Implementation plan and boundaries

1. Audit and preserve baseline (completed).
2. Deliver vertical slice: verified session → read existing opportunities → conversational planning → durable proposed action → explicit approval → transactional write (implemented and locally tested; live acceptance pending credentials/migration).
3. Extend the same shell with CRUD, CRM, Kanban, planner, analytics, PDF intelligence and matching (implemented).
4. Introduce opt-in discovery with ATS adapters and a scheduler-only worker (implemented; activation pending server secrets and chosen authorized sources).
5. Review migration, configure deployment, run real-account end-to-end acceptance and launch (pending).

## Data flow

Browser → Next.js route → `auth.getUser(token)` → request-scoped Supabase client carrying that token → existing RLS.

Copilot → Agents SDK → validated read/proposal tools → immutable proposal table → explicit UI approval → guarded RPC with row lock → business write and approval status committed together. The model has no callable business mutation executor or communications tool. Approval is enforced by the application/database rather than relying on model instructions or an SDK approval flag. Proposals expire after 24 hours. Opportunity proposals include an expected update timestamp to prevent stale overwrites.

The two private SECURITY DEFINER functions (called through public SECURITY INVOKER wrappers) exist only for narrowly scoped, authenticated operations: increment a private usage counter and atomically decide an owned proposal. Both use an empty search_path, fully qualified names, an auth.uid check, and revoked PUBLIC/anon execution. Other user data reads/writes use SECURITY INVOKER/RLS. Scheduler RPCs are revoked from authenticated and anon and granted only to service_role. Its secret key is isolated to the cron route.

Conversations/messages and proposals have owner RLS. Message insertion additionally checks conversation ownership. Proposal updates are not exposed through table policies. No raw SQL tool or arbitrary URL-fetching tool is given to the agent. Record mutation schemas reject extra keys and ownership fields; linked records are checked under the caller's RLS. Existing foreign keys are not composite ownership constraints; legacy/direct clients can still attempt cross-owner relationships, so preserve and separately review the legacy client if it remains publicly maintained.

## Runtime and limits

Node.js 24 / Next.js 16, Agents SDK 0.21.0, Supabase JS 2.118.0, pinned in the lockfile. Node is used for streaming, files and scheduler requests. There is no Sites-specific hosting integration because this application targets the requested Next.js/GitHub/Supabase architecture, with Vercel and Docker deployment configurations.

30 AI requests per user per UTC database day, shared by chat, matching and resume routes; bounded outputs; six agent turns; 100-second copilot timeout. Provider project budgets should also be configured. Chat context is the last 16 messages; full retained conversations remain viewable. Dashboard loads at most 1,000 recent records per table; discovery view at most 500. These bounds are appropriate for an individual search; scalable pagination and aggregate SQL dashboards remain a future enhancement.

No PDF is saved in Supabase. Files/profile text go to OpenAI only when the user submits analysis, with Responses `store:false`; provider retention terms still apply. Copilot tracing is disabled to avoid sending saved records to an additional tracing stream. Logs contain event/type/record IDs, not resume text, message bodies, or secrets.

## Discovery semantics

Only approved public endpoint patterns are allowed; board slugs cannot introduce arbitrary hosts or paths. Redirects are rejected. Source authorization is explicitly affirmed in the UI. Company career-page HTML scraping is intentionally not implemented: add a dedicated adapter only after reviewing that company's permission and access requirements. Never bypass login, CAPTCHA or restrictions.

Jobs are deduplicated by (source_id, external_id); cross-provider matching is not guessed. Full-board successful responses are parsed and validated before an atomic commit. Jobs absent from a successful complete board response are marked no longer listed; failed/malformed/oversized feeds never close records. Reappearing IDs reopen existing records. Discovery and verification timestamps are distinct; no fabricated publication date is substituted. Source absence is not a legal or factual claim that a company permanently closed a vacancy.

A worker invocation claims up to three due sources using SKIP LOCKED and a ten-minute lease, then fetches sequentially. Successful scans schedule the configured interval. Failures defer at least an hour and honor larger Retry-After values up to a day. Job-family filters affect the display, not the completeness of closure detection.

## Evidence and authorization

F-1/OPT, STEM OPT, ITAR/export-control, citizenship and sponsorship wording are separate evidence fields. Extraction retains source text, including negation; it does not decide legal eligibility. A citizenship mention is not treated as a citizenship requirement without reading its context. Unknown never becomes confirmed. Immigration compatibility should be verified with the employer and the student's qualified advisor.

## Documentation consulted

- OpenAI SDK and streaming: https://developers.openai.com/api/docs/guides/agents/running-agents
- Approval design: https://developers.openai.com/api/docs/guides/agents/guardrails-approvals
- PDF inputs: https://developers.openai.com/api/docs/guides/file-inputs
- Supabase authentication: https://supabase.com/docs/guides/auth/server-side/advanced-guide
- Greenhouse: https://developers.greenhouse.io/job-board.html
- Ashby: https://developers.ashbyhq.com/docs/public-job-posting-api
- Lever: https://github.com/lever/postings-api
