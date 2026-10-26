"use client";

import { FormEvent, useState } from "react";
import { Banner, PageHeader } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { useText } from "@/lib/i18n";

export default function ProfilePage() {
  const { t } = useText();
  const { me, refresh } = useSession();
  const [profile, setProfile] = useState({ full_name: me?.full_name || "", email: me?.email || "", phone: me?.phone || "" });
  const [passwords, setPasswords] = useState({ current_password: "", new_password: "" });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!me) return null;

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    try {
      await api("/auth/me", { method: "PATCH", body: JSON.stringify({ ...profile, phone: profile.phone || null }) });
      await refresh();
      setMessage(t("profile.saved"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.saveFailed"));
    }
  }

  async function savePassword(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    try {
      await api("/auth/change-password", { method: "POST", body: JSON.stringify(passwords) });
      setPasswords({ current_password: "", new_password: "" });
      setMessage(t("profile.passwordChanged"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("profile.passwordFailed"));
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="My profile" eyebrow="Account" />
      {message && <Banner tone="ok">{message}</Banner>}
      {error && <Banner>{error}</Banner>}
      <section className="card mb-4 grid gap-2 p-4 text-sm sm:grid-cols-2">
        <Info label={t("common.unit")} value={me.unit?.name} />
        <Info label={t("nav.roles")} value={me.roles.map((role) => role.name).join(", ") || t("common.none")} />
        <Info label={t("profile.employeeCard")} value={me.employee ? me.employee.full_name : t("profile.notLinked")} />
        <Info label={t("common.position")} value={me.position?.name} />
      </section>
      <form className="card grid gap-3 p-4" onSubmit={saveProfile}>
        <h2 className="font-serif text-2xl">{t("profile.contact")}</h2>
        <label><span className="label">{t("employees.fullName")}</span><input className="field" value={profile.full_name} onChange={(event) => setProfile({ ...profile, full_name: event.target.value })} /></label>
        <label><span className="label">{t("common.email")}</span><input className="field" type="email" value={profile.email} onChange={(event) => setProfile({ ...profile, email: event.target.value })} /></label>
        <label><span className="label">{t("common.phone")}</span><input className="field" value={profile.phone} onChange={(event) => setProfile({ ...profile, phone: event.target.value })} /></label>
        <div><button className="btn-primary" type="submit">{t("profile.save")}</button></div>
      </form>
      <form className="card mt-4 grid gap-3 p-4" onSubmit={savePassword}>
        <h2 className="font-serif text-2xl">{t("profile.password")}</h2>
        <label><span className="label">{t("profile.currentPassword")}</span><input className="field" type="password" value={passwords.current_password} onChange={(event) => setPasswords({ ...passwords, current_password: event.target.value })} required /></label>
        <label><span className="label">{t("profile.newPassword")}</span><input className="field" type="password" minLength={8} value={passwords.new_password} onChange={(event) => setPasswords({ ...passwords, new_password: event.target.value })} required /></label>
        <div><button className="btn-primary" type="submit">{t("profile.changePassword")}</button></div>
      </form>
    </div>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div>{value || "–"}</div>
    </div>
  );
}
