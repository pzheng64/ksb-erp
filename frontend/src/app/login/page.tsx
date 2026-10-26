"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { LanguageToggle, useText } from "@/lib/i18n";
import { pickStartup, startupChoices, useSettings } from "@/lib/settings";
import { Banner } from "@/components/ui";

const demos = [
  ["auth.demo.ceo", "ceo", "Ceo@12345"],
  ["auth.demo.admin", "admin", "Admin@12345"],
  ["auth.demo.hr", "hr", "Hr@12345"],
  ["auth.demo.warehouse", "warehouse", "Wh@12345"],
  ["auth.demo.finance", "finance", "Finance@12345"],
  ["auth.demo.books", "books", "Books@12345"],
  ["auth.demo.clerk", "clerk", "Clerk@12345"],
];

export default function LoginPage() {
  const { t } = useText();
  const { login, me, ready, has } = useSession();
  const { startupHref } = useSettings();
  const router = useRouter();
  const [username, setUsername] = useState("ceo");
  const [password, setPassword] = useState("Ceo@12345");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ready && me) {
      const allowed = startupChoices(has, me).map((item) => item.href);
      router.replace(pickStartup(startupHref, allowed));
    }
  }, [ready, me, has, startupHref, router]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("auth.failed"));
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <section className="flex flex-col justify-between bg-ink px-8 py-10 text-paper md:px-12">
        <div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-serif text-3xl">KSB</div>
              <div className="mt-1 text-sm text-paper/50">{t("auth.groupOps")}</div>
            </div>
            <LanguageToggle />
          </div>
        </div>
        <div className="max-w-md">
          <h1 className="font-serif text-5xl leading-tight">{t("auth.tagline")}</h1>
          <p className="mt-4 text-paper/65">{t("auth.blurb")}</p>
        </div>
        <div className="text-xs uppercase tracking-[0.18em] text-brass-bright">{t("auth.eyebrow")}</div>
      </section>
      <section className="flex items-center justify-center px-6 py-12">
        <form className="w-full max-w-md" onSubmit={onSubmit}>
          <h2 className="font-serif text-3xl">{t("auth.signIn")}</h2>
          <p className="mt-1 text-sm text-ink/55">
            {t("auth.newHere")} <Link className="text-brass" href="/register">{t("auth.requestAccount")}</Link>
          </p>
          {error && <div className="mt-4"><Banner>{error}</Banner></div>}
          <label className="mt-5 block">
            <span className="label">{t("auth.username")}</span>
            <input className="field" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
          </label>
          <label className="mt-3 block">
            <span className="label">{t("auth.password")}</span>
            <input className="field" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
          </label>
          <button className="btn-primary mt-5 w-full" disabled={busy} type="submit">
            {busy ? t("auth.signingIn") : t("auth.enter")}
          </button>
          <div className="mt-8">
            <div className="label">{t("auth.demoAccess")}</div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {demos.map(([label, user, pass]) => (
                <button
                  key={user}
                  className="rounded-md border border-line bg-paper px-3 py-2 text-left text-sm hover:border-brass"
                  type="button"
                  onClick={() => {
                    setUsername(user);
                    setPassword(pass);
                  }}
                >
                  <span className="block text-ink/80">{t(label)}</span>
                  <span className="text-xs text-ink/40">{user}</span>
                </button>
              ))}
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}
