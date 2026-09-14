import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("issue management schema is additive, protected, and keeps published assets separate", async () => {
  const migration = await source("supabase/migrations/20260914000000_magazine_management.sql");

  assert.match(migration, /create table public\.magazine_issues/i);
  assert.match(migration, /homepage_headline[\s\S]*homepage_summary/i);
  assert.match(migration, /outpatient_start_page[\s\S]*outpatient_end_page[\s\S]*shuttle_page/i);
  assert.match(migration, /is_latest boolean/i);
  assert.match(migration, /status text[\s\S]*draft[\s\S]*published[\s\S]*archived/i);
  assert.match(migration, /magazine-staging/);
  assert.match(migration, /magazine-public/);
  assert.match(migration, /admins manage magazine issues/i);
  assert.match(migration, /published issues are public/i);
  assert.doesNotMatch(migration, /drop\s+(table|column)|truncate|delete\s+from/i);
});

test("admin issue manager supports create, edit, PDF cover generation, publish, and archive", async () => {
  const [dashboard, manager, issueApi, uploadApi] = await Promise.all([
    source("components/AdminDashboard.tsx"),
    source("components/IssueManager.tsx"),
    source("app/api/admin/issues/route.ts"),
    source("app/api/admin/issues/upload-url/route.ts"),
  ]);

  assert.match(dashboard, /醫訊管理/);
  for (const label of [
    "首頁標題", "首頁摘要", "正式期號", "正式發行日期",
    "門診時刻表 PDF 頁次", "接駁車資訊 PDF 頁次", "封面正式標題",
  ]) assert.match(manager, new RegExp(label));
  assert.match(manager, /pdfjs-dist/);
  assert.match(manager, /canvas\.toBlob/);
  assert.match(manager, /image\/jpeg/);
  assert.match(manager, /儲存草稿/);
  assert.match(manager, /發布/);
  assert.match(manager, /下架/);
  assert.match(issueApi, /requireAdmin\(\)/);
  assert.match(issueApi, /set_as_latest/);
  assert.match(issueApi, /original_issue_id/);
  assert.match(uploadApi, /createSignedUploadUrl/);
});

test("public issue data comes from Supabase with a legacy fallback and latest metadata", async () => {
  const [content, home, latest, qrApi, analyticsApi] = await Promise.all([
    source("lib/content.ts"),
    source("app/page.tsx"),
    source("app/latest/[section]/route.ts"),
    source("app/api/admin/qr-routes/route.ts"),
    source("app/api/admin/analytics/route.ts"),
  ]);

  assert.match(content, /from\("magazine_issues"\)/);
  assert.match(content, /issuesData/);
  assert.match(content, /is_latest/);
  assert.match(home, /await getLatestIssue\(\)/);
  assert.match(latest, /await getLatestIssue\(\)/);
  assert.match(qrApi, /await getIssue\(issueId\)/);
  assert.match(analyticsApi, /await getIssue\(issueId\)/);
});

