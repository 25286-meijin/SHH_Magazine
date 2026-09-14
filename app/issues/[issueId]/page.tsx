import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Cover } from "@/components/Cover";
import { PublicFooter } from "@/components/PublicFooter";
import { PublicHeader } from "@/components/PublicHeader";
import { getIssue, safeEntryId } from "@/lib/content";

type Props = {
  params: { issueId: string };
  searchParams: { entry_id?: string | string[]; notice?: string };
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const issue = await getIssue(params.issueId);
  return issue
    ? {
        title: `${issue.year}年${String(issue.month).padStart(2, "0")}月號`,
        description: issue.homepage_summary,
      }
    : {};
}

export default async function IssuePage({ params, searchParams }: Props) {
  const issue = await getIssue(params.issueId);
  if (!issue) notFound();

  const entryId = safeEntryId(searchParams.entry_id);
  const readerUrl = `/read/${issue.issue_id}${entryId ? `?entry_id=${entryId}` : ""}`;

  return (
    <>
      <PublicHeader />
      <main className="wrap hero issue-detail">
        <div>
          <p className="eyebrow">ISSUE · {issue.issue_id}</p>
          <h1>{issue.homepage_headline}</h1>
          <p className="summary">{issue.homepage_summary}</p>
          {searchParams.notice === "page-pending" && (
            <p className="notice" role="status">
              此資訊的實際頁碼尚待編輯資料補齊，您仍可從第一頁開始閱讀。
            </p>
          )}
          <div className="actions">
            <Link className="button primary" href={readerUrl}>開始閱讀</Link>
            <Link className="button secondary" href="/issues">返回歷期</Link>
          </div>
        </div>
        <Cover issue={issue} />
      </main>
      <PublicFooter />
    </>
  );
}
