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
