"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Me } from "./types";

export type CurrencyCode = "USD" | "RMB";

const CURRENCY_KEY = "ksb_currency";
const STARTUP_KEY = "ksb_startup";

export const CURRENCY_OPTIONS: CurrencyCode[] = ["USD", "RMB"];

type Choice = { href: string; labelKey: string; show: (has: (code: string) => boolean, me: Me) => boolean };

const startupCatalog: Choice[] = [
  { href: "/", labelKey: "nav.commandCenter", show: (has) => has("dashboard.view") },
  { href: "/", labelKey: "nav.myDay", show: (has) => !has("dashboard.view") },
  { href: "/admin/users", labelKey: "nav.users", show: (has) => has("users.manage") },
  { href: "/admin/roles", labelKey: "nav.roles", show: (has) => has("roles.manage") },
  { href: "/admin/units", labelKey: "nav.units", show: (has) => has("org.manage") || has("employees.read") || has("employees.write") },
  { href: "/admin/positions", labelKey: "nav.positions", show: (has) => has("org.manage") },
  { href: "/employees", labelKey: "nav.employees", show: (has) => has("employees.read") || has("employees.write") },
  { href: "/employees/attendance", labelKey: "nav.attendance", show: (has, me) => has("employees.read") || has("employees.write") || Boolean(me.employee) },
  { href: "/employees/movements", labelKey: "nav.movements", show: (has) => has("employees.read") || has("employees.write") },
  { href: "/goods", labelKey: "nav.goodsList", show: (has) => has("goods.read") || has("goods.write") },
  { href: "/equipment", labelKey: "nav.assets", show: (has) => has("equipment.read") || has("equipment.write") },
  { href: "/transport", labelKey: "nav.fleet", show: (has) => has("transport.read") || has("transport.write") },
  { href: "/trading", labelKey: "nav.orders", show: (has) => has("trading.read") || has("trading.write") },
  { href: "/finance", labelKey: "nav.register", show: (has) => has("finance.read") || has("finance.write") },
];

export function startupChoices(has: (code: string) => boolean, me: Me | null) {
  if (!me) return [];
  const seen = new Set<string>();
  const choices: { href: string; labelKey: string }[] = [];
  for (const item of startupCatalog) {
    if (!item.show(has, me) || seen.has(item.href)) continue;
    seen.add(item.href);
    choices.push({ href: item.href, labelKey: item.labelKey });
  }
  return choices;
}

export function readStartupHref() {
  if (typeof window === "undefined") return "/";
  const saved = localStorage.getItem(STARTUP_KEY);
  return saved && saved.startsWith("/") ? saved : "/";
}

export function pickStartup(saved: string, allowed: string[]) {
  if (allowed.includes(saved)) return saved;
  return allowed[0] || "/";
}

function readCurrency(): CurrencyCode {
  if (typeof window === "undefined") return "USD";
  return localStorage.getItem(CURRENCY_KEY) === "RMB" ? "RMB" : "USD";
}

type Settings = {
  ready: boolean;
  defaultCurrency: CurrencyCode;
  setDefaultCurrency: (currency: CurrencyCode) => void;
  startupHref: string;
  setStartupHref: (href: string) => void;
};

const Ctx = createContext<Settings | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [defaultCurrency, setCurrencyState] = useState<CurrencyCode>("USD");
  const [startupHref, setStartupState] = useState("/");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setCurrencyState(readCurrency());
    setStartupState(readStartupHref());
    setReady(true);
  }, []);

  const setDefaultCurrency = useCallback((currency: CurrencyCode) => {
    localStorage.setItem(CURRENCY_KEY, currency);
    setCurrencyState(currency);
  }, []);

  const setStartupHref = useCallback((href: string) => {
    localStorage.setItem(STARTUP_KEY, href);
    setStartupState(href);
  }, []);

  const value = useMemo(
    () => ({ ready, defaultCurrency, setDefaultCurrency, startupHref, setStartupHref }),
    [ready, defaultCurrency, setDefaultCurrency, startupHref, setStartupHref],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSettings() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("Settings are unavailable");
  return ctx;
}
