import issuesData from "@/data/issues.demo.json";
import qrData from "@/data/qr-routes.demo.json";
import { unstable_noStore } from "next/cache";
import { createServiceSupabaseClient } from "@/lib/supabase/server";

export type IssueStatus = "draft" | "scheduled" | "published" | "archived";

export type Issue = {
  id?: string;
  issue_id: string;
  year: number;
  month: number;
  publish_date: string;
  status: IssueStatus;
  is_latest: boolean;
  issue_number: string | null;
  cover_image: string;
  pdf_url: string | null;
  local_pdf_path: string | null;
  pdf_storage_path: string | null;
  cover_storage_path: string | null;
  pdf_page_count: number | null;
  cover_title: string | null;
  homepage_headline: string;
  homepage_summary: string;
  outpatient_start_page: number;
  outpatient_page: number;
  outpatient_end_page: number | null;
  shuttle_page: number;
  features: unknown[];
  scheduled_publish_at: string | null;
  set_latest_on_publish: boolean;
  schedule_last_attempt_at: string | null;
  schedule_error: string | null;
};

export type QrRoute = (typeof qrData)[number];

type DatabaseIssue = {
  id: string;
  issue_id: string;
  year: number;
  month: number;
  publish_date: string;
  status: IssueStatus;
  is_latest: boolean;
  issue_number: string | null;
  cover_image: string;
  pdf_url: string;
  pdf_storage_path: string | null;
  cover_storage_path: string | null;
  pdf_page_count: number | null;
  cover_title: string | null;
  homepage_headline: string;
  homepage_summary: string;
  outpatient_start_page: number;
  outpatient_end_page: number | null;
  shuttle_page: number;
  features: unknown[] | null;
  scheduled_publish_at: string | null;
  set_latest_on_publish: boolean;
  schedule_last_attempt_at: string | null;
  schedule_error: string | null;
};

const legacyIssues: Issue[] = issuesData.map((issue, index) => ({
  ...issue,
  status: issue.status as IssueStatus,
  is_latest: index === 0,
  issue_number: "issue_number" in issue ? issue.issue_number ?? null : null,
  pdf_url: issue.pdf_url ?? null,
  local_pdf_path: issue.local_pdf_path ?? null,
  pdf_storage_path: null,
  cover_storage_path: null,
  pdf_page_count: null,
  outpatient_start_page: issue.outpatient_page,
  outpatient_end_page: issue.issue_id === "2026-09" ? 16 : null,
  features: issue.features ?? [],
  scheduled_publish_at: null,
  set_latest_on_publish: false,
  schedule_last_attempt_at: null,
  schedule_error: null,
}));

export const issues = legacyIssues;
export const qrRoutes = qrData as QrRoute[];

export async function getPublishedIssues(): Promise<Issue[]> {
  const stored = await loadStoredIssues(true);
  return sortPublished(stored ?? legacyIssues.filter((issue) => issue.status === "published"));
}

export async function getManagedIssues(): Promise<Issue[]> {
  const stored = await loadStoredIssues(false);
  return (stored ?? legacyIssues).sort((a, b) => b.publish_date.localeCompare(a.publish_date));
}

export async function getManagedIssue(id: string): Promise<Issue | undefined> {
  const stored = await loadStoredIssues(false);
  return (stored ?? legacyIssues).find((issue) => issue.issue_id === id);
}

export async function getQrEligibleIssue(id: string): Promise<Issue | undefined> {
  const issue = await getManagedIssue(id);
  return issue && (issue.status === "published" || issue.status === "scheduled")
    ? issue
    : undefined;
}

export async function getLatestIssue(): Promise<Issue> {
  const latest = (await getPublishedIssues())[0];
  if (!latest) throw new Error("No published issue is configured");
  return latest;
}

export async function getIssue(id: string): Promise<Issue | undefined> {
  unstable_noStore();
  const supabase = createServiceSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase
      .from("magazine_issues")
      .select("*")
      .eq("issue_id", id)
      .eq("status", "published")
      .maybeSingle();
    if (error) throw error;
    if (data) return normalizeIssue(data as DatabaseIssue);
    const { data: alias, error: aliasError } = await supabase
      .from("magazine_issue_aliases")
      .select("magazine_issue_id")
      .eq("alias", id)
      .maybeSingle();
    if (aliasError) throw aliasError;
    if (alias?.magazine_issue_id) {
      const { data: aliasedIssue, error: aliasedIssueError } = await supabase
        .from("magazine_issues")
        .select("*")
        .eq("id", alias.magazine_issue_id)
        .eq("status", "published")
        .maybeSingle();
      if (aliasedIssueError) throw aliasedIssueError;
      if (aliasedIssue) return normalizeIssue(aliasedIssue as DatabaseIssue);
    }
    return undefined;
  }
  return legacyIssues.find((issue) => issue.issue_id === id && issue.status === "published");
}

export function getQrRoute(id: string): QrRoute | undefined {
  return qrRoutes.find((route) => route.qr_id === id && route.active);
}

export function isAllowedRegistrationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "shh.tmu.edu.tw" ||
        url.hostname.endsWith(".shh.tmu.edu.tw"))
    );
  } catch {
    return false;
  }
}

export function safeEntryId(value: string | string[] | undefined): string | null {
  const entryId = Array.isArray(value) ? value[0] : value;
  return entryId && /^[0-9a-f-]{36}$/i.test(entryId) ? entryId : null;
}

async function loadStoredIssues(publishedOnly: boolean): Promise<Issue[] | null> {
  unstable_noStore();
  const supabase = createServiceSupabaseClient();
  if (!supabase) return null;
  let query = supabase.from("magazine_issues").select("*");
  if (publishedOnly) query = query.eq("status", "published");
  const { data, error } = await query.order("publish_date", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as DatabaseIssue[]).map(normalizeIssue);
}

function normalizeIssue(issue: DatabaseIssue): Issue {
  return {
    ...issue,
    local_pdf_path: null,
    outpatient_page: issue.outpatient_start_page,
    features: issue.features ?? [],
    scheduled_publish_at: issue.scheduled_publish_at ?? null,
    set_latest_on_publish: issue.set_latest_on_publish ?? false,
    schedule_last_attempt_at: issue.schedule_last_attempt_at ?? null,
    schedule_error: issue.schedule_error ?? null,
  };
}

function sortPublished(values: Issue[]) {
  return [...values].sort((a, b) => {
    if (a.is_latest !== b.is_latest) return a.is_latest ? -1 : 1;
    return b.publish_date.localeCompare(a.publish_date);
  });
}
