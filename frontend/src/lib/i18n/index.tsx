"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Locale, translate, translateLiteral } from "./messages";

const STORAGE_KEY = "ksb_locale";

type I18n = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const Ctx = createContext<I18n | null>(null);

function readLocale(): Locale {
  if (typeof window === "undefined") return "en";
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === "zh" || saved === "en" ? saved : "en";
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setLocaleState(readLocale());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
    document.documentElement.dataset.locale = locale;
    localStorage.setItem(STORAGE_KEY, locale);
  }, [locale, ready]);

  const setLocale = useCallback((next: Locale) => {
    localStorage.setItem(STORAGE_KEY, next);
    setLocaleState(next);
  }, []);

  const t = useCallback((key: string, vars?: Record<string, string | number>) => translate(locale, key, vars), [locale]);

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("Locale is unavailable");
  return ctx;
}

export function useText() {
  const i18n = useI18n();
  const text = useCallback((value: string) => translateLiteral(i18n.locale, value), [i18n.locale]);
  return { ...i18n, text };
}

export function Tx({ value }: { value: string }) {
  const { text } = useText();
  return <>{text(value)}</>;
}

export function Term({ prefix, value }: { prefix: string; value?: string | null }) {
  const { t } = useI18n();
  if (!value) return "–";
  const key = `${prefix}.${value}`;
  const label = t(key);
  return label === key ? value.replaceAll("_", " ") : label;
}

export function LanguageToggle({ className = "" }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  const on = "rounded bg-brass px-2 py-1 font-medium text-ink";
  const off = "rounded px-2 py-1 opacity-70 hover:opacity-100";
  return (
    <div className={`inline-flex rounded-md border border-current/20 p-0.5 text-xs ${className}`} role="group" aria-label={t("lang.switch")}>
      <button type="button" className={locale === "en" ? on : off} aria-pressed={locale === "en"} onClick={() => setLocale("en")}>
        EN
      </button>
      <button type="button" className={locale === "zh" ? on : off} aria-pressed={locale === "zh"} onClick={() => setLocale("zh")}>
        中文
      </button>
    </div>
  );
}
