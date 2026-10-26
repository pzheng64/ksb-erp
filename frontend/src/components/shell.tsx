"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  BriefcaseBusiness,
  Building2,
  ClipboardList,
  Clock,
  Handshake,
  Store,
  IdCard,
  Route,
  LayoutDashboard,
  Menu,
  Package,
  Settings,
  PieChart,
  Shield,
  Truck,
  UserRound,
  Users,
  Wallet,
  Coins,
  Wrench,
  X,
  type LucideIcon,
} from "lucide-react";
import { useSession } from "@/lib/auth";
import { LanguageToggle, useText } from "@/lib/i18n";
import type { Me } from "@/lib/types";

type Item = {
  href: string;
  label: string;
  icon: LucideIcon;
  show: (has: (code: string) => boolean, me: Me) => boolean;
  badge?: boolean;
};

const groups: { label: string; items: Item[] }[] = [
  {
    label: "Overview",
    items: [
      { href: "/", label: "Command center", icon: LayoutDashboard, show: (has) => has("dashboard.view") },
      { href: "/", label: "My day", icon: LayoutDashboard, show: (has) => !has("dashboard.view") },
    ],
  },
  {
    label: "Administration",
    items: [
      { href: "/admin/users", label: "Users", icon: Users, show: (has) => has("users.manage"), badge: true },
      { href: "/admin/roles", label: "Roles", icon: Shield, show: (has) => has("roles.manage") },
      { href: "/admin/units", label: "Units", icon: Building2, show: (has) => has("org.manage") || has("employees.read") || has("employees.write") },
      { href: "/admin/positions", label: "Positions", icon: BriefcaseBusiness, show: (has) => has("org.manage") },
      { href: "/admin/analytics", label: "Analytics", icon: PieChart, show: (has) => has("users.manage") || has("dashboard.view") },
    ],
  },
  {
    label: "Employment",
    items: [
      { href: "/employees", label: "Employees", icon: IdCard, show: (has) => has("employees.read") || has("employees.write") },
      {
        href: "/employees/attendance",
        label: "Attendance",
        icon: Clock,
        show: (has, me) => has("employees.read") || has("employees.write") || Boolean(me.employee),
      },
      { href: "/employees/movements", label: "Movements", icon: ArrowLeftRight, show: (has) => has("employees.read") || has("employees.write") },
      { href: "/employees/analytics", label: "Analytics", icon: PieChart, show: (has) => has("employees.read") || has("employees.write") || has("dashboard.view") },
    ],
  },
  {
    label: "Goods",
    items: [
      { href: "/goods", label: "Goods list", icon: Package, show: (has) => has("goods.read") || has("goods.write") },
      { href: "/goods/stock-in", label: "In", icon: ArrowDownToLine, show: (has) => has("goods.read") || has("goods.write") },
      { href: "/goods/stock-out", label: "Out", icon: ArrowUpFromLine, show: (has) => has("goods.read") || has("goods.write") },
      { href: "/goods/types", label: "Goods types", icon: ClipboardList, show: (has) => has("goods.read") || has("goods.write") },
      { href: "/goods/purchase-from", label: "Purchase from", icon: Handshake, show: (has) => has("goods.read") || has("goods.write") },
      { href: "/goods/analytics", label: "Analytics", icon: PieChart, show: (has) => has("goods.read") || has("goods.write") || has("dashboard.view") },
    ],
  },
  {
    label: "Equipment",
    items: [
      { href: "/equipment", label: "Assets", icon: Wrench, show: (has) => has("equipment.read") || has("equipment.write") },
      { href: "/equipment/analytics", label: "Analytics", icon: PieChart, show: (has) => has("equipment.read") || has("equipment.write") || has("dashboard.view") },
    ],
  },
  {
    label: "Vehicles",
    items: [
      { href: "/transport", label: "Fleet", icon: Truck, show: (has) => has("transport.read") || has("transport.write") },
      { href: "/transport/runs", label: "Running history", icon: Route, show: (has) => has("transport.read") || has("transport.write") },
      { href: "/transport/analytics", label: "Analytics", icon: PieChart, show: (has) => has("transport.read") || has("transport.write") || has("dashboard.view") },
    ],
  },
  {
    label: "Trading",
    items: [
      { href: "/trading", label: "Orders", icon: Handshake, show: (has, me) => has("trading.read") || has("trading.write") || Boolean(me.employee) },
      { href: "/trading/sales", label: "Sales", icon: Store, show: (has, me) => has("trading.read") || has("trading.write") || Boolean(me.employee) },
      { href: "/trading/customers", label: "Customers", icon: Users, show: (has) => has("trading.read") || has("trading.write") },
      { href: "/trading/goods", label: "Trade goods", icon: Package, show: (has) => has("trading.read") || has("trading.write") },
      { href: "/trading/analytics", label: "Analytics", icon: PieChart, show: (has) => has("trading.read") || has("trading.write") || has("dashboard.view") },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/finance", label: "Register", icon: Wallet, show: (has) => has("finance.read") || has("finance.write") },
      { href: "/finance/rates", label: "Rates", icon: Coins, show: (has) => has("finance.read") || has("finance.write") },
      { href: "/finance/analytics", label: "Analytics", icon: PieChart, show: (has) => has("finance.read") || has("finance.write") || has("dashboard.view") },
    ],
  },
];

const labelKey: Record<string, string> = {
  Overview: "nav.overview",
  "Command center": "nav.commandCenter",
  "My day": "nav.myDay",
  Administration: "nav.administration",
  Users: "nav.users",
  Roles: "nav.roles",
  Units: "nav.units",
  Positions: "nav.positions",
  Analytics: "nav.analytics",
  Employment: "nav.employment",
  Employees: "nav.employees",
  Attendance: "nav.attendance",
  Movements: "nav.movements",
  Goods: "nav.goods",
  "Goods list": "nav.goodsList",
  In: "nav.goodsIn",
  Out: "nav.goodsOut",
  "Goods types": "nav.goodsTypes",
  "Purchase from": "nav.purchaseFrom",
  Equipment: "nav.equipment",
  Assets: "nav.assets",
  Vehicles: "nav.vehicles",
  Fleet: "nav.fleet",
  "Running history": "nav.runningHistory",
  Trading: "nav.trading",
  Orders: "nav.orders",
  Sales: "nav.sales",
  Customers: "nav.customers",
  "Trade goods": "nav.tradeGoods",
  Finance: "nav.finance",
  Register: "nav.register",
  Rates: "nav.rates",
};

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useText();
  const { me, logout, has, options } = useSession();
  const [open, setOpen] = useState(false);
  if (!me) return null;

  const visibleHrefs = groups.flatMap((group) => group.items.filter((item) => item.show(has, me)).map((item) => item.href));

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    if (pathname === href) return true;
    if (!pathname.startsWith(`${href}/`)) return false;
    return !visibleHrefs.some((other) => other !== href && other.startsWith(href) && (pathname === other || pathname.startsWith(`${other}/`)));
  }

  const nav = (
    <div className="flex flex-col">
      <div className="px-5 pb-4 pt-6">
        <div className="font-serif text-2xl tracking-tight text-paper">KSB</div>
        <div className="text-xs text-paper/50">{options.company?.name || t("nav.group")}</div>
      </div>
      <nav className="space-y-5 px-3 pb-4">
        {groups.map((group) => {
          const items = group.items.filter((item) => item.show(has, me));
          if (!items.length) return null;
          return (
            <div key={group.label}>
              <div className="px-2 pb-1 text-[10px] uppercase tracking-[0.18em] text-paper/35">{t(labelKey[group.label])}</div>
              <div className="space-y-0.5">
                {items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href + item.label}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={`flex items-center gap-2 rounded-md px-2 py-2 text-sm ${active ? "bg-white/10 text-brass-bright" : "text-paper/75 hover:bg-white/5 hover:text-paper"}`}
                    >
                      <Icon size={16} />
                      <span className="flex-1">{t(labelKey[item.label])}</span>
                      {item.badge && me.pending_users ? (
                        <span className="rounded-full bg-brass px-1.5 text-[10px] text-ink">{me.pending_users}</span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>
      <div className="border-t border-white/10 p-3">
        <Link
          href="/settings"
          onClick={() => setOpen(false)}
          className={`flex items-center gap-2 rounded-md px-2 py-2 text-sm ${pathname.startsWith("/settings") ? "bg-white/10 text-brass-bright" : "text-paper/75 hover:bg-white/5 hover:text-paper"}`}
        >
          <Settings size={16} />
          <span>{t("nav.settings")}</span>
        </Link>
        <Link href="/profile" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-paper/80 hover:bg-white/5">
          <UserRound size={16} />
          <span className="min-w-0 flex-1">
            <span className="block truncate">{me.full_name}</span>
            <span className="block truncate text-[11px] text-paper/40">{me.roles.map((role) => role.name).join(", ") || t("nav.staff")}</span>
          </span>
        </Link>
        <div className="mt-2 px-2">
          <LanguageToggle className="w-full justify-stretch border-paper/20 text-paper [&_button]:flex-1" />
        </div>
        <button className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-xs text-paper/45 hover:text-paper" onClick={logout} type="button">
          {t("nav.signOut")}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen md:grid md:grid-cols-[248px_1fr]">
      <aside className="hidden h-screen overflow-auto bg-ink text-paper md:sticky md:top-0 md:block">{nav}</aside>
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button className="absolute inset-0 bg-ink/50" onClick={() => setOpen(false)} aria-label={t("nav.closeMenu")} />
          <aside className="relative h-full w-72 overflow-auto bg-ink text-paper">{nav}</aside>
        </div>
      )}
      <div className="min-w-0">
        <div className="flex items-center gap-3 border-b border-line bg-paper/80 px-4 py-3 md:hidden">
          <button className="btn-ghost px-2" onClick={() => setOpen(true)} type="button" aria-label={t("nav.openMenu")}>
            {open ? <X size={16} /> : <Menu size={16} />}
          </button>
          <span className="font-serif text-lg">KSB</span>
        </div>
        <main className="mx-auto max-w-[110rem] px-4 py-4 md:px-6">{children}</main>
      </div>
    </div>
  );
}
