import { notFound } from "next/navigation";
import { PdfReader } from "@/components/PdfReader";
import { requireAdmin } from "@/lib/admin-auth";
import { getManagedIssue } from "@/lib/content";

export const metadata = { title: "醫訊預覽｜雙和醫院", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminIssuePreview({
  params,
  searchParams,
}: {
  params: { issueId: string };
  searchParams: { page?: string };
}) {
  await requireAdmin();
  const issue = await getManagedIssue(params.issueId);
  if (!issue || issue.status === "archived") notFound();

  return <PdfReader
    issue={issue}
    initialPage={Math.max(1, Number(searchParams.page) || 1)}
    entryId={null}
    trackingEnabled={false}
  />;
}
