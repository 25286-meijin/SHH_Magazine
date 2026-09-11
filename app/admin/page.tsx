import { getPublishedIssues } from "@/lib/content";
import AdminDashboard from "@/components/AdminDashboard";

export const metadata = { title: "QR Code 管理與統計", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default function AdminPage() {
  return <AdminDashboard issues={getPublishedIssues().map(({ issue_id, homepage_headline }) => ({ issue_id, title: homepage_headline }))} />;
}
