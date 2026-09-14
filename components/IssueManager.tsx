"use client";

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

type ManagedIssue = {
  issue_id: string;
  publish_date: string;
  status: "draft" | "published" | "archived";
  is_latest: boolean;
  issue_number: string | null;
  homepage_headline: string;
  homepage_summary: string;
  cover_title: string | null;
  outpatient_start_page?: number;
  outpatient_page: number;
  outpatient_end_page: number | null;
  shuttle_page: number;
  cover_image: string;
  pdf_page_count: number | null;
};

type FormState = {
  issue_id: string;
  publish_date: string;
  issue_number: string;
  homepage_headline: string;
  homepage_summary: string;
  cover_title: string;
  cover_title_same_as_homepage: boolean;
  outpatient_start_page: string;
  outpatient_end_page: string;
  shuttle_page: string;
  set_as_latest: boolean;
};

const emptyForm: FormState = {
  issue_id: "",
  publish_date: "",
  issue_number: "",
  homepage_headline: "",
  homepage_summary: "",
  cover_title: "",
  cover_title_same_as_homepage: true,
  outpatient_start_page: "",
  outpatient_end_page: "",
  shuttle_page: "",
  set_as_latest: false,
};

export default function IssueManager({
  onIssuesChanged,
}: {
  onIssuesChanged: (issues: { issue_id: string; title: string }[]) => void;
}) {
  const [issues, setIssues] = useState<ManagedIssue[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [coverBlob, setCoverBlob] = useState<Blob | null>(null);
  const [coverPreview, setCoverPreview] = useState("");
  const [preparedPageCount, setPreparedPageCount] = useState<number | null>(null);
  const [replacementLatestId, setReplacementLatestId] = useState("");
  const [message, setMessage] = useState("正在讀取醫訊資料…");
  const [busy, setBusy] = useState(false);
  const selected = issues.find((issue) => issue.issue_id === selectedId) ?? null;
  const publishedReplacements = useMemo(
    () => issues.filter((issue) => issue.status === "published" && issue.issue_id !== selectedId),
    [issues, selectedId],
  );

  const applyIssues = useCallback((nextIssues: ManagedIssue[]) => {
    setIssues(nextIssues);
    onIssuesChanged(nextIssues
      .filter((issue) => issue.status === "published")
      .sort((a, b) => Number(b.is_latest) - Number(a.is_latest) || b.publish_date.localeCompare(a.publish_date))
      .map((issue) => ({ issue_id: issue.issue_id, title: issue.homepage_headline })));
  }, [onIssuesChanged]);

  const reload = useCallback(async () => {
    try {
      const result = await api("/api/admin/issues");
      applyIssues(result.issues ?? []);
      setMessage("");
    } catch (error) {
      setMessage((error as Error).message);
    }
  }, [applyIssues]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => () => {
    if (coverPreview.startsWith("blob:")) URL.revokeObjectURL(coverPreview);
  }, [coverPreview]);

  function beginNew() {
    setSelectedId(null);
    setForm(emptyForm);
    resetPreparedPdf();
    setReplacementLatestId("");
    setMessage("");
  }

  function beginEdit(issue: ManagedIssue) {
    setSelectedId(issue.issue_id);
    setForm({
      issue_id: issue.issue_id,
      publish_date: issue.publish_date,
      issue_number: issue.issue_number ?? "",
      homepage_headline: issue.homepage_headline,
      homepage_summary: issue.homepage_summary,
      cover_title: issue.cover_title ?? "",
      cover_title_same_as_homepage: issue.cover_title === issue.homepage_headline,
      outpatient_start_page: String(issue.outpatient_start_page ?? issue.outpatient_page),
      outpatient_end_page: issue.outpatient_end_page ? String(issue.outpatient_end_page) : "",
      shuttle_page: String(issue.shuttle_page),
      set_as_latest: issue.is_latest,
    });
    resetPreparedPdf();
    setCoverPreview(issue.cover_image);
    setPreparedPageCount(issue.pdf_page_count);
    setReplacementLatestId("");
    setMessage("");
  }

  function resetPreparedPdf() {
    setPdfFile(null);
    setCoverBlob(null);
    setCoverPreview("");
    setPreparedPageCount(null);
  }

  async function choosePdf(file: File | undefined) {
    resetPreparedPdf();
    if (!file) return;
    if (file.type !== "application/pdf" || file.size > 50 * 1024 * 1024) {
      setMessage("請選擇小於 50 MB 的 PDF 檔案。");
      return;
    }
    try {
      setBusy(true);
      setMessage("正在讀取 PDF 並產生封面…");
      const result = await renderPdfCover(file);
      setPdfFile(file);
      setCoverBlob(result.cover);
      setPreparedPageCount(result.pageCount);
      setCoverPreview(URL.createObjectURL(result.cover));
      setMessage(`PDF 共 ${result.pageCount} 頁，封面已自動產生。`);
    } catch {
      setMessage("無法讀取這份 PDF，請確認檔案未損壞或加密。");
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const action = submitter?.value === "publish" ? "publish" : "draft";
    try {
      setBusy(true);
      setMessage(pdfFile ? "正在上傳 PDF 與封面…" : "正在儲存醫訊…");
      let staging: Record<string, string> = {};
      if (pdfFile && coverBlob) staging = await uploadPreparedFiles(form.issue_id, pdfFile, coverBlob);
      const result = await api("/api/admin/issues", {
        method: selectedId ? "PATCH" : "POST",
        body: JSON.stringify({
          ...form,
          ...staging,
          action,
          original_issue_id: selectedId,
        }),
      });
      applyIssues(result.issues ?? []);
      beginEdit(normalizeManagedIssue(result.issue));
      setMessage(action === "publish" ? "醫訊已發布。" : "醫訊草稿已儲存。");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function archiveSelected() {
    if (!selected || !window.confirm("下架後將從公開首頁與歷期醫訊移除，但資料、PDF 與掃碼紀錄會保留。確定下架嗎？")) return;
    try {
      setBusy(true);
      const result = await api("/api/admin/issues", {
        method: "PATCH",
        body: JSON.stringify({
          action: "archive",
          issue_id: selected.issue_id,
          replacement_latest_issue_id: replacementLatestId,
        }),
      });
      applyIssues(result.issues ?? []);
      beginEdit(normalizeManagedIssue(result.issue));
      setMessage("醫訊已下架，檔案與既有紀錄均保留。");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return <section className="admin-section issue-management">
    <p className="eyebrow">MAGAZINE MANAGEMENT</p>
    <div className="section-heading-row"><h2>醫訊管理</h2><button type="button" className="button secondary" onClick={beginNew}>新增醫訊</button></div>
    <p className="section-description">新增或更新醫訊資料，只需上傳 PDF；系統會自動擷取第一頁作為 JPG 封面。</p>
    {message && <p className="admin-message" role="status">{message}</p>}

    <div className="issue-manager-grid">
      <div className="panel issue-list" aria-label="既有醫訊">
        {issues.map((issue) => <button type="button" key={issue.issue_id} className={selectedId === issue.issue_id ? "selected" : ""} onClick={() => beginEdit(issue)}>
          <span><strong>{issue.issue_id}</strong><small>{issue.homepage_headline}</small></span>
          <em>{issue.is_latest ? "最新一期" : statusLabel(issue.status)}</em>
        </button>)}
        {!issues.length && <p className="empty-state">目前沒有可管理的醫訊。</p>}
      </div>

      <form className="panel admin-form issue-form" onSubmit={submit}>
        <h3>{selected ? `編輯 ${selected.issue_id}` : "新增醫訊"}</h3>
        <div className="admin-form-grid">
          <label>正式期號<input required value={form.issue_id} pattern="[0-9]{4}-(0[1-9]|1[0-2])" placeholder="YYYY-MM" onChange={event => setForm({ ...form, issue_id: event.target.value })} /></label>
          <label>正式發行日期<input required type="date" value={form.publish_date} onChange={event => setForm({ ...form, publish_date: event.target.value })} /></label>
        </div>
        <label>首頁標題<input required maxLength={160} value={form.homepage_headline} onChange={event => setForm({ ...form, homepage_headline: event.target.value })} /></label>
        <label>首頁摘要<textarea required maxLength={1000} value={form.homepage_summary} onChange={event => setForm({ ...form, homepage_summary: event.target.value })} /></label>
        <label className="check-row"><input type="checkbox" checked={form.cover_title_same_as_homepage} onChange={event => setForm({ ...form, cover_title_same_as_homepage: event.target.checked })} />封面正式標題與首頁標題相同</label>
        {!form.cover_title_same_as_homepage && <label>封面正式標題<input required maxLength={160} value={form.cover_title} onChange={event => setForm({ ...form, cover_title: event.target.value })} /></label>}
        <div className="admin-form-grid">
          <label>門診時刻表 PDF 頁次（起始）<input required type="number" min={1} inputMode="numeric" value={form.outpatient_start_page} onChange={event => setForm({ ...form, outpatient_start_page: event.target.value })} /></label>
          <label>門診時刻表 PDF 頁次（結束，可留空）<input type="number" min={1} inputMode="numeric" value={form.outpatient_end_page} onChange={event => setForm({ ...form, outpatient_end_page: event.target.value })} /></label>
          <label>接駁車資訊 PDF 頁次<input required type="number" min={1} inputMode="numeric" value={form.shuttle_page} onChange={event => setForm({ ...form, shuttle_page: event.target.value })} /></label>
          <label>期號補充資訊（選填）<input maxLength={32} value={form.issue_number} onChange={event => setForm({ ...form, issue_number: event.target.value })} /></label>
        </div>
        <label>醫訊 PDF{selected && <small> 未選新檔時會保留目前 PDF</small>}<input type="file" accept="application/pdf,.pdf" required={!selected} onChange={event => void choosePdf(event.target.files?.[0])} /></label>
        {preparedPageCount && <p className="upload-summary">PDF 頁數：{preparedPageCount}</p>}
        {coverPreview && <div className="generated-cover"><span>自動產生的封面預覽</span><Image src={coverPreview} alt="醫訊 PDF 第一頁封面預覽" width={220} height={305} unoptimized /></div>}
        <label className="check-row"><input type="checkbox" checked={form.set_as_latest} onChange={event => setForm({ ...form, set_as_latest: event.target.checked })} />發布後立即設為最新一期</label>
        <div className="actions issue-actions">
          <button className="button secondary" type="submit" value="draft" disabled={busy}>儲存草稿</button>
          <button className="button primary" type="submit" value="publish" disabled={busy}>儲存／發布</button>
        </div>
        {selected && <div className="archive-controls">
          {selected.is_latest && <label>下架後的新一期<select required value={replacementLatestId} onChange={event => setReplacementLatestId(event.target.value)}><option value="">請選擇已發布期號</option>{publishedReplacements.map(issue => <option key={issue.issue_id} value={issue.issue_id}>{issue.issue_id}｜{issue.homepage_headline}</option>)}</select></label>}
          <button type="button" className="danger-button" disabled={busy || (selected.is_latest && !replacementLatestId)} onClick={() => void archiveSelected()}>下架這一期</button>
        </div>}
      </form>
    </div>
  </section>;
}

async function uploadPreparedFiles(issueId: string, pdf: File, cover: Blob) {
  const upload = await api("/api/admin/issues/upload-url", {
    method: "POST",
    body: JSON.stringify({ issue_id: issueId, pdf_size: pdf.size }),
  });
  const supabase = createBrowserSupabaseClient();
  const [{ error: pdfError }, { error: coverError }] = await Promise.all([
    supabase.storage.from("magazine-staging").uploadToSignedUrl(upload.pdf.path, upload.pdf.token, pdf, { contentType: "application/pdf" }),
    supabase.storage.from("magazine-staging").uploadToSignedUrl(upload.cover.path, upload.cover.token, cover, { contentType: "image/jpeg" }),
  ]);
  if (pdfError) throw pdfError;
  if (coverError) throw coverError;
  return { staging_pdf_path: upload.pdf.path, staging_cover_path: upload.cover.path };
}

async function renderPdfCover(file: File) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const document = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const page = await document.getPage(1);
  const original = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: Math.min(2, 1600 / original.width) });
  const canvas = window.document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
  const cover = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error("Unable to create cover")),
    "image/jpeg",
    0.9,
  ));
  const pageCount = document.numPages;
  await document.destroy();
  return { cover, pageCount };
}

function normalizeManagedIssue(issue: ManagedIssue) {
  return { ...issue, outpatient_start_page: issue.outpatient_start_page ?? issue.outpatient_page };
}

function statusLabel(status: ManagedIssue["status"]) {
  if (status === "published") return "已發布";
  if (status === "archived") return "已下架";
  return "草稿";
}

async function api(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, headers: { "content-type": "application/json", ...init?.headers }, cache: "no-store" });
  const result = await response.json().catch(() => ({ error: "伺服器回應格式不正確" }));
  if (response.status === 401) window.location.assign("/admin/login");
  if (!response.ok) throw new Error(result.error ?? "操作失敗");
  return result;
}
