import { notFound } from "next/navigation";
import { PdfReader } from "@/components/PdfReader";
import { getIssue, safeEntryId } from "@/lib/content";

export const metadata = { robots: { index: false, follow: true } };
export const dynamic = "force-dynamic";

export default async function ReadPage({
  params,
  searchParams,
}: {
  params: { issueId: string };
  searchParams: { page?: string; entry_id?: string | string[] };
}) {
  const issue = await getIssue(params.issueId);
  if (!issue) notFound();

  return (
    <PdfReader
      issue={issue}
      initialPage={Math.max(1, Number(searchParams.page) || 1)}
      entryId={safeEntryId(searchParams.entry_id)}
    />
  );
}
