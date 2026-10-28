# Deployment and activation

## Required configuration

| Variable | Where | Purpose |
|---|---|---|
| NEXT_PUBLIC_SUPABASE_URL | Build and runtime | Existing project URL |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Build and runtime | Public browser key; the existing public key is a fallback |
| OPENAI_API_KEY | Server only | Copilot, matching and PDF analysis |
| OPENAI_MODEL | Server only | Defaults to gpt-4.1-mini; choose a model available to your project supporting tools, PDFs and structured output |
| CRON_SECRET | Server only | Long random shared secret for scheduler authorization |
| SUPABASE_SECRET_KEY | Server only | Existing project's secret/service-role key, only for the scheduled ingestion route |

Do not reuse an OpenAI key in a NEXT_PUBLIC variable. Do not commit .env.local. An Edge Function secret is not automatically available to the Next.js server; configure it separately. No missing secret has been assumed or retrieved from the user's machine.

## Database migration

`supabase/migrations/20261027203813_career_command_center_v2.sql` has been applied to `qddptxenlodonpgyeovl`, recorded remotely as `20261028030610_career_command_center_v2`. Do not apply it again. It adds five nullable rating columns to opportunities; conversations, messages, immutable proposals, discovery sources/jobs; private usage counters; and narrowly scoped functions. It does not drop, rename, truncate, or replace existing tables or policies. It is transactional and tested against an isolated PostgreSQL-compatible engine.

The existing schema predates this repository's migrations. **Do not blindly run db reset, db push, or migration repair against production.** First establish a baseline with the current Supabase CLI and compare remote migration history. Apply this additive migration once through the Supabase dashboard/management migration tooling after review; reconcile its recorded version with the repository. Rerun table/policy inspection and advisors afterward. The live migration succeeded on October 27, 2026 (America/New_York). Post-migration inspection confirmed RLS on all existing and new tables. The private usage table intentionally has no direct-access policy. The pre-existing leaked-password-protection warning remains.

Rollback strategy: roll the application deployment back to the old version. Leave additive tables/columns in place. Removing them could destroy newly created user data and requires a separate backup/review process.

## Vercel

Import the existing `plaperche/career-command-center` repository, select the implementation branch for preview, use the repository root, Next.js preset, Node 24, `npm ci`, and `npm run build`. Set server secrets and public build-time values. Verify the target plan permits the cron frequency and 120-second route duration; otherwise use an external scheduler with the same authenticated endpoint.

`vercel.json` invokes `/api/discovery?cron=1` once daily at 12:00 UTC (within Vercel Hobby timing precision). Vercel supplies `Authorization: Bearer <CRON_SECRET>`. Each source has an independent 6–168 hour interval; on Hobby, the effective minimum scan interval is one day because jobs run at the next worker tick. For more than three simultaneously due sources, invoke the worker more often to drain the bounded queue. The scheduler never accesses user conversations or resumes.

Add the exact preview/production origin to Supabase Authentication redirect URL allowlists, preserving existing GitHub Pages URLs. No password/auth-provider settings need to change. Test magic-link login on the same browser that requested it.

GitHub Pages can continue serving the original index.html, but **cannot run the Next.js API, streaming or scheduled worker**. Do not point the 2.0 release at static Pages hosting.

## Docker / another Node host

Build using `docker build -t career-command-center .`, supplying public configuration as build args when changing the existing project. Start with `docker run --env-file .env.local -p 3000:3000 career-command-center`. Configure TLS and an upstream request-size limit of 11 MB or less. Preserve streaming (disable proxy buffering), private/no-store caching and timeout >=120 seconds.

Configure an external scheduler to GET the cron endpoint with the Authorization header. Do not place its secret in the URL. No local operating-system cron has been installed by this task.

## Activation acceptance checklist

1. Migration already applied; verify the recorded remote migration before any further schema changes.
2. Configure server secrets and Supabase redirect URLs.
3. Verify sign-in, refresh, sign-out, expired-token rejection and two-account isolation with real test accounts.
4. Save a real company/opportunity; confirm the dashboard reflects the saved record.
5. Converse with the copilot, approve/reject a proposed action, reload the conversation, and verify replay fails.
6. Upload a non-sensitive test PDF and job description; review/download the report. Test invalid and oversized files.
7. Generate an AI match and verify undisclosed salary remains null, then explicitly save the ratings.
8. Configure one authorized board; run the worker, inspect timestamps, rerun to verify deduplication, simulate a failure in staging and verify no false closures.
9. Review logs, usage limits, provider spending caps, database advisors, mobile layout and accessibility.
10. Promote the preview only after these live tests pass. No application submission or external messaging integration is included.
