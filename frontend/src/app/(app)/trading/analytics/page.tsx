"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartCard, Tip, axisProps, chartColors } from "@/components/charts";
import { AnalyticsLayout } from "@/components/report";
import { Banner, Loading } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { money, moneyParts, todayInput } from "@/lib/format";
import { useText } from "@/lib/i18n";

type Snapshot = {
  range: { from: string | null; to: string | null };
  kpis: {
    orders: number;
    buys: number;
    sells: number;
    customers: number;
    open: number;
    settled: number;
    sell_amount: Record<string, number>;
    consumed: Record<string, number>;
    goods_cost: Record<string, number>;
    shipping: Record<string, number>;
    procedure: Record<string, number>;
  };
  by_status: { name: string; value: number }[];
  by_customer: { id: number; name: string; kind: string | null; orders: number; amounts: Record<string, number>; rmb: number; usd: number }[];
  by_category: { name: string; value: number }[];
  cost_parts: Record<string, { name: string; value: number }[]>;
  months: Record<string, { month: string; buy: number; sell: number }[]>;
  open_trades: { id: number; order_no: string; direction: string; counterparty: string; amount: number; currency: string; trade_date: string }[];
};

function yearStart() {
  return `${new Date().getFullYear()}-01-01`;
}

export default function TradingAnalyticsPage() {
  const { t } = useText();
  const [from, setFrom] = useState(yearStart());
  const [to, setTo] = useState(todayInput());
  const [applied, setApplied] = useState({ from: yearStart(), to: todayInput() });
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (applied.from) params.set("date_from", applied.from);
    if (applied.to) params.set("date_to", applied.to);
    setData(null);
    api<Snapshot>(`/trades/analytics?${params.toString()}`)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : t("common.loadFailed")));
  }, [applied, t]);

  const customers = (data?.by_customer || []).map((row) => ({
    ...row,
    label: row.name,
  }));
  const categories = (data?.by_category || []).map((row) => ({
    name: t(`tradeCategory.${row.name}`),
    value: row.value,
  }));
  const costs = (data?.cost_parts.RMB || []).map((row) => ({
    name: t(`tradeCost.${row.name}`),
    value: row.value,
  }));
  const statuses = (data?.by_status || []).map((row) => ({
    name: t(`tradeStatus.${row.name}`),
    value: row.value,
  }));

  return (
    <AnalyticsLayout title={t("analytics.title")} eyebrow={t("nav.trading")} filename="trading-analytics">
      <form
        className="mb-4 flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          setApplied({ from, to });
        }}
      >
        <label className="block">
          <span className="label">{t("trading.dateFrom")}</span>
          <input className="field" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label className="block">
          <span className="label">{t("trading.dateTo")}</span>
          <input className="field" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
        <button className="btn-primary" type="submit">
          {t("trading.apply")}
        </button>
        <button
          className="btn-ghost"
          type="button"
          onClick={() => {
            setFrom("");
            setTo("");
            setApplied({ from: "", to: "" });
          }}
        >
          {t("trading.allDates")}
        </button>
      </form>
      {error && <Banner>{error}</Banner>}
      {!data && !error && <Loading />}
      {data && (
        <>
          <p className="mb-4 text-sm text-ink/60">
            {data.kpis.orders} {t("nav.orders")} · {data.kpis.buys} {t("trading.buy")} · {data.kpis.sells} {t("trading.sell")} · {data.kpis.customers} {t("nav.customers")}
            {" · "}
            {t("trading.sellTotal")} {moneyParts(data.kpis.sell_amount)}
            {" · "}
            {t("trading.purchaseTotal")} {moneyParts(data.kpis.consumed)}
          </p>
          <p className="mb-4 text-sm text-ink/50">
            {t("tradeCost.original")} {moneyParts(data.kpis.goods_cost)} · {t("tradeCost.shipping")} {moneyParts(data.kpis.shipping)} · {t("tradeCost.procedure")} {moneyParts(data.kpis.procedure)}
          </p>
          <div className="grid gap-4 xl:grid-cols-2">
            <ChartCard title={t("trading.perCustomer")} hint={t("trading.rmbHint")}>
              <BarChart data={customers}>
                <CartesianGrid stroke="#efe8dc" vertical={false} />
                <XAxis dataKey="name" {...axisProps} interval={0} angle={-18} height={70} textAnchor="end" />
                <YAxis {...axisProps} />
                <Tip />
                <Bar dataKey="rmb" fill={chartColors[0]} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ChartCard>
            <ChartCard title={t("trading.costSummary")} hint={t("trading.rmbHint")}>
              <BarChart data={costs}>
                <CartesianGrid stroke="#efe8dc" vertical={false} />
                <XAxis dataKey="name" {...axisProps} />
                <YAxis {...axisProps} />
                <Tip />
                <Bar dataKey="value" fill={chartColors[2]} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ChartCard>
            <ChartCard title={t("trading.sellByCategory")} hint={t("trading.rmbHint")}>
              <BarChart data={categories}>
                <CartesianGrid stroke="#efe8dc" vertical={false} />
                <XAxis dataKey="name" {...axisProps} />
                <YAxis {...axisProps} />
                <Tip />
                <Bar dataKey="value" fill={chartColors[1]} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ChartCard>
            <ChartCard title={t("common.status")}>
              <BarChart data={statuses}>
                <CartesianGrid stroke="#efe8dc" vertical={false} />
                <XAxis dataKey="name" {...axisProps} />
                <YAxis {...axisProps} allowDecimals={false} />
                <Tip />
                <Bar dataKey="value" fill={chartColors[3]} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ChartCard>
            <ChartCard title="RMB" hint={`${t("trading.buy")} / ${t("trading.sell")}`}>
              <BarChart data={data.months.RMB || []}>
                <CartesianGrid stroke="#efe8dc" vertical={false} />
                <XAxis dataKey="month" {...axisProps} />
                <YAxis {...axisProps} />
                <Tip />
                <Bar dataKey="buy" fill={chartColors[2]} radius={[3, 3, 0, 0]} />
                <Bar dataKey="sell" fill={chartColors[1]} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ChartCard>
          </div>
          <section className="card mt-4 p-4">
            <h3 className="font-serif text-xl">{t("trading.perCustomer")}</h3>
            <table className="data-table mt-2">
              <thead>
                <tr>
                  <th>{t("trading.customer")}</th>
                  <th>{t("common.kind")}</th>
                  <th>{t("trading.ordersCount")}</th>
                  <th>RMB</th>
                  <th>USD</th>
                </tr>
              </thead>
              <tbody>
                {data.by_customer.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link className="text-brass" href={`/trading/customers/${row.id}`}>
                        {row.name}
                      </Link>
                    </td>
                    <td>{row.kind ? t(`customerKind.${row.kind}`) : "–"}</td>
                    <td>{row.orders}</td>
                    <td>{money(row.rmb, "RMB", 2)}</td>
                    <td>{money(row.usd, "USD", 2)}</td>
                  </tr>
                ))}
                {!data.by_customer.length && (
                  <tr>
                    <td colSpan={5} className="text-ink/50">
                      {t("common.empty")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        </>
      )}
    </AnalyticsLayout>
  );
}
