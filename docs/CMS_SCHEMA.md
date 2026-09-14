# CMS Schema

## Goal

正式版以同一套網站的 `/admin` 作為 Editorial CMS，Supabase 保存 metadata，Supabase Storage 保存後台新上傳的 PDF 與 JPG。既有 local JSON 與靜態檔案保留作為 migration 尚未啟用時的相容 fallback。

## Issue Fields

| Field | Required | Example |
|---|---|---|
| issue_id | yes | 2026-09 |
| year | yes | 2026 |
| month | yes | 9 |
| publish_date | yes | 2026-09-01 |
| status | yes | draft / published / archived |
| issue_number | no | 228 |
| cover_image | yes | URL/path |
| pdf_url | yes | official URL |
| pdf_storage_path | new uploads | Storage object path |
| cover_storage_path | new uploads | Storage object path |
| cover_title | no | 封面原始主題 |
| homepage_headline | yes | 首頁主標 |
| homepage_summary | yes | 40–100 字 |
| outpatient_start_page | yes | actual start page |
| outpatient_end_page | no | actual end page |
| shuttle_page | yes | actual page |
| is_latest | yes | true / false |
| updated_at | yes | ISO datetime |

## Feature Fields

每期 2–4 筆：

```text
feature_id
issue_id
order
title
summary
image (optional)
target_type = reader / outbound / issue
target_page
target_url
```

## Management workflow

管理員在 `/admin` 新增或編輯 metadata，只上傳 PDF；瀏覽器使用既有 `pdfjs-dist` 擷取第一頁並轉為 JPG。PDF/JPG 先以短效 signed upload URL 寫入 private staging bucket，伺服器驗證格式與 PDF 頁數後再發布至 public asset bucket。

下架採 `archived` 狀態，不物理刪除 metadata、QR 對應、歷史掃碼資料或既有資產。若下架目前最新一期，必須先指定另一個已發布期號為最新一期。

## Publish Rules

只有 `published` 可以進 Latest Issue。

Publish 前至少驗證：

- issue_id format
- cover exists
- PDF exists
- homepage_headline exists
- outpatient/shuttle page >= 1
- page numbers <= PDF page count when available

## Workflow

```text
管理員登入 /admin
→ 填 metadata 並上傳 PDF
→ 儲存草稿或發布
→ Published issue 立即由網站讀取
```

新資料驗證或上傳失敗時，不覆蓋原本已發布的有效紀錄。
