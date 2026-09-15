import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Supabase schema protects tracking data with RLS", async () => {
  const migration = await source("supabase/migrations/20260911000000_qr_tracking.sql");

  for (const table of ["qr_topics", "placements", "qr_routes", "qr_events"]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
  assert.match(migration, /app_metadata[\s\S]*admin/i);
  assert.doesNotMatch(migration, /to\s+(anon|public)[\s\S]*for\s+select/i);
});

test("admin APIs require an authenticated admin on the server", async () => {
  const files = [
    "app/api/admin/catalog/route.ts",
    "app/api/admin/qr-routes/route.ts",
    "app/api/admin/analytics/route.ts",
    "app/api/admin/qr-routes/[qrId]/image/route.ts",
  ];
  const combined = (await Promise.all(files.map(source))).join("\n");

  for (const file of files) {
    assert.match(await source(file), /requireAdmin\(/);
  }
  assert.doesNotMatch(combined, /NEXT_PUBLIC_SUPABASE_SECRET|service_role/i);
});

test("QR identifiers are opaque and destinations come from trusted records", async () => {
  const [ids, route] = await Promise.all([
    source("lib/qr.ts"),
    source("app/q/[qrId]/route.ts"),
  ]);

  assert.match(ids, /randomBytes/);
  assert.match(ids, /qr_/);
  assert.match(route, /getStoredQrRoute/);
  assert.match(route, /recordQrEntry/);
  assert.match(route, /catch/);
  assert.match(route, /NextResponse\.redirect/);
});

test("QR downloads are generated only by an authenticated admin", async () => {
  const [manifest, imageRoute] = await Promise.all([
    source("package.json"),
    source("app/api/admin/qr-routes/[qrId]/image/route.ts"),
  ]);
  const packageJson = JSON.parse(manifest);

  assert.ok(packageJson.dependencies.qrcode);
  assert.match(imageRoute, /requireAdmin\(/);
  assert.match(imageRoute, /image\/(png|svg\+xml)/);
  assert.match(imageRoute, /Content-Disposition/);
});

test("public client events cannot choose their own topic or placement", async () => {
  const [eventRoute, tracking] = await Promise.all([
    source("app/api/events/route.ts"),
    source("lib/tracking.ts"),
  ]);

  assert.doesNotMatch(eventRoute, /creative_id:\s*payload|placement_id:\s*payload/);
  assert.match(eventRoute, /recordClientEvent/);
  assert.match(tracking, /\.eq\("entry_id", entryId\)/);
  assert.match(tracking, /topic_id: entry\.topic_id/);
  assert.match(tracking, /placement_id: entry\.placement_id/);
});

test("admin offers only the approved fixed placements and no placement manager", async () => {
  const [placements, catalog, dashboard, migration] = await Promise.all([
    source("lib/qr-placements.ts"),
    source("app/api/admin/catalog/route.ts"),
    source("components/AdminDashboard.tsx"),
    source("supabase/migrations/20260911020000_fixed_placements.sql"),
  ]);
  const approved = [
    "1F大廳", "2F大電視牆", "1F關防", "B基地美食廣場", "空橋直式",
    "雙和故事館", "骨科", "腎臟+泌尿科", "綜合檢查中心",
  ];

  for (const name of approved) {
    assert.match(placements, new RegExp(name.replace("+", "\\+")));
    assert.match(migration, new RegExp(name.replace("+", "\\+")));
  }
  assert.match(catalog, /FIXED_QR_PLACEMENTS/);
  assert.match(catalog, /requireAdmin\(/);
  assert.doesNotMatch(dashboard, /公播區域管理|新增公播區域|編輯區域/);
  assert.doesNotMatch(migration, /delete\s+from|drop\s+(table|column)|truncate/i);
});

test("QR routes can be deactivated without deleting tracking history", async () => {
  const [routeApi, dashboard] = await Promise.all([
    source("app/api/admin/qr-routes/route.ts"),
    source("components/AdminDashboard.tsx"),
  ]);

  assert.match(routeApi, /export async function PATCH/);
  assert.match(routeApi, /deactivated_at/);
  assert.doesNotMatch(routeApi, /\.delete\(/);
  assert.match(dashboard, /停用 QR/);
  assert.match(dashboard, /routes\.filter\(\(route\) => route\.active\)/);
  assert.doesNotMatch(dashboard, /保留歷史紀錄/);
});

test("QR creation accepts an existing issue, an inline topic title, a page, and a placement", async () => {
  const [routeApi, dashboard] = await Promise.all([
    source("app/api/admin/qr-routes/route.ts"),
    source("components/AdminDashboard.tsx"),
  ]);

  assert.match(routeApi, /getQrEligibleIssue\(issueId\)/);
  assert.match(routeApi, /page_number/);
  assert.match(routeApi, /title/);
  assert.match(routeApi, /`\/read\/\$\{issueId\}`/);
  assert.match(dashboard, /name="issue_id"/);
  assert.match(dashboard, /name="title"/);
  assert.match(dashboard, /name="page_number"/);
  assert.match(dashboard, /導入醫訊頁碼/);
});

test("stored page numbers are added to the direct reader redirect without changing old routes", async () => {
  const [qrLibrary, qrRoute] = await Promise.all([
    source("lib/qr.ts"),
    source("app/q/[qrId]/route.ts"),
  ]);

  assert.match(qrLibrary, /page_number/);
  assert.match(qrRoute, /storedRoute\.topic\.page_number/);
  assert.match(qrRoute, /searchParams\.set\("page"/);
  assert.match(qrRoute, /if \(storedRoute\.topic\.page_number\)/);
});

test("admin separates QR management from issue-filtered analytics", async () => {
  const [dashboard, analytics] = await Promise.all([
    source("components/AdminDashboard.tsx"),
    source("app/api/admin/analytics/route.ts"),
  ]);

  assert.match(dashboard, /QR Code 管理/);
  assert.match(dashboard, /掃碼統計/);
  assert.match(dashboard, /analyticsIssueId/);
  assert.match(analytics, /searchParams\.get\("issue_id"\)/);
  assert.match(analytics, /\.eq\("issue_id", issueId\)/);
  assert.match(analytics, /qr_topic_counts_by_issue/);
  assert.match(analytics, /qr_placement_counts_by_issue/);
});

test("admin uses the approved system name and shows only requested scan statistics", async () => {
  const [page, login, dashboard, styles] = await Promise.all([
    source("app/admin/page.tsx"),
    source("app/admin/login/page.tsx"),
    source("components/AdminDashboard.tsx"),
    source("app/globals.css"),
  ]);

  assert.match(page, /雙和醫院公播管理系統/);
  assert.match(login, /雙和醫院公播管理系統/);
  assert.match(login, /只有經核准並具有 admin 角色的帳號可以查看。/);
  assert.doesNotMatch(login, /QR 紀錄與統計/);
  assert.match(dashboard, /雙和醫院公播管理系統/);
  assert.doesNotMatch(`${page}\n${login}\n${dashboard}`, /雙和醫院公播掃碼追蹤系統/);
  assert.match(dashboard, /QR Code 掃碼總次數/);
  assert.match(dashboard, /掃碼主題統計/);
  assert.match(dashboard, /掃碼區域統計/);
  assert.match(dashboard, /完整掃碼紀錄/);
  assert.doesNotMatch(dashboard, /產生指定月份與頁碼的 QR Code，或依月份查看匿名 QR 導入紀錄。/);
  assert.doesNotMatch(dashboard, /這裡統計的是 QR 導入次數，不是掃描率，也不代表看過公播內容的總人數。/);
  assert.match(dashboard, /時間顯示為 Asia\/Taipei。/);
  assert.doesNotMatch(dashboard, /QR ENTRIES|QR CODE MANAGEMENT/);
  assert.match(dashboard, /className="section-description analytics-filter">先選擇醫訊月份/);
  assert.doesNotMatch(dashboard, /有導入的主題數|有導入的區域數/);
  assert.doesNotMatch(dashboard.slice(dashboard.indexOf("完整掃碼紀錄")), /<th>QR ID<\/th>/);
  assert.match(dashboard, /right\.qr_entries - left\.qr_entries/);
  assert.match(styles, /@media\(max-width:760px\)[\s\S]*\.admin-nav \.logo/);
});

test("admin defers QR data and fetches only the records shown by each view", async () => {
  const [dashboard, catalog, qrRoutes, analytics] = await Promise.all([
    source("components/AdminDashboard.tsx"),
    source("app/api/admin/catalog/route.ts"),
    source("app/api/admin/qr-routes/route.ts"),
    source("app/api/admin/analytics/route.ts"),
  ]);
  const catalogGet = catalog.slice(catalog.indexOf("export async function GET"), catalog.indexOf("export async function POST"));
  const qrGet = qrRoutes.slice(qrRoutes.indexOf("export async function GET"), qrRoutes.indexOf("export async function POST"));

  assert.match(dashboard, /if \(mode !== "qr" \|\| catalogLoaded\) return/);
  assert.match(dashboard, /setCatalogLoaded\(true\)/);
  assert.match(dashboard, /issuesOpened && <div hidden=\{mode !== "issues"\}>/);
  assert.doesNotMatch(catalogGet, /from\("qr_topics"\)/);
  assert.match(catalogGet, /select\("id,name,description,active"\)/);
  assert.match(qrGet, /\.eq\("active", true\)/);
  assert.match(analytics, /Promise\.all\(\[/);
  assert.match(analytics, /select\("id,received_at_utc,topic_title,placement_name"/);
  assert.doesNotMatch(analytics, /await getIssue\(issueId\)/);
});

test("scheduled issues can create permanent QR codes without public tracking before publication", async () => {
  const [dashboard, qrApi, qrRoute] = await Promise.all([
    source("components/AdminDashboard.tsx"),
    source("app/api/admin/qr-routes/route.ts"),
    source("app/q/[qrId]/route.ts"),
  ]);

  assert.match(dashboard, /預覽導入頁面/);
  assert.match(qrApi, /getQrEligibleIssue/);
  assert.match(qrRoute, /getIssue\(storedRoute\.topic\.issue_id\)/);
  assert.ok(qrRoute.indexOf("getIssue(storedRoute.topic.issue_id)") < qrRoute.indexOf("recordQrEntry(storedRoute"));
});

test("scan statistic cards share title styling and scroll after three rows", async () => {
  const [dashboard, styles] = await Promise.all([
    source("components/AdminDashboard.tsx"),
    source("app/globals.css"),
  ]);

  assert.match(dashboard, /statistics-section-title/);
  assert.match(dashboard, /count-list/);
  assert.match(styles, /\.statistics-section-title\s*\{/);
  assert.match(styles, /\.count-list\s*\{[^}]*max-height:\s*calc\(3\s*\*\s*48px\)/s);
  assert.match(styles, /\.count-list\s*\{[^}]*overflow-y:\s*auto/s);
});

test("admin opens the latest issue analytics with compact scrolling statistics", async () => {
  const [dashboard, styles, content] = await Promise.all([
    source("components/AdminDashboard.tsx"),
    source("app/globals.css"),
    source("lib/content.ts"),
  ]);
  const navigation = dashboard.slice(
    dashboard.indexOf('<nav className="admin-mode-nav"'),
    dashboard.indexOf("</nav>"),
  );

  assert.match(dashboard, /useState<"qr" \| "analytics" \| "issues">\("analytics"\)/);
  assert.match(dashboard, /publishedIssues\[0\]\?\.issue_id/);
  assert.match(dashboard, /loadAnalytics\(latestIssueId\)/);
  assert.ok(navigation.indexOf("掃碼統計") < navigation.indexOf("QR Code 管理"));
  assert.match(content, /b\.publish_date\.localeCompare\(a\.publish_date\)/);
  assert.match(dashboard, /scan-total-card/);
  assert.match(dashboard, /scan-total-number/);
  assert.match(dashboard, /records-table-wrap/);
  assert.match(dashboard, /records-scroll/);
  assert.match(styles, /\.count-panel\s*\{[^}]*display:\s*grid/s);
  assert.match(styles, /\.records-scroll\s*\{[^}]*max-height:\s*calc\(46px\s*\+\s*5\s*\*\s*48px\)/s);
  assert.match(styles, /\.records-scroll\s*\{[^}]*overflow-y:\s*auto/s);
});

test("scan total uses one text size and QR history scrolls after ten rows", async () => {
  const [dashboard, styles] = await Promise.all([
    source("components/AdminDashboard.tsx"),
    source("app/globals.css"),
  ]);

  assert.match(dashboard, /scan-total-value"><span className="scan-total-number accent">\{total\}<\/span> 次/);
  assert.match(styles, /\.scan-total-number\s*\{[^}]*font-size:\s*inherit/s);
  assert.match(dashboard, /qr-routes-table-wrap/);
  assert.match(dashboard, /qr-routes-scroll/);
  assert.match(styles, /\.scan-total-card \.scan-total-number\s*\{[^}]*color:\s*var\(--brand\)/s);
  assert.match(styles, /\.qr-routes-scroll\s*\{[^}]*max-height:\s*calc\(46px\s*\+\s*10\s*\*\s*74px\)/s);
  assert.match(styles, /\.qr-routes-scroll\s*\{[^}]*overflow-y:\s*auto/s);
});

test("QR images support protected inline preview and explicit downloads", async () => {
  const [dashboard, imageRoute] = await Promise.all([
    source("components/AdminDashboard.tsx"),
    source("app/api/admin/qr-routes/[qrId]/image/route.ts"),
  ]);

  assert.match(dashboard, /qr-preview/);
  assert.match(imageRoute, /searchParams\.get\("download"\)/);
  assert.match(imageRoute, /inline/);
  assert.match(imageRoute, /attachment/);
});

test("the additive migration preserves old QR routes while adding page and monthly reports", async () => {
  const migration = await source("supabase/migrations/20260911010000_qr_page_routing.sql");

  assert.match(migration, /alter table public\.qr_topics[\s\S]*add column if not exists page_number/i);
  assert.match(migration, /qr_topic_counts_by_issue/);
  assert.match(migration, /qr_placement_counts_by_issue/);
  assert.doesNotMatch(migration, /drop\s+(table|column)|delete\s+from|truncate/i);
});
