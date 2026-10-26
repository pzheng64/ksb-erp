"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartCard, Tip, axisProps, chartColors } from "@/components/charts";
import { Banner, Loading } from "@/components/ui";
import { AnalyticsLayout } from "@/components/report";
import { api, ApiError } from "@/lib/api";
import { money, num } from "@/lib/format";

type Snapshot = {
  kpis: {
    sku_count: number;
    low_stock: number;
    inventory: Record<string, number>;
    vault: Record<string, number>;
    receipts_this_period: number;
    issues_this_period: number;
  };
  by_category_count: { name: string; value: number }[];
  by_type: { name: string; value: number }[];
  value_by_use: { name: string; value: number }[];
  by_purchase_source: { name: string; value: number }[];
  movement: { month: string; in_qty: number; out_qty: number; in_docs: number; out_docs: number }[];
  low_stock: { name: string; sku: string; on_hand: number; quota: number; short: number; uom: string }[];
};

export default function GoodsAnalyticsPage() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Snapshot>("/goods/analytics").then(setData).catch((err) => setError(err instanceof ApiError ? err.message : "Could not load analytics"));
  }, []);
  if (error) return <Banner>{error}</Banner>;
  if (!data) return <Loading />;
  const inv = data.kpis.inventory;
  return (
    <AnalyticsLayout title="Analytics" eyebrow="Goods" filename="goods-analytics">
      <p className="mb-4 text-sm text-ink/60">
        {data.kpis.sku_count} active SKUs · {data.kpis.low_stock} below quota · stock value{" "}
        {Object.entries(inv).map(([c, v]) => money(v, c)).join(" / ") || "–"} · {data.kpis.receipts_this_period} receipts /{" "}
        {data.kpis.issues_this_period} issues in the last six months
      </p>
      <div className="grid gap-4 xl:grid-cols-2">
        <Simple title="By category" data={data.by_category_count} color={chartColors[0]} />
        <Simple title="By type" data={data.by_type} color={chartColors[3]} />
        <Simple title="Inventory value by use (RMB)" data={data.value_by_use} color={chartColors[1]} />
        <Simple title="Received from" data={data.by_purchase_source} color={chartColors[4]} />
        <ChartCard title="In / out quantity" hint="Last six months">
          <BarChart data={data.movement}>
            <CartesianGrid stroke="#efe8dc" vertical={false} />
            <XAxis dataKey="month" {...axisProps} />
            <YAxis {...axisProps} />
            <Tip />
            <Bar dataKey="in_qty" name="In" fill={chartColors[1]} radius={[3, 3, 0, 0]} />
            <Bar dataKey="out_qty" name="Out" fill={chartColors[2]} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ChartCard>
      </div>
      <section className="card mt-4 p-4">
        <h3 className="font-serif text-xl">Low stock</h3>
        <table className="data-table mt-2">
          <thead>
            <tr>
              <th>Goods</th>
              <th>SKU</th>
              <th>On hand</th>
              <th>Quota</th>
              <th>Short</th>
            </tr>
          </thead>
          <tbody>
            {data.low_stock.length === 0 && (
              <tr>
                <td colSpan={5} className="text-ink/50">
                  Nothing below quota
                </td>
              </tr>
            )}
            {data.low_stock.map((row) => (
              <tr key={row.sku}>
                <td>{row.name}</td>
                <td>{row.sku}</td>
                <td>
                  {num(row.on_hand)} {row.uom}
                </td>
                <td>
                  {num(row.quota)} {row.uom}
                </td>
                <td>{num(row.short)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AnalyticsLayout>
  );
}

function Simple({ title, data, color }: { title: string; data: { name: string; value: number }[]; color: string }) {
  return (
    <ChartCard title={title}>
      <BarChart data={data}>
        <CartesianGrid stroke="#efe8dc" vertical={false} />
        <XAxis dataKey="name" {...axisProps} interval={0} angle={-18} height={70} textAnchor="end" />
        <YAxis {...axisProps} allowDecimals={false} />
        <Tip />
        <Bar dataKey="value" fill={color} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ChartCard>
  );
}
