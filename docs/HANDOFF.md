# SHH Magazine MVP Handoff

Last verified: 2026-09-14 (Asia/Taipei)

First-time Codex users should begin with `docs/COLLEAGUE_QUICKSTART.md`.

Before connecting Google Apps Script or Google Sheet, follow `docs/QR_ANALYTICS_SETUP.md`.

Before deciding whether the Pilot can remain on Vercel Hobby, read `docs/HOSTING_CAPACITY_AND_QUOTAS.md` for the PDF transfer, tracking-event, Apps Script, and Google Sheet capacity estimates.

## Repository and deployment

- GitHub: <https://github.com/wowiscircle/SHH_Magazine>
- Primary branch: `main`
- Public URL: <https://shh-magazine.vercel.app>
- Vercel scope/project: `shh10/shh-magazine`
- Architecture: one Next.js app, one deployment, one origin

The public homepage, archive, issue pages, PDF reader, outpatient route, and shuttle route return successfully. The active `/admin` route currently returns `503` because valid Basic Auth credentials are not available to that deployment. Environment variable names exist in Vercel, but their values must be checked and the site redeployed before Admin QA.

## Implemented MVP

- Metadata-driven homepage and archive.
- Published issues for 2026-06, 2026-07, 2026-08, and the 2026-09 Pilot issue.
- Local PDF and cover assets for all four issues.
- PDF.js reader with vertical lazy rendering, per-page aspect ratios, page query routing, desktop button zoom, mobile fit-width, and branded failure UI.
- Semantic `/latest/outpatient` and `/latest/shuttle` redirects. Current verified PDF page indices are 10 and 17.
- Placement, Creative x Placement, and Print Content QR route shapes.
- Opaque `entry_id`, server-side QR entry timestamp, reader progress, visibility/idle-aware engagement heartbeat, and best-effort event delivery.
- Protected Admin route and demo-only analytics dashboard layout.
- Public Vercel deployment with deployment-level SSO disabled.
- Supabase-backed QR Code management and protected scan statistics on the test branch.
- `/admin` magazine management for create/edit, PDF upload, automatic first-page JPG cover, draft/publish/latest/archive, with legacy issue fallback.

The magazine-management code and migration are on the test branch. The migration was executed successfully in the Supabase test project and the Preview can read the four existing issues. The admin and public page-routing layouts passed 375/390px browser checks. An actual PDF upload/save remains for owner acceptance because validation did not rewrite an existing issue or create fabricated content. Formal Vercel remains unchanged.

## Known gaps and blockers

1. `data/creatives.demo.json` and several `data/qr-routes.demo.json` records target `2026-09`, but they remain Demo mappings. Do not print or distribute them until the final Creative, Placement, and QR registry is confirmed.
2. Placement records are examples only. Replace them with the confirmed 7-8 Pilot locations and the final Creative x Placement matrix.
3. The Print Content destination is only the official hospital homepage placeholder. Replace it with the approved doctor registration URL.
4. `ANALYTICS_ENDPOINT` is only an adapter seam. Without a working endpoint, events are accepted but not durably stored.
5. `/admin` displays hardcoded demo metrics; it is not connected to real analytics data.
6. Issue summaries, including the supplied 2026-09 Demo summary, are placeholders and `features` arrays are empty.
7. Automated tests cover important source and data contracts, but full browser end-to-end coverage is still limited.

The intended analytics path is the existing Google Apps Script Web App writing append-only events to Google Sheet. Its script, endpoint, Sheet schema, and access settings are external and must be supplied before integration work.

## Local setup

```bash
git clone https://github.com/wowiscircle/SHH_Magazine.git
cd SHH_Magazine
npm ci
cp .env.example .env.local
npm test
npm run lint
npm run build
npm run dev
```

Default local URL: <http://localhost:3000>

Never commit `.env.local`. Set a long random Admin password and keep all real secrets outside Git.

## Adding the next issue (after test migration approval)

1. Log in to `/admin` and open 「醫訊管理」.
2. Enter only approved metadata and upload the official PDF.
3. Verify the generated first-page JPG cover and save a draft or publish.
4. If setting it as latest, verify the homepage, outpatient and shuttle links.
5. Test at 375px and 390px, then run the full validation commands below.

Existing repository PDFs and covers do not need to move. See `docs/MAGAZINE_MANAGEMENT_SETUP.md`.

## Required validation

```bash
npm test
npm run lint
npm run build
git status --short --branch
```

Public smoke checks:

```text
/
/issues
/issues/2026-08
/issues/2026-09
/read/2026-08
/read/2026-08?page=10
/read/2026-09
/read/2026-09?page=10
/latest/outpatient
/latest/shuttle
/q/p-story
/admin
```

## Deployment configuration

Required Vercel environment variable names are documented in `.env.example`:

- `NEXT_PUBLIC_SITE_URL`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `ADMIN_ANALYTICS_DEBUG`
- `ANALYTICS_ENDPOINT`

Do not put values in documentation or commits. After changing Vercel environment variables, create a new deployment before testing them.

## Recommended next milestone

Prepare the real 2026-09 Pilot dataset and assets first. Then connect a durable analytics destination and replace the Admin demo metrics with queries against that data. Keep the existing public MVP usable throughout the work.
