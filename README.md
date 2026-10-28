# Career Command Center 2.0

A Next.js application built alongside the existing `index.html` client, using the existing Supabase project `qddptxenlodonpgyeovl`. The original page and Edge Function are unchanged.

## Run locally

Use Node.js 24. Copy `.env.example` to `.env.local` and configure values locally; never commit that file.

```sh
npm ci
npm run dev
```

If macOS sandboxing prevents Turbopack filesystem watching, use `npm run dev -- --webpack`. Build and validation:

```sh
npm test
npm run typecheck
npm run build
```

For the standalone production server, copy `.next/static` to `.next/standalone/.next/static`, then run `node .next/standalone/server.js`. The Dockerfile performs that packaging.

## Included

- Responsive dashboard, stage-distribution chart, deadlines, follow-ups, editable company priority ratings, searchable records, status/location/salary filters, application Kanban, networking and interaction log, daily/weekly/overdue planner, downloadable progress report.
- Supabase magic-link authentication; server routes validate the bearer token with `auth.getUser()` and use the user's JWT for RLS-protected access.
- OpenAI Agents SDK copilot with streamed text and tool progress, durable conversations, bounded history and usage, read tools, approval-only creates and updates across all six record types.
- Separate AI job assessment with strict structured output, five weighted ratings, missing-evidence coverage, work-authorization evidence and a confirmation step before ratings are saved.
- PDF resume and PDF/text job descriptions; downloadable Markdown analysis, missing skills, suggestions, and interview questions.
- Greenhouse, Lever and Ashby public-feed adapters; user-configured sources, job-family filtering, stable-ID deduplication, atomic scan commits, closure/reopening detection, leases, timeouts and delayed retry after failures/rate limits.
- Additive migration and automated PostgreSQL-compatible isolation/approval/ingestion tests, plus unit tests and GitHub Actions CI.

## Release state

The code builds and tests locally. **It is not a verified production deployment.** The migration is provided but has not been applied to the live project. Live AI calls, real-account browser flows, and scheduled production scans require configuration and acceptance testing. See [deployment](docs/DEPLOYMENT.md), [audit and architecture](docs/ARCHITECTURE.md), and [verification](docs/VERIFICATION.md).

No sample vacancies, candidate experience, salary, or sponsorship claims are seeded. Nothing sends recruiter messages or submits applications. Such requests produce drafts only.
