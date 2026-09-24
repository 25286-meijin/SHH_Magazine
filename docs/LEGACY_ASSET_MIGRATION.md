# 2026-06～2026-09 靜態資產遷移

## 第一階段範圍

2026-06、2026-07、2026-08、2026-09 的 PDF 與封面原先由 Repository 的 `public/demo` 提供。第一階段已將相同檔案上傳至既有公開 bucket `magazine-public`，並將 `magazine_issues` 的四筆 metadata 更新為 Storage 公開網址與可追蹤的 Storage path。

固定路徑如下：

- PDF：`issues/<issueId>/<issueId>.pdf`
- 封面：`covers/<issueId>/<issueId>.jpg`

每份原始檔案的大小、SHA-256、頁數及目標路徑記錄於 `data/legacy-asset-migration.json`，`tests/legacy-asset-migration.test.mjs` 會在 `npm test` 時驗證 Repository 副本仍與清單一致。

## Preview 安全措施

- Preview 階段不移除 `public/demo/issues/2026-06..09.pdf` 或 `public/demo/covers/2026-06..09.jpg`。
- 正式網站尚未完成 Supabase 切換前，Repository 副本仍是舊部署的安全備援。
- 只有在 Preview、正式切換與舊部署相依性全部驗收完成後，才能另行提出移除 Repository 副本的變更。
- 本階段不修改 schema，不刪除醫訊、QR Code、掃碼事件、排程或 Storage 物件。

## 驗收紀錄

- 四個 Storage PDF 與四張封面皆可由公開 URL 載入。
- 四份 PDF 皆為 17 頁。
- `/read/2026-06..09?page=17` 均載入 17 頁並將第 17 頁定位至可視區頂端。
- 資料庫盤點共 12 筆醫訊：2025-11～2026-09 為 `published`，2026-09 為最新一期；2026-10 為 `archived`。本階段未刪除任何一筆。

## 第二階段前置條件

永久下架功能必須在第一階段 Preview 經專案負責人確認後才開始。第二階段仍須使用獨立測試醫訊驗證，不得以現有 12 筆資料、既有 QR Code 或歷史掃碼事件作為刪除測試。
