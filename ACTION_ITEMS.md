# Action Items

## Supabase QR 管理與統計啟用前

- [ ] 院方確認可使用 Supabase、資料存放區域與資安規範。
- [ ] 專案負責人建立獨立測試專案並執行 QR tracking migration。
- [ ] 提供經核准的管理員電子郵件，並由 Owner 設定 `app_metadata.role=admin`。
- [ ] 在本機測試環境設定 Supabase URL、publishable key 與 server-only secret；不可提交 Git。
- [ ] 提供正式醫訊主題名稱及 8–9 個公播區域名稱；不可沿用 Demo 名稱。
- [ ] 確認永久正式網站網域後，才可下載並印製正式 QR 圖卡。
- [ ] 完成匿名 RLS、管理員權限、寫入失敗容錯及 375/390px 實機驗收。
- [ ] 正式上線前另開升級工作，將 Next.js 14 更新至仍受支援且已修補安全公告的版本；不可直接執行破壞性 `npm audit fix --force`。

## 醫訊管理測試環境啟用前

- [x] 完成 `/admin` 醫訊新增、修改、PDF 上傳、封面產生、草稿、發布、最新一期與下架程式。
- [x] 保留既有靜態醫訊資產，不要求一次搬移。
- [x] 以 alias 與 QR 關聯更新保護正式期號改名後的既有連結及紀錄。
- [x] 在 Supabase 測試專案執行 `20260914000000_magazine_management.sql`。
- [x] 在 Vercel Preview 驗證管理員登入、既有 metadata 讀取及 375/390px 版面；正式 Vercel 未修改。
- [ ] 使用核准 PDF 在 Vercel Preview 實際驗證 metadata 更新及檔案上傳。
- [ ] 使用正式但非個資的測試 PDF 完成新增／修改／發布／下架驗收，不建立虛構醫訊。
- [x] 完成台灣時間排程發布、排程 QR 與不計統計的管理員預覽程式及 migration。
- [x] 在 Supabase 測試專案執行排程 migration，確認每分鐘 Cron job 已啟用。
- [ ] 使用核准資料驗證排程成功、失敗保留及 QR 發布前後行為。

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
