"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/ui";
import { useSession } from "@/lib/auth";
import { LanguageToggle, useText } from "@/lib/i18n";
import { CURRENCY_OPTIONS, pickStartup, startupChoices, useSettings, type CurrencyCode } from "@/lib/settings";

const tabs = [
  { id: "language", labelKey: "settings.language" },
  { id: "currency", labelKey: "settings.currency" },
  { id: "startup", labelKey: "settings.startup" },
] as const;

export default function SettingsPage() {
  const { t } = useText();
  const { has, me } = useSession();
  const { defaultCurrency, setDefaultCurrency, startupHref, setStartupHref } = useSettings();
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("language");
  const choices = useMemo(() => startupChoices(has, me), [has, me]);
  const startup = pickStartup(startupHref, choices.map((item) => item.href));

  return (
    <div>
      <PageHeader title={t("settings.title")} eyebrow={t("nav.settings")} />
      <p className="mb-4 max-w-2xl text-sm text-ink/60">{t("settings.blurb")}</p>
      <div className="mb-4 flex flex-wrap gap-1 border-b border-line" role="tablist">
        {tabs.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={`-mb-px border-b-2 px-3 py-2 text-sm ${active ? "border-brass font-medium text-ink" : "border-transparent text-ink/55 hover:text-ink"}`}
              onClick={() => setTab(item.id)}
            >
              {t(item.labelKey)}
            </button>
          );
        })}
      </div>
      <section className="card max-w-xl p-5">
        {tab === "language" && (
          <div>
            <h2 className="font-serif text-2xl">{t("settings.language")}</h2>
            <p className="mt-1 text-sm text-ink/60">{t("settings.languageHint")}</p>
            <div className="mt-4">
              <LanguageToggle className="text-ink" />
            </div>
          </div>
        )}
        {tab === "currency" && (
          <div>
            <h2 className="font-serif text-2xl">{t("settings.currency")}</h2>
            <p className="mt-1 text-sm text-ink/60">{t("settings.currencyHint")}</p>
            <label className="mt-4 block max-w-xs">
              <span className="label">{t("common.currency")}</span>
              <select
                className="field"
                value={defaultCurrency}
                onChange={(event) => setDefaultCurrency(event.target.value as CurrencyCode)}
              >
                {CURRENCY_OPTIONS.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {tab === "startup" && (
          <div>
            <h2 className="font-serif text-2xl">{t("settings.startup")}</h2>
            <p className="mt-1 text-sm text-ink/60">{t("settings.startupHint")}</p>
            <label className="mt-4 block max-w-xs">
              <span className="label">{t("settings.startup")}</span>
              <select className="field" value={startup} onChange={(event) => setStartupHref(event.target.value)}>
                {choices.map((item) => (
                  <option key={item.href} value={item.href}>
                    {t(item.labelKey)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        <p className="mt-5 text-xs text-ink/45">{t("settings.savedHere")}</p>
      </section>
    </div>
  );
}
