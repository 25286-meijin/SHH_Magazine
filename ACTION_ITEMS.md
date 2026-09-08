# Action Items

Last updated: 2026-09-08

## MVP completed

- [x] One Next.js app for Public, QR Router, Reader, API, and protected Admin.
- [x] Public homepage, issue archive, and issue detail pages.
- [x] Real PDFs and covers for 2026-06, 2026-07, and 2026-08.
- [x] Mobile-first PDF.js Reader with lazy rendering and real per-page aspect ratios.
- [x] Desktop/mobile zoom controls and horizontal scrolling when enlarged.
- [x] Metadata-driven latest issue.
- [x] Outpatient and shuttle semantic routes using verified PDF page indices.
- [x] Public pages contain no Admin, analytics, or debug entry points.
- [x] QR route types and allowlisted official registration host validation.
- [x] Engagement timer pauses while hidden or idle and flushes on page hide.
- [x] Public Vercel deployment at <https://shh-magazine.vercel.app>.
- [x] Automated tests, lint, and production build passing at handoff.

## P0 - before distributing Pilot QR codes

- [x] Add the supplied 2026-09 issue metadata, PDF, cover, title, publish date, outpatient start page, and shuttle page.
- [ ] Replace the supplied 2026-09 Demo summary with an approved editorial summary.
- [ ] Replace demo placements with the confirmed 7-8 public-screen locations.
- [ ] Confirm the real 2026-09 Creative records and Creative x Placement matrix.
- [ ] Replace the Print Content placeholder with the approved official doctor registration URL.
- [ ] Generate and manually scan-test every final QR destination on a 375/390px phone.
- [ ] Confirm `ADMIN_USERNAME` and `ADMIN_PASSWORD` in Vercel, redeploy, and verify `/admin` returns `401` before login rather than `503`.
- [ ] Obtain the existing Apps Script source, Web App URL, Sheet/tab schema, de-identified sample rows, deployment access settings, and authentication method.
- [ ] Follow `docs/QR_ANALYTICS_SETUP.md` to map website payloads to Sheet columns before changing code.
- [ ] Configure a durable analytics destination and confirm `qr_entry`, `read_start`, and `engagement_heartbeat` events are actually stored.
- [ ] Improve QR-event delivery reliability without allowing tracking failure to block redirect.

## P1 - real analytics and Admin

- [ ] Replace hardcoded Admin demo metrics with real aggregated data.
- [ ] Connect Placement x Hour, weekday/hour, daily trend, creative/time, and engagement views to real events.
- [ ] Verify Asia/Taipei conversion against stored UTC timestamps.
- [ ] Validate QR entry, read start, progress, completion, active time, elapsed time, outbound, and error events end to end.
- [ ] Add unknown-QR, missing-PDF, analytics-failure, and redirect smoke tests in a deployed environment.

## Content follow-up

- [ ] Replace placeholder issue summaries.
- [ ] Populate issue feature cards when editorial content is approved.
- [ ] Decide whether Pilot PDFs remain in Git or move to an approved public asset host.

## Pilot review (after sufficient data)

- [ ] Compare placement, time-of-day, weekday, and creative performance.
- [ ] Review median active engagement, elapsed session time, read depth, outbound registration, and error rate.
- [ ] Decide on the official subdomain, information-office deployment, analytics integration, CMS workflow, and optional resume-reading feature.
