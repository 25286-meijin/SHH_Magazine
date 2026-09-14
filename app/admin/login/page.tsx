"use client";

import { FormEvent, useState } from "react";

export default function AdminLoginPage() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/admin/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
    });
    const result = await response.json().catch(() => ({ error: "登入服務暫時無法使用" }));
    if (response.ok) window.location.assign("/admin");
    else setError(result.error ?? "登入失敗");
    setBusy(false);
  }

  return <main className="admin-login"><form onSubmit={submit} className="login-card">
    <div className="logo"><span className="mark">SHH</span>雙和醫院公播管理系統 <span className="badge">ADMIN</span></div>
    <h1>管理員登入</h1>
    <p>只有經核准並具有 admin 角色的帳號可以查看。</p>
    <label>電子郵件<input name="email" type="email" autoComplete="username" required /></label>
    <label>密碼<input name="password" type="password" autoComplete="current-password" required /></label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="button primary" disabled={busy}>{busy ? "登入中…" : "登入"}</button>
  </form></main>;
}
