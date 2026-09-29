# 醫訊永久下架流程

## 執行順序

後台「下架這一期」現在代表永久刪除。管理員必須輸入完全相同的 `YYYY-MM` 期號；若刪除的是最新一期，仍須先選擇另一個已發布期號。

API 先呼叫 `begin_magazine_issue_deletion`。這個 PostgreSQL function 會在單一交易中：

1. 鎖定目標醫訊。
2. 必要時切換最新一期。
3. 依外鍵順序刪除 `qr_events`、`qr_routes`、`qr_topics`、`magazine_issue_aliases`、`magazine_issues`。
4. 建立 `magazine_issue_deletion_jobs`，保存 Storage 清理路徑及各資料表刪除筆數。

交易完成後，API 才清理：

- `magazine-public/issues/<issueId>/`
- `magazine-public/covers/<issueId>/`
- `magazine-public/<issueId>.pdf`、`<issueId>.jpg`（若存在）
- `magazine-staging` 中檔名完全符合 `<issueId>.pdf` 或 `<issueId>.jpg` 的暫存上傳

Storage 清理會再次列出物件驗證。全部完成後才移除 deletion job 並回報成功。任何部分失敗時，job 會保留 `storage_failed` 與錯誤訊息，後台顯示「安全重試清理」。重試不會再次刪除其他資料。

固定 `placements` 不在刪除交易內。

## Repository 與歷史 Deployment

2026-06～2026-09 的 PDF/JPG 已完成 Storage 遷移，現行 Repository 的靜態副本已移除，API 不再有按期號判斷的 409 保護。所有醫訊使用同一套永久刪除流程。

已建立的 Vercel Deployment 是 immutable 建置快照。新版程式無法刪除舊快照中的 `/demo/issues` 或 `/demo/covers`；須由對應 Vercel Project Owner 刪除歷史 Deployment。這項平台層歷史副本與現行後台可控制的 Database/Storage 永久刪除分開盤點。

## 2026-09-29 測試環境驗證結果

第二階段已在測試 Supabase 專案 `zolmotvxzxzlhgyyrnxn` 完成驗證：

- 第一階段的 4 個未被資料庫、前台或閱讀器引用的重複檔案已逐一刪除：`2026-07.pdf`、`2026-08.pdf`、`2026-09.pdf`、`issues/2026-07/2026-09/2026-09.pdf`。
- 獨立測試期號 `2099-12` 已驗證資料庫交易、Storage 清理、失敗工作保留及完成後移除工作紀錄；測試期號與其 PDF、封面、QR Code、掃碼事件均已清除。
- 經管理員明確授權，已永久刪除原本下架的 `2026-10`：`magazine_issues` 1 筆、`qr_topics` 1 筆、`qr_routes` 1 筆、`qr_events` 11 筆、`magazine_issue_aliases` 0 筆，並清除該期 public/staging Storage 物件。
- 刪除後複核：已發布醫訊 11 期、最新一期 `2026-09`、固定公播區域 9 個、啟用中的既有 QR Code 5 組、`2026-09` 歷史掃碼紀錄 11 筆，皆完整保留。
- 2026-06～2026-09 的現行 Repository 靜態 PDF/JPG 已移除；Supabase Storage 檔案與 metadata 保留並供現行前台使用。

以上是測試環境的資料操作紀錄，不代表正式 Vercel 已部署或正式環境資料已變更。

