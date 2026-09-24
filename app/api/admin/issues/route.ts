import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { adminErrorResponse, requireAdmin } from "@/lib/admin-auth";
import { getManagedIssues } from "@/lib/content";
import { cleanupIssueStorage, retainedRepositoryPaths } from "@/lib/issue-deletion";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

type ServiceClient = NonNullable<ReturnType<typeof createServiceSupabaseClient>>;

export async function GET() {
  try {
    await requireAdmin();
    const supabase = createServiceSupabaseClient();
    const [issues, deletionJobs] = await Promise.all([
      getManagedIssues(),
      supabase ? getDeletionJobs(supabase) : Promise.resolve([]),
    ]);
    return NextResponse.json({ ok: true, issues, deletion_jobs: deletionJobs });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  return saveIssue(request, null);
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.clone().json() as Record<string, unknown>;
    if (body.action === "archive") return archiveIssue(body);
    return saveIssue(request, cleanText(body.original_issue_id, 7));
  } catch (error) {
    return adminErrorResponse(error);
  }
}

async function saveIssue(request: NextRequest, originalIssueId: string | null) {
  try {
    const { user, supabase: userSupabase } = await requireAdmin();
    const body = await request.json() as Record<string, unknown>;
    const values = validateIssue(body);
    if (values.error) {
      return NextResponse.json({ ok: false, error: values.error }, { status: 400 });
    }
    const supabase = createServiceSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ ok: false, error: "Supabase 尚未設定" }, { status: 503 });
    }

    const currentId = originalIssueId || values.issue_id;
    const { data: existing, error: existingError } = await supabase
      .from("magazine_issues").select("*").eq("issue_id", currentId).maybeSingle();
    if (existingError) throw existingError;
    if (originalIssueId && !existing) {
      return NextResponse.json({ ok: false, error: "找不到要更新的醫訊" }, { status: 404 });
    }
    if (!originalIssueId && existing) {
      return NextResponse.json({
        ok: false,
        error: "這個正式期號已經存在，請從各期醫訊管理選擇該期編輯或重新發布",
      }, { status: 409 });
    }

    const largestPage = Math.max(
      values.outpatient_start_page,
      values.shuttle_page,
    );
    let assets = existing ? {
      pdf_url: existing.pdf_url as string,
      cover_image: existing.cover_image as string,
      pdf_storage_path: existing.pdf_storage_path as string | null,
      cover_storage_path: existing.cover_storage_path as string | null,
      pdf_page_count: existing.pdf_page_count as number | null,
    } : null;

    if (values.staging_pdf_path && values.staging_cover_path) {
      assets = await publishUploadedAssets(
        supabase,
        user.id,
        values.issue_id,
        values.staging_pdf_path,
        values.staging_cover_path,
        largestPage,
      );
    }
    if (!assets) {
      return NextResponse.json({ ok: false, error: "新增醫訊時必須上傳 PDF" }, { status: 400 });
    }
    if (assets.pdf_page_count && largestPage > assets.pdf_page_count) {
      return NextResponse.json({
        ok: false,
        error: `設定頁碼不可超過 PDF 總頁數 ${assets.pdf_page_count}`,
      }, { status: 400 });
    }

    const publishing = values.publish_mode === "immediate";
    const scheduling = values.publish_mode === "scheduled";
    const remainsLatest = Boolean(existing?.is_latest) && publishing;
    if (scheduling && existing?.is_latest) {
      return NextResponse.json({ ok: false, error: "請先將另一個已發布期號設為最新一期" }, { status: 409 });
    }

    const record = {
      issue_id: values.issue_id,
      year: Number(values.issue_id.slice(0, 4)),
      month: Number(values.issue_id.slice(5, 7)),
      publish_date: values.publish_date,
      status: publishing ? "published" : "scheduled",
      is_latest: remainsLatest,
      issue_number: existing?.issue_number ?? null,
      homepage_headline: values.homepage_headline,
      homepage_summary: values.homepage_summary,
      cover_title: values.cover_title_same_as_homepage ? values.homepage_headline : values.cover_title,
      outpatient_start_page: values.outpatient_start_page,
      outpatient_end_page: null,
      shuttle_page: values.shuttle_page,
      ...assets,
      updated_by: user.id,
      published_at: publishing ? existing?.published_at ?? new Date().toISOString() : null,
      scheduled_publish_at: scheduling ? values.scheduled_publish_at : null,
      set_latest_on_publish: scheduling && values.set_as_latest,
      schedule_last_attempt_at: null,
      schedule_error: null,
    };

    let saved;
    if (existing) {
      const { data, error } = await supabase.from("magazine_issues")
        .update(record).eq("id", existing.id).select().single();
      if (error) throw error;
      saved = data;
      if (currentId !== values.issue_id) {
        await preserveRenamedIssue(supabase, existing.id as string, currentId, values.issue_id);
      }
    } else {
      const { data, error } = await supabase.from("magazine_issues")
        .insert({ ...record, created_by: user.id }).select().single();
      if (error) throw error;
      saved = data;
    }
    if (publishing && values.set_as_latest) {
      const { error: latestError } = await userSupabase.rpc("set_latest_magazine_issue", {
        target_issue_id: values.issue_id,
      });
      if (latestError) throw latestError;
      const { data: latestRecord, error: latestLookupError } = await supabase
        .from("magazine_issues").select("*").eq("issue_id", values.issue_id).single();
      if (latestLookupError) throw latestLookupError;
      saved = latestRecord;
    }
    await cleanupStaging(supabase, values.staging_pdf_path, values.staging_cover_path);
    revalidateIssuePages(currentId, values.issue_id);
    return NextResponse.json({ ok: true, issue: saved, issues: await getManagedIssues() });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

async function archiveIssue(body: Record<string, unknown>) {
  try {
    const { supabase: userSupabase } = await requireAdmin();
    const issueId = cleanText(body.issue_id, 7);
    const replacementId = cleanText(body.replacement_latest_issue_id, 7);
    const confirmationIssueId = cleanText(body.confirmation_issue_id, 7);
    if (!issueId || confirmationIssueId !== issueId) {
      return NextResponse.json({ ok: false, error: "請輸入完全相同的醫訊期號以確認永久刪除" }, { status: 400 });
    }
    const repositoryPaths = retainedRepositoryPaths(issueId);
    if (repositoryPaths.length) {
      return NextResponse.json({
        ok: false,
        error: `此期仍有 Repository 靜態副本，正式切換並移除 ${repositoryPaths.join("、")} 前不可宣稱永久刪除`,
      }, { status: 409 });
    }
    const supabase = createServiceSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ ok: false, error: "Supabase 尚未設定" }, { status: 503 });
    }
    const { data: issue, error } = await supabase.from("magazine_issues")
      .select("id,issue_id,is_latest").eq("issue_id", issueId).maybeSingle();
    if (error) throw error;
    const { data: existingJob, error: jobLookupError } = await supabase
      .from("magazine_issue_deletion_jobs").select("issue_id").eq("issue_id", issueId).maybeSingle();
    if (jobLookupError) throw jobLookupError;
    if (!issue && !existingJob) return NextResponse.json({ ok: false, error: "找不到醫訊或可重試的清理工作" }, { status: 404 });
    if (issue?.is_latest) {
      if (!replacementId || replacementId === issueId) {
        return NextResponse.json({ ok: false, error: "下架最新一期前，請指定另一個已發布期號" }, { status: 409 });
      }
      const { data: replacement } = await supabase.from("magazine_issues")
        .select("id").eq("issue_id", replacementId).eq("status", "published").maybeSingle();
      if (!replacement) {
        return NextResponse.json({ ok: false, error: "指定的新一期不是已發布醫訊" }, { status: 400 });
      }
    }
    const { data: deletion, error: deletionError } = await userSupabase.rpc("begin_magazine_issue_deletion", {
      target_issue_id: issueId,
      replacement_issue_id: replacementId || null,
    });
    if (deletionError) throw deletionError;
    const deletionResult = normalizeDeletionResult(deletion, issueId);

    let storage;
    try {
      storage = await cleanupIssueStorage(supabase, issueId, deletionResult.public_paths);
    } catch (storageError) {
      const storageMessage = errorMessage(storageError);
      await supabase.from("magazine_issue_deletion_jobs").update({
        status: "storage_failed",
        last_error: storageMessage,
        updated_at: new Date().toISOString(),
      }).eq("issue_id", issueId);
      revalidateIssuePages(issueId, replacementId);
      return NextResponse.json({
        ok: false,
        retryable: true,
        error: `資料庫關聯已移除，但檔案清理尚未完成：${storageMessage}。請使用待完成清理項目安全重試。`,
      }, { status: 500 });
    }

    const { error: completeError } = await supabase
      .from("magazine_issue_deletion_jobs").delete().eq("issue_id", issueId);
    if (completeError) {
      return NextResponse.json({
        ok: false,
        retryable: true,
        error: `資料與檔案已移除，但完成狀態尚未寫入：${completeError.message}。請安全重試。`,
      }, { status: 500 });
    }
    revalidateIssuePages(issueId, replacementId);
    return NextResponse.json({
      ok: true,
      deleted_issue_id: issueId,
      database_counts: deletionResult.db_counts,
      storage_counts: {
        magazine_public: storage.publicFiles.length,
        magazine_staging: storage.stagingFiles.length,
      },
      issues: await getManagedIssues(),
      deletion_jobs: await getDeletionJobs(supabase),
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

async function getDeletionJobs(supabase: ServiceClient) {
  const { data, error } = await supabase.from("magazine_issue_deletion_jobs")
    .select("issue_id,status,last_error,db_counts,created_at,updated_at")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

function normalizeDeletionResult(value: unknown, issueId: string) {
  const result = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const publicPaths = Array.isArray(result.public_paths)
    ? result.public_paths.filter((path): path is string => typeof path === "string")
    : [];
  return {
    issue_id: typeof result.issue_id === "string" ? result.issue_id : issueId,
    public_paths: publicPaths,
    db_counts: result.db_counts && typeof result.db_counts === "object" ? result.db_counts : {},
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知錯誤";
}

async function publishUploadedAssets(
  supabase: ServiceClient,
  userId: string,
  issueId: string,
  pdfPath: string,
  coverPath: string,
  largestConfiguredPage: number,
) {
  if (!pdfPath.startsWith(`${userId}/`) || !coverPath.startsWith(`${userId}/`)) {
    throw new Error("上傳檔案路徑不正確");
  }
  const [{ data: pdf, error: pdfError }, { data: cover, error: coverError }] = await Promise.all([
    supabase.storage.from("magazine-staging").download(pdfPath),
    supabase.storage.from("magazine-staging").download(coverPath),
  ]);
  if (pdfError || !pdf) throw pdfError ?? new Error("找不到上傳的 PDF");
  if (coverError || !cover) throw coverError ?? new Error("找不到產生的封面");
  const pdfBytes = new Uint8Array(await pdf.arrayBuffer());
  const coverBytes = new Uint8Array(await cover.arrayBuffer());
  if (new TextDecoder().decode(pdfBytes.slice(0, 4)) !== "%PDF") throw new Error("上傳檔案不是有效 PDF");
  if (coverBytes[0] !== 0xff || coverBytes[1] !== 0xd8 || coverBytes[2] !== 0xff) {
    throw new Error("自動產生的封面不是有效 JPG");
  }
  // Preload the worker module so PDF.js can use its in-process handler in
  // serverless bundles instead of importing a worker file from a chunk path.
  await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await pdfjs.getDocument({ data: pdfBytes }).promise;
  const pageCount = document.numPages;
  await document.destroy();
  if (largestConfiguredPage > pageCount) {
    throw new Error(`設定頁碼不可超過 PDF 總頁數 ${pageCount}`);
  }

  const version = randomUUID();
  const publicPdfPath = `issues/${issueId}/${version}.pdf`;
  const publicCoverPath = `covers/${issueId}/${version}.jpg`;
  const [{ error: publicPdfError }, { error: publicCoverError }] = await Promise.all([
    supabase.storage.from("magazine-public").upload(publicPdfPath, pdf, {
      contentType: "application/pdf", cacheControl: "3600", upsert: false,
    }),
    supabase.storage.from("magazine-public").upload(publicCoverPath, cover, {
      contentType: "image/jpeg", cacheControl: "3600", upsert: false,
    }),
  ]);
  if (publicPdfError) throw publicPdfError;
  if (publicCoverError) throw publicCoverError;
  return {
    pdf_url: supabase.storage.from("magazine-public").getPublicUrl(publicPdfPath).data.publicUrl,
    cover_image: supabase.storage.from("magazine-public").getPublicUrl(publicCoverPath).data.publicUrl,
    pdf_storage_path: publicPdfPath,
    cover_storage_path: publicCoverPath,
    pdf_page_count: pageCount,
  };
}

async function preserveRenamedIssue(
  supabase: ServiceClient,
  issueUuid: string,
  oldId: string,
  newId: string,
) {
  const { error: aliasError } = await supabase.from("magazine_issue_aliases")
    .upsert({ alias: oldId, magazine_issue_id: issueUuid }, { onConflict: "alias" });
  if (aliasError) throw aliasError;
  const { data: topics, error: topicLookupError } = await supabase.from("qr_topics")
    .select("id").eq("issue_id", oldId);
  if (topicLookupError) throw topicLookupError;
  const topicIds = (topics ?? []).map((topic) => topic.id);
  if (topicIds.length) {
    const { error: topicError } = await supabase.from("qr_topics")
      .update({ issue_id: newId, destination_path: `/read/${newId}` }).in("id", topicIds);
    if (topicError) throw topicError;
    const { error: routeError } = await supabase.from("qr_routes")
      .update({ destination_path: `/read/${newId}` }).in("topic_id", topicIds);
    if (routeError) throw routeError;
  }
  const { error: eventError } = await supabase.from("qr_events").update({ issue_id: newId }).eq("issue_id", oldId);
  if (eventError) throw eventError;
}

async function cleanupStaging(supabase: ServiceClient, pdfPath: string | null, coverPath: string | null) {
  const paths = [pdfPath, coverPath].filter((path): path is string => Boolean(path));
  if (paths.length) await supabase.storage.from("magazine-staging").remove(paths).catch(() => undefined);
}

function validateIssue(body: Record<string, unknown>) {
  const issueId = cleanText(body.issue_id, 7);
  const publishDate = cleanText(body.publish_date, 10);
  const headline = cleanText(body.homepage_headline, 160);
  const summary = cleanText(body.homepage_summary, 1000);
  const coverTitle = cleanText(body.cover_title, 160);
  const sameTitle = body.cover_title_same_as_homepage === true;
  const outpatientStart = positiveInteger(body.outpatient_start_page);
  const shuttlePage = positiveInteger(body.shuttle_page);
  const publishMode = body.publish_mode === "scheduled" ? "scheduled" : "immediate";
  const scheduleDate = cleanText(body.schedule_date, 10);
  const scheduleTime = cleanText(body.schedule_time, 5);
  const scheduledPublishAt = publishMode === "scheduled"
    ? taipeiScheduleToUtc(scheduleDate, scheduleTime)
    : null;
  let error = "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(issueId)) error = "正式期號必須使用 YYYY-MM 格式";
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(publishDate)) error = "請填寫正式發行日期";
  else if (!headline || !summary) error = "請填寫首頁標題與首頁摘要";
  else if (!sameTitle && !coverTitle) error = "請填寫封面正式標題";
  else if (!outpatientStart || !shuttlePage) error = "請填寫有效的門診及接駁車頁碼";
  else if (publishMode === "scheduled" && !scheduledPublishAt) error = "請填寫有效的台灣排程日期與時間";
  else if (publishMode === "scheduled" && Date.parse(scheduledPublishAt!) <= Date.now()) error = "排程發布時間必須晚於現在";
  return {
    error,
    issue_id: issueId,
    publish_date: publishDate,
    homepage_headline: headline,
    homepage_summary: summary,
    cover_title: coverTitle,
    cover_title_same_as_homepage: sameTitle,
    outpatient_start_page: outpatientStart ?? 0,
    shuttle_page: shuttlePage ?? 0,
    publish_mode: publishMode,
    scheduled_publish_at: scheduledPublishAt,
    set_as_latest: body.set_as_latest === true,
    staging_pdf_path: cleanText(body.staging_pdf_path, 500) || null,
    staging_cover_path: cleanText(body.staging_cover_path, 500) || null,
  };
}

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function positiveInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 9_999 ? parsed : null;
}

function taipeiScheduleToUtc(date: string, time: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const instant = new Date(`${date}T${time}:00+08:00`);
  if (Number.isNaN(instant.getTime())) return null;
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  const taipei = new Date(instant.getTime() + 8 * 60 * 60 * 1000);
  if (
    taipei.getUTCFullYear() !== year || taipei.getUTCMonth() + 1 !== month ||
    taipei.getUTCDate() !== day || taipei.getUTCHours() !== hour ||
    taipei.getUTCMinutes() !== minute
  ) return null;
  return instant.toISOString();
}

function revalidateIssuePages(...issueIds: string[]) {
  revalidatePath("/");
  revalidatePath("/issues");
  revalidatePath("/sitemap.xml");
  for (const issueId of issueIds.filter(Boolean)) {
    revalidatePath(`/issues/${issueId}`);
    revalidatePath(`/read/${issueId}`);
  }
}
