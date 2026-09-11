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
});

test("QR creation accepts an existing issue, an inline topic title, a page, and a placement", async () => {
  const [routeApi, dashboard] = await Promise.all([
    source("app/api/admin/qr-routes/route.ts"),
    source("components/AdminDashboard.tsx"),
  ]);

  assert.match(routeApi, /getIssue\(issueId\)/);
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
  const [page, login, dashboard] = await Promise.all([
    source("app/admin/page.tsx"),
    source("app/admin/login/page.tsx"),
    source("components/AdminDashboard.tsx"),
  ]);

  assert.match(page, /雙和醫院公播掃碼追蹤系統/);
  assert.match(login, /雙和醫院公播掃碼追蹤系統/);
  assert.match(dashboard, /雙和醫院公播掃碼追蹤系統/);
  assert.match(dashboard, /QR Code 掃碼總次數/);
  assert.match(dashboard, /掃碼主題統計/);
  assert.match(dashboard, /掃碼區域統計/);
  assert.match(dashboard, /完整掃碼紀錄/);
  assert.doesNotMatch(dashboard, /有導入的主題數|有導入的區域數/);
  assert.doesNotMatch(dashboard.slice(dashboard.indexOf("完整掃碼紀錄")), /<th>QR ID<\/th>/);
  assert.match(dashboard, /right\.qr_entries - left\.qr_entries/);
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
