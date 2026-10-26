"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartCard, Tip, axisProps, chartColors } from "@/components/charts";
import { Banner, Loading } from "@/components/ui";
import { AnalyticsLayout } from "@/components/report";
import { api, ApiError } from "@/lib/api";
import { money } from "@/lib/format";

type Snapshot = {
  kpis: {
    this_month_income: number;
    this_month_expense: number;
    this_month_net: number;
    this_month: Record<string, { income: number; expense: number }>;
  };
  months: Record<string, { month: string; income: number; expense: number }[]>;
  expense_by_category: { name: string; value: number }[];
  income_by_category: { name: string; value: number }[];
  by_unit: { name: string; income: number; expense: number }[];
  signals: { level: string; title: string; detail: string }[];
};

export default function FinanceAnalyticsPage() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Snapshot>("/finance/analytics").then(setData).catch((err) => setError(err instanceof ApiError ? err.message : "Could not load analytics"));
  }, []);
  if (error) return <Banner>{error}</Banner>;
  if (!data) return <Loading />;
  const rmb = data.months.RMB || [];
  return (
    <AnalyticsLayout title="Analytics" eyebrow="Finance" filename="finance-analytics">
      <p className="mb-4 text-sm text-ink/60">
        This month RMB · income {money(data.kpis.this_month_income)} · expense {money(data.kpis.this_month_expense)} · net{" "}
        {money(data.kpis.this_month_net)}
      </p>
      {data.signals.length > 0 && (
        <div className="mb-4 space-y-2">
          {data.signals.map((signal) => (
            <Banner key={signal.title}>
              {signal.title}. {signal.detail}
            </Banner>
          ))}
        </div>
      )}
      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="RMB income / expense" hint="Last six months">
          <BarChart data={rmb}>
            <CartesianGrid stroke="#efe8dc" vertical={false} />
            <XAxis dataKey="month" {...axisProps} />
            <YAxis {...axisProps} />
            <Tip />
            <Bar dataKey="income" fill={chartColors[1]} radius={[3, 3, 0, 0]} />
            <Bar dataKey="expense" fill={chartColors[2]} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ChartCard>
        <Simple title="Expense by category (RMB)" data={data.expense_by_category} color={chartColors[2]} />
        <Simple title="Income by category (RMB)" data={data.income_by_category} color={chartColors[1]} />
        <ChartCard title="By unit (RMB)">
          <BarChart data={data.by_unit}>
            <CartesianGrid stroke="#efe8dc" vertical={false} />
            <XAxis dataKey="name" {...axisProps} interval={0} angle={-18} height={70} textAnchor="end" />
            <YAxis {...axisProps} />
            <Tip />
            <Bar dataKey="income" fill={chartColors[1]} radius={[3, 3, 0, 0]} />
            <Bar dataKey="expense" fill={chartColors[2]} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ChartCard>
      </div>
    </AnalyticsLayout>
  );
}

function Simple({ title, data, color }: { title: string; data: { name: string; value: number }[]; color: string }) {
  return (
    <ChartCard title={title}>
      <BarChart data={data}>
        <CartesianGrid stroke="#efe8dc" vertical={false} />
        <XAxis dataKey="name" {...axisProps} interval={0} angle={-18} height={70} textAnchor="end" />
        <YAxis {...axisProps} />
        <Tip />
        <Bar dataKey="value" fill={color} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ChartCard>
  );
}
