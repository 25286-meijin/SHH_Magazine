import { getManagedIssues } from "@/lib/content";
import AdminDashboard from "@/components/AdminDashboard";

export const metadata = { title: "雙和醫院公播掃碼追蹤系統", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const issues = await getManagedIssues();
  return <AdminDashboard issues={issues.map(({ issue_id, homepage_headline, status, is_latest, publish_date }) => ({ issue_id, title: homepage_headline, status, is_latest, publish_date }))} />;
}
