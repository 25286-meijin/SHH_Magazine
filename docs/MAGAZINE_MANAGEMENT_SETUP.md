# 醫訊管理設定與操作

## 範圍

`/admin` 的「醫訊管理」提供既有與未來醫訊的新增、修改、儲存草稿、發布及下架。管理員可編輯首頁標題、首頁摘要、正式期號、正式發行日期、封面正式標題、門診時刻表頁次、接駁車頁次及是否設為最新一期。

日常操作不需要進入 Supabase，也不需要修改程式碼。Supabase 僅作為登入、資料庫與檔案儲存後端。

## 一次性測試環境設定

依序執行既有 QR migrations 後，再執行：

```text
supabase/migrations/20260914000000_magazine_management.sql
```

它會建立：

- `magazine_issues`：醫訊 metadata、狀態及最新一期標記。
- `magazine_issue_aliases`：正式期號修改後保留舊網址相容性。
- `magazine-staging`：private 暫存上傳。
- `magazine-public`：已驗證 PDF 與 JPG 的公開讀取位置。
- 管理員 RLS 與「設定最新一期／下架」交易函式。

不需要新增環境變數；沿用 QR 功能已使用的 Supabase URL、publishable key 與 server-only secret。禁止把任何值提交到 Git。

## 新增與更新

1. 管理員登入 `/admin`，選擇「醫訊管理」。
2. 新增醫訊或編輯既有醫訊。
3. 填寫正式資料並選擇 PDF。
4. 系統以 PDF 第一頁自動產生 JPG 封面預覽。
5. 選擇「儲存草稿」或「發布」。
6. 若設為最新一期，首頁、`/latest/outpatient`、`/latest/shuttle` 與 QR 月份選項會從同一筆 metadata 自動更新。

發布前會檢查期號格式、必要文字、頁碼順序、PDF/JPG 格式，以及設定頁碼是否超過 PDF 總頁數。驗證失敗不會取代原本有效資料。

## 既有資產與相容性

既有醫訊仍使用 repository 內的 `/demo/issues/YYYY-MM.pdf` 與 `/demo/covers/YYYY-MM.jpg`，不需要搬移。後台新上傳或替換的檔案才存入 Supabase Storage。

正式期號修改後，舊 `/issues/YYYY-MM`、`/read/YYYY-MM` 會透過 alias 找到新期號；既有 QR topic、route 與匿名掃碼歷史也會同步保留。下架只改為 `archived`，不物理刪除檔案或歷史資料。

## 權限

- 公開使用者只能閱讀 `published` 醫訊。
- 只有 `app_metadata.role=admin` 的登入使用者能新增、修改、發布、下架或上傳。
- Secret key 只存在伺服器環境，不會傳到瀏覽器。
- 正式 Vercel 必須由專案負責人另行審核；測試作業不得修改正式設定。
