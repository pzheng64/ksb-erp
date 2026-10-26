"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { ChartCard, Tip, axisProps, chartColors } from "@/components/charts";
import { Banner, Loading } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { money, when } from "@/lib/format";
import { Term, useText } from "@/lib/i18n";

type Overview = {
  generated_at: string;
  kpis: {
    headcount: number;
    on_site: number;
    not_in: number;
    late: number;
    left_this_year: number;
    inventory: Record<string, number>;
    vault: Record<string, number>;
    this_month: Record<string, { income: number; expense: number }>;
    open_trades: number;
    low_stock: number;
  };
  signals: { level: string; title: string; detail: string }[];
  workforce: {
    by_unit: { name: string; value: number }[];
    by_age: { name: string; value: number }[];
    by_tenure: { name: string; value: number }[];
    attendance_week: { label: string; present: number; late: number; absent: number; leave: number }[];
    attendance_today: { present: number; late: number; not_in: number; leave: number; absent: number };
  };
  goods: { by_category: { category: string; currency: string; value: number }[]; low_stock: { name: string; on_hand: number; quota: number; short: number; uom: string }[] };
  finance: { months: Record<string, { month: string; income: number; expense: number }[]> };
  operations: { open_trades: { order_no: string; direction: string; counterparty: string; amount: number; currency: string }[]; equipment_maintenance: number; fleet_maintenance: number };
  recent_events: { id: number; event_type: string; occurred_on: string; employee: string; from_unit?: string | null; to_unit?: string | null; note?: string | null }[];
};

export default function HomePage() {
  const { has } = useSession();
  if (!has("dashboard.view")) return <PersonalHome />;
  return <CommandCenter />;
}

function CommandCenter() {
  const { t } = useText();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setData(await api<Overview>("/dashboard/overview"));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The command center could not refresh");
    }
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 20000);
    return () => clearInterval(timer);
  }, []);

  if (!data && !error) return <Loading label="Reading the business" />;
  if (!data) return <Banner>{error}</Banner>;

  const month = data.kpis.this_month.RMB;
  const net = (month?.income || 0) - (month?.expense || 0);
  const stockRmb = data.goods.by_category.filter((row) => row.currency === "RMB").map((row) => ({ name: t(`category.${row.category}`) === `category.${row.category}` ? row.category : t(`category.${row.category}`), value: row.value }));

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-brass">
            <span className="live-dot inline-block h-2 w-2 rounded-full bg-pine" />
            {t("dashboard.live")} · {when(data.generated_at)}
          </div>
          <h1 className="font-serif text-4xl tracking-tight">{t("dashboard.commandCenter")}</h1>
        </div>
        <button className="btn-ghost" onClick={load} type="button">{t("common.refresh")}</button>
      </div>
      {error && <Banner>{error}</Banner>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="People on site" value={`${data.kpis.on_site}`} hint={`${data.kpis.late} late · ${data.kpis.not_in} not in · ${data.kpis.headcount} active`} />
        <Kpi label="Inventory" value={money(data.kpis.inventory.RMB)} hint={data.kpis.inventory.USD ? `plus ${money(data.kpis.inventory.USD, "USD")} · vault separate below` : "RMB stock at cost"} />
        <Kpi label="Month net, RMB" value={money(net)} hint={`Income ${money(month?.income)} · expense ${money(month?.expense)}`} />
        <Kpi label="Open trades" value={String(data.kpis.open_trades)} hint={`${data.kpis.low_stock} goods below quota · ${data.kpis.left_this_year} left this year`} />
      </div>

      {!!data.signals.length && (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {data.signals.map((signal) => (
            <article key={signal.title} className={`card border-l-4 p-4 ${signal.level === "attention" ? "border-l-clay" : signal.level === "watch" ? "border-l-brass" : "border-l-tide"}`}>
              <h2 className="font-medium">{signal.title}</h2>
              <p className="mt-1 text-sm text-ink/60">{signal.detail}</p>
            </article>
          ))}
        </div>
      )}

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <ChartCard title="Headcount by unit" hint="Active people">
          <BarChart data={data.workforce.by_unit}>
            <CartesianGrid stroke="#efe8dc" vertical={false} />
            <XAxis dataKey="name" {...axisProps} interval={0} angle={-18} height={60} textAnchor="end" />
            <YAxis {...axisProps} allowDecimals={false} />
            <Tip />
            <Bar dataKey="value" fill={chartColors[0]} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ChartCard>
        <ChartCard title="Age bands" hint="Active workforce">
          <BarChart data={data.workforce.by_age}>
            <CartesianGrid stroke="#efe8dc" vertical={false} />
            <XAxis dataKey="name" {...axisProps} />
            <YAxis {...axisProps} allowDecimals={false} />
            <Tip />
            <Bar dataKey="value" fill={chartColors[3]} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ChartCard>
        <ChartCard title="Stock value by use" hint="RMB, at average receipt cost">
          <BarChart data={stockRmb}>
            <CartesianGrid stroke="#efe8dc" vertical={false} />
            <XAxis dataKey="name" {...axisProps} interval={0} angle={-12} height={50} textAnchor="end" />
            <YAxis {...axisProps} />
            <Tip />
            <Bar dataKey="value" fill={chartColors[0]} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ChartCard>
        <ChartCard title="Income and expense" hint="RMB, last six months">
          <BarChart data={data.finance.months.RMB || []}>
            <CartesianGrid stroke="#efe8dc" vertical={false} />
            <XAxis dataKey="month" {...axisProps} />
            <YAxis {...axisProps} />
            <Tip />
            <Legend />
            <Bar dataKey="income" fill={chartColors[1]} radius={[3, 3, 0, 0]} />
            <Bar dataKey="expense" fill={chartColors[2]} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ChartCard>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="card p-4">
          <h3 className="font-serif text-xl">Attendance this week</h3>
          <div className="mt-3 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.workforce.attendance_week}>
                <CartesianGrid stroke="#efe8dc" vertical={false} />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis {...axisProps} allowDecimals={false} />
                <Tip />
                <Legend />
                <Bar dataKey="present" stackId="a" fill={chartColors[1]} />
                <Bar dataKey="late" stackId="a" fill={chartColors[0]} />
                <Bar dataKey="leave" stackId="a" fill={chartColors[3]} />
                <Bar dataKey="absent" stackId="a" fill={chartColors[2]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="card overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-4">
            <h3 className="font-serif text-xl">Latest workforce moves</h3>
            <Link className="text-sm text-brass" href="/employees/movements">Open the log</Link>
          </div>
          <ul className="divide-y divide-line">
            {data.recent_events.map((event) => (
              <li key={event.id} className="px-4 py-3 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="font-medium">{event.employee}</span>
                  <span className="text-ink/45">{event.occurred_on}</span>
                </div>
                <div className="text-ink/60">
                  <Term prefix="event" value={event.event_type} />
                  {event.from_unit || event.to_unit ? ` · ${event.from_unit || "–"} → ${event.to_unit || "–"}` : ""}
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="card p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-serif text-xl">Below quota</h3>
            <Link className="text-sm text-brass" href="/goods">Goods list</Link>
          </div>
          <table className="data-table mt-2">
            <thead><tr><th>Goods</th><th>On hand</th><th>Quota</th><th>Short</th></tr></thead>
            <tbody>
              {data.goods.low_stock.map((row) => (
                <tr key={row.name}><td>{row.name}</td><td>{row.on_hand}</td><td>{row.quota}</td><td>{row.short} {row.uom}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="card p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-serif text-xl">Open trades</h3>
            <Link className="text-sm text-brass" href="/trading">Trading</Link>
          </div>
          <ul className="mt-3 divide-y divide-line text-sm">
            {data.operations.open_trades.map((row) => (
              <li key={row.order_no} className="flex justify-between gap-3 py-2">
                <span>{row.order_no} · {row.counterparty}</span>
                <span>{row.direction} {money(row.amount, row.currency)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink/45">{data.operations.equipment_maintenance} assets and {data.operations.fleet_maintenance} vehicles are in maintenance.</p>
        </section>
      </div>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <article className="card p-4">
      <div className="text-[11px] uppercase tracking-[0.16em] text-ink/45">{label}</div>
      <div className="mt-2 font-serif text-4xl tracking-tight">{value}</div>
      <p className="mt-1 text-xs text-ink/55">{hint}</p>
    </article>
  );
}

function PersonalHome() {
  const { t } = useText();
  const { me } = useSession();
  const [roster, setRoster] = useState<{ status: string; clock_in?: string | null; clock_out?: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!me?.employee) return;
    const result = await api<{ items: { status: string; clock_in?: string | null; clock_out?: string | null }[] }>("/employees/attendance");
    setRoster(result.items[0] || null);
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof ApiError ? err.message : "Attendance is unavailable"));
  }, [me?.employee?.id]);

  if (!me) return null;

  async function clockIn() {
    const employeeId = me?.employee?.id;
    if (!employeeId) return;
    setError(null);
    try {
      await api("/employees/attendance/clock", { method: "POST", body: JSON.stringify({ employee_id: employeeId }) });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Clock failed");
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="text-[11px] uppercase tracking-[0.16em] text-brass">{t("dashboard.myDay")}</div>
      <h1 className="font-serif text-4xl">Hello, {me.full_name.split(" ")[0]}</h1>
      <p className="mt-2 text-sm text-ink/60">{me.roles.map((role) => role.name).join(", ") || t("nav.staff")}{me.unit ? ` · ${me.unit.name}` : ""}</p>
      {error && <div className="mt-4"><Banner>{error}</Banner></div>}
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <section className="card p-4">
          <h2 className="font-serif text-xl">Today</h2>
          <p className="mt-2 text-sm text-ink/60">{t("common.status")}: <Term prefix="attendance" value={roster?.status || "not_in"} /></p>
          <p className="text-sm text-ink/60">In {when(roster?.clock_in)} · Out {when(roster?.clock_out)}</p>
          {me.employee && (
            <button className="btn-primary mt-4" onClick={clockIn} type="button">
              {roster?.clock_in && !roster.clock_out ? t("attendance.clockOut") : t("attendance.clockIn")}
            </button>
          )}
          {!me.employee && <p className="mt-3 text-sm text-ink/50">No employee card is linked to this account yet.</p>}
        </section>
        <section className="card p-4">
          <h2 className="font-serif text-xl">Assignment</h2>
          <p className="mt-2 text-sm">Position: {me.position?.name || "None yet"}</p>
          <p className="mt-2 text-sm">Roles: {me.roles.map((role) => role.name).join(", ") || "None yet"}</p>
          <Link className="mt-4 inline-block text-sm text-brass" href="/profile">Profile and password</Link>
        </section>
      </div>
    </div>
  );
}
