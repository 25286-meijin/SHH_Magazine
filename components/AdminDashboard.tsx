"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Image from "next/image";

type IssueOption = { issue_id: string; title: string };
type Topic = { id: string; issue_id: string; title: string; page_number: number | null; active: boolean };
type Placement = { id: string; name: string; description: string | null; active: boolean };
type QrRoute = { qr_id: string; created_at: string; active: boolean; topic: Topic; placement: Placement };
type Entry = { id: string; received_at_utc: string; topic_title: string; placement_name: string; issue_id: string };
type Count = { topic_title?: string; placement_name?: string; qr_entries: number };

export default function AdminDashboard({ issues }: { issues: IssueOption[] }) {
  const [mode, setMode] = useState<"qr" | "analytics">("analytics");
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [routes, setRoutes] = useState<QrRoute[]>([]);
  const [createdQrId, setCreatedQrId] = useState("");
  const [analyticsIssueId, setAnalyticsIssueId] = useState(issues[0]?.issue_id ?? "");
  const [analyticsLoaded, setAnalyticsLoaded] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [topicCounts, setTopicCounts] = useState<Count[]>([]);
  const [placementCounts, setPlacementCounts] = useState<Count[]>([]);
  const [total, setTotal] = useState(0);
  const [message, setMessage] = useState("正在讀取資料…");

  const reloadCatalog = useCallback(async () => {
    const [catalog, qrRoutes] = await Promise.all([
      api("/api/admin/catalog"),
      api("/api/admin/qr-routes"),
    ]);
    setPlacements(catalog.placements ?? []);
    setRoutes(qrRoutes.routes ?? []);
    setMessage("");
  }, []);

  const loadAnalytics = useCallback(async (issueId: string) => {
    setAnalyticsIssueId(issueId);
    if (!issueId) {
      setAnalyticsLoaded(false);
      setEntries([]);
      setTopicCounts([]);
      setPlacementCounts([]);
      setTotal(0);
      return;
    }
    try {
      setMessage("正在讀取掃碼統計…");
      const analytics = await api(`/api/admin/analytics?issue_id=${encodeURIComponent(issueId)}`);
      setEntries(analytics.recentEntries ?? []);
      setTopicCounts(analytics.topicCounts ?? []);
      setPlacementCounts(analytics.placementCounts ?? []);
      setTotal(analytics.totalQrEntries ?? 0);
      setAnalyticsLoaded(true);
      setMessage("");
    } catch (error) {
      setAnalyticsLoaded(false);
      setMessage((error as Error).message);
    }
  }, []);

  useEffect(() => {
    void reloadCatalog().catch((error: Error) => setMessage(error.message));
  }, [reloadCatalog]);

  useEffect(() => {
    const latestIssueId = issues[0]?.issue_id;
    if (latestIssueId) void loadAnalytics(latestIssueId);
  }, [issues, loadAnalytics]);

  async function createRoute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setMessage("正在產生 QR Code…");
      const result = await api("/api/admin/qr-routes", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))),
      });
      setCreatedQrId(result.route.qr_id);
      await reloadCatalog();
      setMessage("QR Code 已產生，可在下方預覽與下載。");
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function deactivateRoute(qrId: string) {
    if (!window.confirm("停用後，這張已印製的 QR Code 將無法再導向醫訊。確定要停用嗎？")) return;
    try {
      setMessage("正在停用 QR Code…");
      await api("/api/admin/qr-routes", {
        method: "PATCH",
        body: JSON.stringify({ qr_id: qrId, active: false }),
      });
      if (createdQrId === qrId) setCreatedQrId("");
      await reloadCatalog();
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function logout() {
    await fetch("/api/admin/session", { method: "DELETE" });
    window.location.assign("/admin/login");
  }

  return <main className="admin-shell"><div className="wrap">
    <header className="admin-nav"><div className="logo"><span className="mark">SHH</span>雙和醫院公播掃碼追蹤系統 <span className="badge">ADMIN</span></div><button className="text-button" onClick={logout}>登出</button></header>
    <div className="admin-title"><div><p className="eyebrow">SECURE QR ANALYTICS</p><h1>雙和醫院公播掃碼追蹤系統</h1><p>產生指定月份與頁碼的 QR Code，或依月份查看匿名 QR 導入紀錄。</p></div></div>

    <nav className="admin-mode-nav" aria-label="後台功能">
      <button type="button" className={mode === "analytics" ? "selected" : ""} aria-pressed={mode === "analytics"} onClick={() => setMode("analytics")}>掃碼統計</button>
      <button type="button" className={mode === "qr" ? "selected" : ""} aria-pressed={mode === "qr"} onClick={() => setMode("qr")}>QR Code 管理</button>
    </nav>
    {message && <p className="admin-message" role="status">{message}</p>}

    {mode === "qr" ? <>
      <section className="admin-section"><p className="eyebrow">QR CODE MANAGEMENT</p><h2>QR Code 管理</h2><p className="section-description">依序選擇月份、輸入主題與頁碼、再選擇公播區域。</p>
        <form className="panel admin-form qr-form" onSubmit={createRoute}>
          <label>1. 醫訊月份<select name="issue_id" required defaultValue=""><option value="" disabled>請選擇</option>{issues.map(issue => <option key={issue.issue_id} value={issue.issue_id}>{issue.issue_id}｜{issue.title}</option>)}</select></label>
          <label>2. 醫訊主題名稱<input name="title" maxLength={160} required placeholder="請輸入正式主題" /></label>
          <label>3. 導入醫訊頁碼<input name="page_number" type="number" min={1} max={9999} inputMode="numeric" required placeholder="例如：5" /></label>
          <label>4. 公播區域<select name="placement_id" required defaultValue=""><option value="" disabled>請選擇</option>{placements.filter(item => item.active).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <button className="button primary" disabled={!placements.some(item => item.active)}>5. 產生 QR Code</button>
        </form>
        {!placements.some(item => item.active) && <p className="note standalone-note">固定公播區域尚未載入，請確認測試資料庫已完成設定。</p>}

        {createdQrId && <div className="panel qr-preview"><div><p className="eyebrow">NEW QR CODE</p><h3>新 QR Code 預覽</h3><code>{createdQrId}</code><div className="actions"><a className="button primary" href={`/api/admin/qr-routes/${createdQrId}/image?format=png&download=1`}>PNG 下載</a><a className="button secondary" href={`/api/admin/qr-routes/${createdQrId}/image?format=svg&download=1`}>SVG 下載</a></div></div><Image unoptimized width={240} height={240} src={`/api/admin/qr-routes/${createdQrId}/image?format=png`} alt="新產生的 QR Code 預覽" /></div>}

        <div className="table-wrap panel qr-routes-table-wrap"><div className="qr-routes-scroll"><table><thead><tr><th>月份</th><th>醫訊主題</th><th>導入頁碼</th><th>公播區域</th><th>QR ID</th><th>狀態</th><th>下載／管理</th></tr></thead><tbody>{routes.map(route => <tr key={route.qr_id}><td>{route.topic.issue_id}</td><td>{route.topic.title}</td><td>{route.topic.page_number ?? "原目的地"}</td><td>{route.placement.name}</td><td><code>{route.qr_id}</code></td><td>{route.active ? "啟用" : "已停用"}</td><td>{route.active ? <><a className="download-link" href={`/api/admin/qr-routes/${route.qr_id}/image?format=png&download=1`}>PNG</a><a className="download-link" href={`/api/admin/qr-routes/${route.qr_id}/image?format=svg&download=1`}>SVG</a><button className="danger-link" type="button" onClick={() => deactivateRoute(route.qr_id)}>停用 QR</button></> : "保留歷史紀錄"}</td></tr>)}{!routes.length && <tr><td colSpan={7}>尚未建立 QR Code。</td></tr>}</tbody></table></div></div>
      </section>

    </> : <>
      <section className="admin-section"><p className="eyebrow">QR ENTRIES</p><h2>掃碼統計</h2><label className="analytics-filter">先選擇醫訊月份<select value={analyticsIssueId} onChange={event => void loadAnalytics(event.target.value)}><option value="">請選擇</option>{issues.map(issue => <option key={issue.issue_id} value={issue.issue_id}>{issue.issue_id}｜{issue.title}</option>)}</select></label>
        {!analyticsLoaded ? <div className="panel empty-state">正在載入最新一期掃碼統計…</div> : <><div className="kpis compact-kpis"><article className="scan-total-card"><h2 className="statistics-section-title">QR Code 掃碼總次數</h2><strong className="scan-total-value"><span className="scan-total-number accent">{total}</span> 次</strong></article></div><div className="two-panels"><CountPanel title="掃碼主題統計" rows={sortCounts(topicCounts).map(item => [item.topic_title ?? "—", item.qr_entries])} /><CountPanel title="掃碼區域統計" rows={sortCounts(placementCounts).map(item => [item.placement_name ?? "—", item.qr_entries])} /></div>
          <h2 className="statistics-section-title records-title">完整掃碼紀錄</h2><div className="table-wrap panel records-table-wrap"><div className="records-scroll"><table><thead><tr><th>掃碼時間</th><th>掃碼主題</th><th>公播區域</th></tr></thead><tbody>{entries.map(entry => <tr key={entry.id}><td>{formatTaipeiTime(entry.received_at_utc)}</td><td>{entry.topic_title}</td><td>{entry.placement_name}</td></tr>)}{!entries.length && <tr><td colSpan={3}>這個月份目前沒有 QR 導入紀錄。</td></tr>}</tbody></table></div></div><p className="note">時間顯示為 Asia/Taipei。這裡統計的是 QR 導入次數，不是掃描率，也不代表看過公播內容的總人數。</p></>}
      </section>
    </>}
  </div></main>;
}

function CountPanel({ title, rows }: { title: string; rows: [string, number][] }) {
  return <div className="panel count-panel"><h2 className="statistics-section-title">{title}</h2>{rows.length ? <div className="count-list">{rows.map(([label, value]) => <div className="count-row" key={label}><span>{label}</span><strong>{value} 次</strong></div>)}</div> : <p>目前沒有紀錄。</p>}</div>;
}

function sortCounts(rows: Count[]) {
  return [...rows].sort((left, right) => right.qr_entries - left.qr_entries);
}

function formatTaipeiTime(value: string) {
  return new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Taipei",
  }).format(new Date(value));
}

async function api(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, headers: { "content-type": "application/json", ...init?.headers }, cache: "no-store" });
  const result = await response.json().catch(() => ({ error: "伺服器回應格式不正確" }));
  if (response.status === 401) window.location.assign("/admin/login");
  if (!response.ok) throw new Error(result.error ?? "操作失敗");
  return result;
}
