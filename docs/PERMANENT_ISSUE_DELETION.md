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

## Repository 靜態副本過渡保護

`data/legacy-asset-migration.json` 目前記錄 2026-06～2026-09 仍保留 Repository PDF/JPG。只刪除 Supabase 並不能讓舊部署的靜態 URL 失效，因此這四期在 `repositoryCopiesRetained` 為 `true` 時會被 API 阻擋永久下架。

正式網站完成 Storage 切換、舊路徑停止使用並由另一個經審核的變更移除靜態檔案後，才可解除這項過渡保護。系統不會把「Supabase 已刪除、Repository 仍公開」誤報為永久刪除成功。

