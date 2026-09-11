"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

type IssueOption = { issue_id: string; title: string };
type Topic = { id: string; issue_id: string; title: string; active: boolean };
type Placement = { id: string; name: string; description: string | null; active: boolean };
type QrRoute = { qr_id: string; created_at: string; topic: Topic; placement: Placement };
type Entry = { id: string; received_at_utc: string; topic_title: string; placement_name: string; issue_id: string; qr_id: string };
type Count = { topic_title?: string; placement_name?: string; qr_entries: number };

export default function AdminDashboard({ issues }: { issues: IssueOption[] }) {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [routes, setRoutes] = useState<QrRoute[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [topicCounts, setTopicCounts] = useState<Count[]>([]);
  const [placementCounts, setPlacementCounts] = useState<Count[]>([]);
  const [total, setTotal] = useState(0);
  const [message, setMessage] = useState("正在讀取資料…");

  const reload = useCallback(async () => {
    const [catalog, qrRoutes, analytics] = await Promise.all([
      api("/api/admin/catalog"), api("/api/admin/qr-routes"), api("/api/admin/analytics"),
    ]);
    setTopics(catalog.topics ?? []);
    setPlacements(catalog.placements ?? []);
    setRoutes(qrRoutes.routes ?? []);
    setEntries(analytics.recentEntries ?? []);
    setTopicCounts(analytics.topicCounts ?? []);
    setPlacementCounts(analytics.placementCounts ?? []);
    setTotal(analytics.totalQrEntries ?? 0);
    setMessage("");
  }, []);

  useEffect(() => { void reload().catch((error: Error) => setMessage(error.message)); }, [reload]);

  async function createCatalog(event: FormEvent<HTMLFormElement>, kind: "topic" | "placement") {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      setMessage("儲存中…");
      await api("/api/admin/catalog", { method: "POST", body: JSON.stringify({ kind, ...Object.fromEntries(new FormData(form)) }) });
      form.reset();
      await reload();
    } catch (error) { setMessage((error as Error).message); }
  }

  async function createRoute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setMessage("正在產生 QR Code…");
      await api("/api/admin/qr-routes", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))) });
      await reload();
    } catch (error) { setMessage((error as Error).message); }
  }

  async function logout() {
    await fetch("/api/admin/session", { method: "DELETE" });
    window.location.assign("/admin/login");
  }

  return <main className="admin-shell"><div className="wrap">
    <header className="admin-nav"><div className="logo"><span className="mark">SHH</span>雙和醫訊 <span className="badge">ADMIN</span></div><button className="text-button" onClick={logout}>登出</button></header>
    <div className="admin-title"><div><p className="eyebrow">SECURE QR ANALYTICS</p><h1>QR Code 管理與統計</h1><p>建立主題與公播區域的專屬 QR Code，查看匿名 QR 導入紀錄。</p></div></div>
    {message && <p className="admin-message" role="status">{message}</p>}

    <section className="admin-section"><p className="eyebrow">STEP 1</p><h2>建立正式資料</h2><div className="admin-form-grid">
      <form className="panel admin-form" onSubmit={(event) => createCatalog(event, "topic")}><h3>醫訊主題</h3><label>所屬期號<select name="issue_id" required defaultValue=""><option value="" disabled>請選擇</option>{issues.map(i => <option key={i.issue_id} value={i.issue_id}>{i.issue_id}｜{i.title}</option>)}</select></label><label>正式主題名稱<input name="title" maxLength={160} required /></label><button className="button primary">新增主題</button></form>
      <form className="panel admin-form" onSubmit={(event) => createCatalog(event, "placement")}><h3>公播區域</h3><label>正式區域名稱<input name="name" maxLength={120} required /></label><label>位置說明（選填）<textarea name="description" maxLength={500} /></label><button className="button primary">新增區域</button></form>
    </div></section>

    <section className="admin-section"><p className="eyebrow">STEP 2</p><h2>產生專屬 QR Code</h2><form className="panel admin-form qr-form" onSubmit={createRoute}><label>醫訊主題<select name="topic_id" required defaultValue=""><option value="" disabled>請選擇</option>{topics.filter(t => t.active).map(t => <option key={t.id} value={t.id}>{t.issue_id}｜{t.title}</option>)}</select></label><label>公播區域<select name="placement_id" required defaultValue=""><option value="" disabled>請選擇</option>{placements.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><button className="button primary" disabled={!topics.length || !placements.length}>產生 QR Code</button></form>
      <div className="table-wrap panel"><table><thead><tr><th>醫訊主題</th><th>公播區域</th><th>QR ID</th><th>下載</th></tr></thead><tbody>{routes.map(route => <tr key={route.qr_id}><td>{route.topic.title}</td><td>{route.placement.name}</td><td><code>{route.qr_id}</code></td><td><a className="download-link" href={`/api/admin/qr-routes/${route.qr_id}/image?format=png`}>PNG</a> <a className="download-link" href={`/api/admin/qr-routes/${route.qr_id}/image?format=svg`}>SVG</a></td></tr>)}{!routes.length && <tr><td colSpan={4}>尚未建立 QR Code。</td></tr>}</tbody></table></div>
    </section>

    <section className="admin-section"><p className="eyebrow">QR ENTRIES</p><h2>QR 導入統計</h2><div className="kpis compact-kpis"><article><span>全部 QR 導入次數</span><strong className="accent">{total}</strong></article><article><span>主題數</span><strong>{topicCounts.length}</strong></article><article><span>有導入的區域數</span><strong>{placementCounts.length}</strong></article></div><div className="two-panels"><CountPanel title="各主題 QR 導入次數" rows={topicCounts.map(i => [i.topic_title ?? "—", i.qr_entries])} /><CountPanel title="各區域 QR 導入次數" rows={placementCounts.map(i => [i.placement_name ?? "—", i.qr_entries])} /></div></section>
    <section className="admin-section"><h2>最近掃碼紀錄</h2><div className="table-wrap panel"><table><thead><tr><th>掃碼時間</th><th>醫訊期號</th><th>醫訊主題</th><th>公播區域</th><th>QR ID</th></tr></thead><tbody>{entries.map(entry => <tr key={entry.id}><td>{new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Taipei" }).format(new Date(entry.received_at_utc))}</td><td>{entry.issue_id}</td><td>{entry.topic_title}</td><td>{entry.placement_name}</td><td><code>{entry.qr_id}</code></td></tr>)}{!entries.length && <tr><td colSpan={5}>目前沒有 QR 導入紀錄。</td></tr>}</tbody></table></div><p className="note">時間顯示為 Asia/Taipei。這裡統計的是 QR 導入次數，不是掃描率，也不代表看過公播內容的總人數。</p></section>
  </div></main>;
}

function CountPanel({ title, rows }: { title: string; rows: [string, number][] }) {
  return <div className="panel count-panel"><h3>{title}</h3>{rows.length ? rows.map(([label, value]) => <div className="count-row" key={label}><span>{label}</span><strong>{value}</strong></div>) : <p>目前沒有紀錄。</p>}</div>;
}

async function api(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, headers: { "content-type": "application/json", ...init?.headers }, cache: "no-store" });
  const result = await response.json().catch(() => ({ error: "伺服器回應格式不正確" }));
  if (response.status === 401) window.location.assign("/admin/login");
  if (!response.ok) throw new Error(result.error ?? "操作失敗");
  return result;
}
