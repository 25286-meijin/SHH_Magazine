"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Issue } from "@/lib/content";
import { useEngagementTracking } from "@/hooks/useEngagementTracking";

type PdfPageProxy = {
  getViewport: (options: { scale: number }) => { width: number; height: number };
  render: (options: {
    canvasContext: CanvasRenderingContext2D;
    viewport: unknown;
  }) => { promise: Promise<void> };
};

type PdfDocument = {
  numPages: number;
  getPage: (page: number) => Promise<PdfPageProxy>;
};

export function PdfReader({
  issue,
  initialPage,
  entryId,
}: {
  issue: Issue;
  initialPage: number;
  entryId: string | null;
}) {
  const [pdf, setPdf] = useState<PdfDocument>();
  const [error, setError] = useState(false);
  const [scale, setScale] = useState(1);
  const [measuredPages, setMeasuredPages] = useState<Set<number>>(() => new Set());
  const milestones = useRef(new Set<number>());
  const track = useEngagementTracking({ issueId: issue.issue_id, entryId });
  const markPageMeasured = useCallback((page: number) => {
    setMeasuredPages((current) => {
      if (current.has(page)) return current;
      const next = new Set(current);
      next.add(page);
      return next;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    void import("pdfjs-dist").then(async (pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      try {
        const document = await pdfjs.getDocument(
          issue.local_pdf_path || issue.pdf_url || "",
        ).promise;
        if (!cancelled) {
          setPdf(document as unknown as PdfDocument);
          track("read_start", { first_content_view_at: new Date().toISOString() });
        }
      } catch {
        if (!cancelled) {
          setError(true);
          track("reader_error", { reason: "pdf_unavailable" });
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [issue.local_pdf_path, issue.pdf_url, track]);

  useEffect(() => {
    const reportProgress = () => {
      const available = document.documentElement.scrollHeight - window.innerHeight;
      if (available <= 0) return;
      const progress = Math.min(100, (window.scrollY / available) * 100);
      for (const milestone of [25, 50, 75, 90, 100]) {
        if (progress >= milestone && !milestones.current.has(milestone)) {
          milestones.current.add(milestone);
          track(milestone === 100 ? "read_complete" : `read_${milestone}`);
        }
      }
    };
    window.addEventListener("scroll", reportProgress, { passive: true });
    return () => window.removeEventListener("scroll", reportProgress);
  }, [track]);

  useEffect(() => {
    if (!pdf || initialPage > pdf.numPages) return;
    const precedingPagesMeasured = Array.from(
      { length: initialPage },
      (_, index) => index + 1,
    ).every((page) => measuredPages.has(page));
    if (!precedingPagesMeasured) return;
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        document.getElementById(`page-${initialPage}`)?.scrollIntoView({ block: "start" });
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [pdf, initialPage, measuredPages]);

  return (
    <main className="reader">
      <div className="reader-toolbar">
        <Link href={`/issues/${issue.issue_id}`}>← 返回本期</Link>
        <strong>{issue.year}.{String(issue.month).padStart(2, "0")}</strong>
        <div className="zoom" aria-label="頁面縮放控制">
          <button onClick={() => setScale((value) => Math.max(0.75, value - 0.25))} aria-label="縮小">−</button>
          <button onClick={() => setScale(1)}>重設</button>
          <button onClick={() => setScale((value) => Math.min(2, value + 0.25))} aria-label="放大">＋</button>
        </div>
      </div>

      {error ? (
        <ReaderError issue={issue} />
      ) : !pdf ? (
        <div className="loading" role="status">正在準備刊物…</div>
      ) : (
        <div className="pdf-scroll" style={{ width: "100%", overflowX: "auto" }}>
          <div
            className="pdf-pages"
            style={{
              width: `${scale * 100}%`,
              maxWidth: `${scale * 760}px`,
            }}
          >
            {Array.from({ length: pdf.numPages }, (_, index) => (
              <PdfPage
                pdf={pdf}
                page={index + 1}
                key={index}
                onMeasured={markPageMeasured}
              />
            ))}
          </div>
        </div>
      )}
    </main>
  );
}

function ReaderError({ issue }: { issue: Issue }) {
  return (
    <div className="reader-error" role="alert">
      <span className="mark">SHH</span>
      <h1>刊物檔案尚未就緒</h1>
      <p>目前找不到這一期的 PDF，請稍後重試或返回本期資訊。</p>
      <div className="actions">
        <button className="button primary" onClick={() => location.reload()}>重新載入</button>
        <Link className="button secondary" href={`/issues/${issue.issue_id}`}>回本期</Link>
        {issue.pdf_url && <a className="button secondary" href={issue.pdf_url}>原始 PDF</a>}
      </div>
    </div>
  );
}

function PdfPage({
  pdf,
  page,
  onMeasured,
}: {
  pdf: PdfDocument;
  page: number;
  onMeasured: (page: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [shouldRender, setShouldRender] = useState(false);
  const [pageRatio, setPageRatio] = useState<number>();

  useEffect(() => {
    let cancelled = false;
    void pdf.getPage(page).then((pdfPage) => {
      if (cancelled) return;
      const viewport = pdfPage.getViewport({ scale: 1 });
      setPageRatio(viewport.width / viewport.height);
      onMeasured(page);
    }).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [onMeasured, page, pdf]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && setShouldRender(true),
      { rootMargin: "800px" },
    );
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!shouldRender || !canvasRef.current) return;
    let cancelled = false;
    void pdf.getPage(page).then((pdfPage) => {
      const canvas = canvasRef.current;
      if (cancelled || !canvas) return;
      const viewport = pdfPage.getViewport({ scale: 1.5 });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      void pdfPage.render({
        canvasContext: canvas.getContext("2d")!,
        viewport,
      }).promise.catch(() => undefined);
    });
    return () => {
      cancelled = true;
    };
  }, [shouldRender, page, pdf]);

  return (
    <figure
      id={`page-${page}`}
      className="pdf-page"
      style={{
        aspectRatio: pageRatio,
        minHeight: pageRatio ? 0 : undefined,
      }}
    >
      <canvas
        ref={canvasRef}
        aria-label={`第 ${page} 頁`}
        style={{ aspectRatio: pageRatio }}
      />
      <figcaption>{page}</figcaption>
    </figure>
  );
}
