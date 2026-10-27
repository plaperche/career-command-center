# Verification record

Local checks on 2026-10-27:

- `npm test`: 29 tests passed (before final packaging; rerun CI for authoritative results).
- `npm run typecheck`: passed.
- `npm run build`: passed; all six API routes compile for the Node runtime.
- npm installation audit: zero reported vulnerabilities at installation time.
- HTTP smoke checks: home 200; unauthenticated data and scheduler routes 401.
- Local production sign-in page rendered and was visually inspected at a narrow viewport; no sample vacancies were inserted.

Tests cover exact scoring weights, missing compensation, empty/out-of-range evidence, separate authorization evidence, validated confirmed mutations, ownership-field injection, unsafe links, salary ordering, source-ID deduplication, malformed feeds, arbitrary-path rejection, Retry-After, unlisted Ashby postings, missing/invalid/anonymous authentication, verified identity, owner-isolated conversations, cross-owner message insertion, single-use approval and rejection, immutable proposals, stale-write prevention, shared daily quota, scheduler access denial, scan upsert and closure behavior.

Database integration tests run the actual migration in PGlite with auth.uid, authenticated/anon/service_role roles and representative existing tables/policies. They do not claim to replace real Supabase Auth or production PostgREST testing. No production test users or business records were created.

Not verified: real authenticated browser session, live OpenAI output/streaming, PDF parsing through the live provider, live ATS board access, deployed cron, actual hosting deployment. These require the migration, user configuration and secrets. Tests do not certify legal work eligibility or factual vacancy accuracy beyond source data.
