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
  assert.match(migration, /status text[\s\S]*draft[\s\S]*published/i);
  assert.match(migration, /magazine-staging/);
  assert.match(migration, /magazine-public/);
  assert.match(migration, /admins manage magazine issues/i);
  assert.match(migration, /published issues are public/i);
  assert.doesNotMatch(migration, /drop\s+(table|column)|truncate|delete\s+from/i);
});

test("admin issue manager supports create, edit, PDF cover generation, publish, and permanent deletion", async () => {
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
  assert.match(manager, /立即發布/);
  assert.match(manager, /排程發布/);
  assert.match(manager, /排程日期/);
  assert.match(manager, /排程時間/);
  assert.match(manager, /確認發布/);
  assert.doesNotMatch(manager, /儲存草稿/);
  assert.doesNotMatch(manager, /門診時刻表 PDF 頁次（結束，可留空）/);
  assert.doesNotMatch(manager, /期號補充資訊（選填）/);
  assert.match(manager, />門診時刻表 PDF 頁次</);
  assert.match(manager, /下架/);
  assert.match(manager, /此期為目前最新一期，永久下架前請先指定新的最新一期。/);
  assert.match(manager, /新的最新一期[\s\S]*select value=\{replacementLatestId\}/);
  assert.match(manager, /issues\.filter\(\(issue\) => issue\.status !== "scheduled"\)/);
  assert.doesNotMatch(manager, /重新發布/);
  assert.doesNotMatch(manager, /MAGAZINE MANAGEMENT/);
  assert.doesNotMatch(manager, /新增或更新醫訊資料，只需上傳 PDF/);
  assert.doesNotMatch(manager, /<h2>醫訊管理<\/h2>/);
  assert.match(issueApi, /requireAdmin\(\)/);
  assert.match(issueApi, /set_as_latest/);
  assert.match(issueApi, /original_issue_id/);
  assert.match(issueApi, /請從各期醫訊管理選擇該期編輯/);
  assert.match(issueApi, /pdfjs-dist\/legacy\/build\/pdf\.worker\.mjs/);
  assert.match(uploadApi, /createSignedUploadUrl/);
});

test("replacement latest validation applies only to permanent deletion", async () => {
  const issueApi = await source("app/api/admin/issues/route.ts");
  const saveSection = issueApi.slice(issueApi.indexOf("async function saveIssue"), issueApi.indexOf("async function permanentlyDeleteIssue"));
  const deleteSection = issueApi.slice(issueApi.indexOf("async function permanentlyDeleteIssue"));

  assert.doesNotMatch(saveSection, /replacement_latest_issue_id/);
  assert.match(deleteSection, /replacement_latest_issue_id/);
  assert.match(deleteSection, /if \(issue\?\.is_latest\)/);
});

test("permanent issue deletion is the only removal path and is storage-retryable", async () => {
  const [migration, retirement, manager, issueApi, deletion] = await Promise.all([
    source("supabase/migrations/20260924000000_permanent_issue_deletion.sql"),
    source("supabase/migrations/20260929000000_remove_legacy_archive.sql"),
    source("components/IssueManager.tsx"),
    source("app/api/admin/issues/route.ts"),
    source("lib/issue-deletion.ts"),
  ]);

  assert.match(migration, /create table public\.magazine_issue_deletion_jobs/i);
  assert.match(migration, /create or replace function public\.begin_magazine_issue_deletion/i);
  assert.match(migration, /delete from public\.qr_events/i);
  assert.match(migration, /delete from public\.qr_routes/i);
  assert.match(migration, /delete from public\.qr_topics/i);
  assert.match(migration, /delete from public\.magazine_issue_aliases/i);
  assert.match(migration, /delete from public\.magazine_issues/i);
  assert.match(migration, /replacement_issue_id/i);
  assert.match(migration, /public\.is_admin\(\)/i);
  assert.match(retirement, /drop function if exists public\.archive_magazine_issue\(text, text\)/i);
  assert.match(retirement, /status in \('draft', 'scheduled', 'published'\)/i);

  assert.match(manager, /確定永久下架此期醫訊？/);
  assert.match(manager, /下架後，此期醫訊、PDF、封面、QR Code 及所有掃碼統計紀錄將永久刪除，無法復原。/);
  assert.match(manager, /醫訊期號/);
  assert.match(manager, /醫訊標題/);
  assert.match(manager, /確認永久下架/);
  assert.match(manager, /正在永久下架並清除相關資料，請稍候…/);
  assert.match(manager, /deleteInFlightRef/);
  assert.match(manager, /deletionConfirmation !== selected\.issue_id/);
  assert.doesNotMatch(manager, /資料、PDF 與掃碼紀錄會保留/);
  assert.doesNotMatch(manager, /window\.confirm|confirm\(/);

  assert.match(issueApi, /export async function DELETE/);
  assert.match(manager, /method: "DELETE"/);
  assert.doesNotMatch(issueApi, /action === "archive"|action === "permanent_delete"/);
  assert.match(issueApi, /confirmation_issue_id/);
  assert.match(issueApi, /begin_magazine_issue_deletion/);
  assert.match(issueApi, /cleanupIssueStorage/);
  assert.match(issueApi, /magazine_issue_deletion_jobs/);
  assert.match(issueApi, /revalidateIssuePages/);
  assert.match(issueApi, /頁面快取更新失敗/);
  assert.match(deletion, /magazine-public/);
  assert.match(deletion, /magazine-staging/);
  assert.match(deletion, /issues\/\$\{issueId\}/);
  assert.match(deletion, /covers\/\$\{issueId\}/);
  assert.doesNotMatch(deletion, /repositoryCopiesRetained|retainedRepositoryPaths/);
});

test("scheduled publishing is additive, retryable, and driven by Supabase cron", async () => {
  const [migration, manager, content, issueApi] = await Promise.all([
    source("supabase/migrations/20260914010000_scheduled_magazine_publishing.sql"),
    source("components/IssueManager.tsx"),
    source("lib/content.ts"),
    source("app/api/admin/issues/route.ts"),
  ]);

  assert.match(migration, /scheduled_publish_at timestamptz/i);
  assert.match(migration, /set_latest_on_publish boolean/i);
  assert.match(migration, /schedule_error text/i);
  assert.match(migration, /publish_due_magazine_issues/i);
  assert.match(migration, /cron\.schedule/i);
  assert.doesNotMatch(migration, /drop\s+(table|column)|truncate|delete\s+from/i);
  assert.match(manager, /排程中/);
  assert.match(manager, /Asia\/Taipei/);
  assert.match(manager, /min=\{taipeiNow\.date\}/);
  assert.match(manager, /min=\{form\.schedule_date === taipeiNow\.date \? taipeiNow\.time : undefined\}/);
  assert.match(content, /"scheduled"/);
  assert.match(issueApi, /scheduled_publish_at/);
  assert.match(issueApi, /Date\.parse\(scheduledPublishAt!\) <= Date\.now\(\)/);
});

test("admin preview is protected and disables all reader tracking", async () => {
  const [preview, reader, tracking] = await Promise.all([
    source("app/admin/preview/issues/[issueId]/page.tsx"),
    source("components/PdfReader.tsx"),
    source("hooks/useEngagementTracking.ts"),
  ]);

  assert.match(preview, /requireAdmin\(\)/);
  assert.match(preview, /getManagedIssue/);
  assert.match(preview, /trackingEnabled=\{false\}/);
  assert.match(reader, /trackingEnabled/);
  assert.match(tracking, /enabled/);
  assert.match(tracking, /if \(!enabled\) return/);
  assert.doesNotMatch(preview, /\/q\//);
});

test("public issue data uses uncached Supabase state without a repository fallback", async () => {
  const [content, supabaseServer, home, latest, qrApi, analyticsApi] = await Promise.all([
    source("lib/content.ts"),
    source("lib/supabase/server.ts"),
    source("app/page.tsx"),
    source("app/latest/[section]/route.ts"),
    source("app/api/admin/qr-routes/route.ts"),
    source("app/api/admin/analytics/route.ts"),
  ]);

  assert.match(content, /from\("magazine_issues"\)/);
  assert.doesNotMatch(content, /issuesData|legacyIssues|issues\.demo\.json/);
  assert.match(content, /is_latest/);
  assert.match(content, /unstable_noStore/);
  assert.match(content, /if \(error\) \(\{ data, error \} = await loadDirectIssue\(\)\)/);
  assert.match(content, /if \(error\) \{[\s\S]*retry = supabase\.from\("magazine_issues"\)/);
  assert.match(supabaseServer, /cache: "no-store"/);
  assert.doesNotMatch(home, /getLatestIssue/);
  assert.match(home, /const archive = await getPublishedIssues\(\);[\s\S]*const latest = archive\[0\]/);
  assert.match(content, /cache\(async \(id: string\)/);
  assert.match(latest, /await getLatestIssue\(\)/);
  assert.match(qrApi, /await getQrEligibleIssue\(issueId\)/);
  assert.match(analyticsApi, /from\("magazine_issues"\)[\s\S]*\.eq\("status", "published"\)/);
});
