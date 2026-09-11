# Supabase QR 管理與統計設定

這份文件只說明設定方式。Repository 不包含 Supabase 專案、正式帳號、金鑰、主題、區域或掃碼資料。

## 系統邊界

- 公開入口維持同一個 Next.js 網站：`/q/<opaque-id>`。
- `/q/` 在伺服器查詢可信任的 QR 對應、嘗試寫入 `qr_entry`，再直接以 HTTP 302 前往醫訊頁面。
- 寫入逾時或失敗不會阻止轉址。
- `/admin`、`/api/admin/*` 與 QR 圖檔下載都需要 Supabase Auth 使用者，且 `app_metadata.role` 必須是 `admin`。
- `qr_topics`、`placements`、`qr_routes`、`qr_events` 全部啟用 Row Level Security；匿名金鑰不能讀取這些資料。
- 公開寫入只發生在持有 server-only secret 的 Next.js 後端。不要把 secret key 放入瀏覽器。

## 1. 由專案負責人建立測試專案

先確認院方的資安、資料存放區域及帳號規範，再由具權限的人員建立 Supabase 測試專案。不要先使用正式環境。

## 2. 建立資料表與 RLS

在測試專案執行：

`supabase/migrations/20260911000000_qr_tracking.sql`

Migration 不會加入任何 Demo 或正式資料。執行後要確認匿名角色無法讀取四個資料表。

## 3. 建立管理員

1. 在 Supabase Auth 建立經核准的管理員帳號。
2. 由專案 Owner 把該帳號的 `app_metadata.role` 設為 `admin`。
3. 不要使用可由使用者自行修改的 `user_metadata` 判斷管理員權限。
4. 以一般無 `admin` 角色的測試帳號確認 `/admin` 與管理 API 都會被拒絕。

Repository 不會保存帳號或密碼。

## 4. 本機環境變數

複製 `.env.example` 的變數名稱到未納入 Git 的 `.env.local`：

```text
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=<測試專案 URL>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<測試專案 publishable key>
SUPABASE_SECRET_KEY=<測試專案 server-only secret key>
```

注意：

- `SUPABASE_SECRET_KEY` 絕對不可加上 `NEXT_PUBLIC_`。
- 不要在 Issue、Pull Request、聊天紀錄或截圖中貼出 secret。
- 正式 Vercel 環境變數必須由專案負責人另行審核與設定。

## 5. 建立正式主題與區域

登入 `/admin` 後依序：

1. 從網站現有期號中選擇期號，輸入正式醫訊主題名稱。
2. 輸入正式公播區域名稱及選填的位置說明。
3. 選擇主題與區域，產生專屬 QR Code。
4. 下載 PNG 或 SVG 製作公播圖卡。

同一主題在不同區域會產生不同的永久 QR ID。系統不允許同一組啟用中的主題／區域重複建立，也不會把既有 QR ID 改派給其他資料。

正式圖卡的 QR Code 應使用經核准的永久正式網域，不應使用短期 Vercel Preview 網址。

## 6. 驗收清單

- 未登入者無法進入 `/admin`、管理 API 或下載 QR 圖檔。
- 無 `admin` 角色的登入者仍無法進入管理功能。
- 匿名 Supabase client 無法直接 select 四個資料表。
- 同一主題搭配兩個區域時會得到兩個不同 QR ID。
- 掃 QR 後沒有中間頁，直接開啟對應醫訊。
- 模擬 `qr_events` 寫入失敗時，醫訊仍可開啟。
- 後台時間以 Asia/Taipei 顯示，並使用「QR 導入次數」而非「掃描率」。
- 以 375px、390px 驗收公開閱讀與管理操作。

