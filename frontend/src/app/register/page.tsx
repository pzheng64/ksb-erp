"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { LanguageToggle, useText } from "@/lib/i18n";
import { Banner } from "@/components/ui";

export default function RegisterPage() {
  const { t } = useText();
  const [units, setUnits] = useState<{ id: number; name: string }[]>([]);
  const [form, setForm] = useState({ username: "", email: "", password: "", full_name: "", phone: "", unit_id: "" });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ items: { id: number; name: string }[] }>("/auth/units")
      .then((result) => setUnits(result.items))
      .catch(() => setUnits([]));
  }, []);

  function set(key: string, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ message: string }>("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          phone: form.phone || null,
          unit_id: form.unit_id ? Number(form.unit_id) : null,
        }),
      });
      setMessage(result.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("register.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12">
      <div className="flex items-center justify-between gap-3">
        <Link href="/login" className="text-sm text-brass">{t("register.back")}</Link>
        <LanguageToggle className="border-ink/20 text-ink" />
      </div>
      <h1 className="mt-3 font-serif text-4xl">{t("register.title")}</h1>
      <p className="mt-2 text-sm text-ink/60">{t("register.blurb")}</p>
      {message && <div className="mt-4"><Banner tone="ok">{message}</Banner></div>}
      {error && <div className="mt-4"><Banner>{error}</Banner></div>}
      {!message && (
        <form className="mt-6 grid gap-3" onSubmit={onSubmit}>
          <label><span className="label">{t("register.fullName")}</span><input className="field" value={form.full_name} onChange={(event) => set("full_name", event.target.value)} required /></label>
          <label><span className="label">{t("auth.username")}</span><input className="field" value={form.username} onChange={(event) => set("username", event.target.value)} required /></label>
          <label><span className="label">{t("common.email")}</span><input className="field" type="email" value={form.email} onChange={(event) => set("email", event.target.value)} required /></label>
          <label><span className="label">{t("auth.password")}</span><input className="field" type="password" minLength={8} value={form.password} onChange={(event) => set("password", event.target.value)} required /></label>
          <label><span className="label">{t("common.phone")}</span><input className="field" value={form.phone} onChange={(event) => set("phone", event.target.value)} /></label>
          <label>
            <span className="label">{t("register.requestedUnit")}</span>
            <select className="field" value={form.unit_id} onChange={(event) => set("unit_id", event.target.value)}>
              <option value="">{t("register.noPreference")}</option>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>{unit.name}</option>
              ))}
            </select>
          </label>
          <button className="btn-primary mt-2" disabled={busy} type="submit">{busy ? t("register.submitting") : t("register.submit")}</button>
        </form>
      )}
    </div>
  );
}
