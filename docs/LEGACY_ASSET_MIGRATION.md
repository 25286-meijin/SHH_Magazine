# 2026-06～2026-09 靜態資產遷移

## 第一階段範圍

2026-06、2026-07、2026-08、2026-09 的 PDF 與封面原先由 Repository 的 `public/demo` 提供。第一階段已將相同檔案上傳至既有公開 bucket `magazine-public`，並將 `magazine_issues` 的四筆 metadata 更新為 Storage 公開網址與可追蹤的 Storage path。

固定路徑如下：

- PDF：`issues/<issueId>/<issueId>.pdf`
- 封面：`covers/<issueId>/<issueId>.jpg`

每份原始檔案的大小、SHA-256、頁數及目標路徑記錄於 `data/legacy-asset-migration.json`。現行應用程式只讀取 Supabase metadata 與 Storage URL；測試會確認 Repository 副本已不存在。

## Repository 副本移除

- `public/demo/issues/2026-06..09.pdf` 與 `public/demo/covers/2026-06..09.jpg` 已由現行 Repository 移除。
- `lib/content.ts` 不再以 `data/issues.demo.json` 作為公開頁面備援，避免已永久刪除的醫訊透過靜態 metadata 復活。
- 歷史 Vercel Deployment 是 immutable 建置快照；舊快照中的靜態檔案不會因新版 Repository 移除而消失，必須由該 Vercel Project Owner 另行刪除歷史 Deployment。
- 現行永久下架流程不再按期號分流，也不因歷史 Deployment 存在而阻擋。

## 驗收紀錄

- 四個 Storage PDF 與四張封面皆可由公開 URL 載入。
- 四份 PDF 皆為 17 頁。
- `/read/2026-06..09?page=17` 均載入 17 頁並將第 17 頁定位至可視區頂端。
- 現行資料庫保留 11 期已發布醫訊，2026-09 為最新一期；先前獲授權的 2026-10 測試／下架資料已永久刪除。

永久刪除 E2E 只使用獨立建立的測試醫訊，不使用現有 11 期、既有 QR Code 或歷史掃碼事件。
