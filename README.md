# SHH Magazine

Supabase QR Code 管理、權限及測試環境設定請參考 [docs/SUPABASE_QR_SETUP.md](docs/SUPABASE_QR_SETUP.md)。

雙和醫訊數位閱讀暨 QR 成效追蹤平台（Pilot）。

## Source of truth

本 GitHub repository 是本專案唯一 source of truth。後續規格、Mockup、程式碼與 Action Items 均以 `main` 為準，不再以聊天中產生的 ZIP 版本作為主版本。

## Pilot 目標

2026/09–10 先進行真實場域 Pilot，累積兩個月資料，再於 2026/11 評估是否正式交資訊室部署。

核心流程：

```text
線下曝光
→ QR Entry
→ 對應內容
→ Mobile Reader / 醫師掛號頁
→ Engagement Analytics
→ Admin 分析
```

## 架構原則

> One App / One Deployment / One Domain

正式預期：

```text
magazine.shh.tmu.edu.tw
├── /                  Public
├── /issues            Public
├── /read/*            Public
├── /q/*               Public QR Router
└── /admin             Protected Admin
```

公開網站不顯示 Tracking、Analytics Debug 或 Admin 入口；`/admin` 為同一套 Next.js App 內的 protected route。

## Brand

統一品牌色：`#009fa8`

## Current MVP

- Public preview: <https://shh-magazine.vercel.app>
- Published issues: 2026-06, 2026-07, 2026-08, and the 2026-09 Pilot issue
- Primary public acceptance viewport: 375/390px mobile
- Current handoff status and known gaps: [`docs/HANDOFF.md`](docs/HANDOFF.md)
- First-time Codex guide: [`docs/COLLEAGUE_QUICKSTART.md`](docs/COLLEAGUE_QUICKSTART.md)
- QR analytics setup: [`docs/QR_ANALYTICS_SETUP.md`](docs/QR_ANALYTICS_SETUP.md)
- Hosting and quota estimate: [`docs/HOSTING_CAPACITY_AND_QUOTAS.md`](docs/HOSTING_CAPACITY_AND_QUOTAS.md)

The PDF reader supports mixed portrait/landscape page ratios, vertical lazy rendering, page links, and button zoom. The repository still uses demo placement/creative data and a best-effort analytics adapter; see the handoff document before creating Pilot QR codes.

## Local development

```bash
npm ci
cp .env.example .env.local
npm test
npm run lint
npm run build
npm run dev
```

Do not commit `.env.local` or real credentials.

## Start here

1. 讀 `docs/START_HERE.md`
2. 讀 `CODEX.md`
3. 讀 `docs/HANDOFF.md`
4. 第一次使用 Codex 請讀 `docs/COLLEAGUE_QUICKSTART.md`
5. 讀 `docs/` 全部產品／追蹤／Reader／部署／容量規格
6. Mockup 在 `mockup/`
7. 執行任務依 `ACTION_ITEMS.md`

## Codex

Codex 每次開始工作前先：

```text
git status
→ git pull --ff-only
→ read CODEX.md + docs
→ implement
→ npm run lint
→ npm run build
→ commit / push
```
