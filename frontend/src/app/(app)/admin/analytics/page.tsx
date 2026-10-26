"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartCard, Tip, axisProps, chartColors } from "@/components/charts";
import { Banner, Loading } from "@/components/ui";
import { AnalyticsLayout } from "@/components/report";
import { api, ApiError } from "@/lib/api";

type Snapshot = {
  kpis: {
    users: number;
    active: number;
    pending: number;
    disabled: number;
    roles: number;
  };
  by_status: { name: string; value: number }[];
  by_role: { name: string; value: number }[];
  by_unit: { name: string; value: number }[];
};

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Snapshot>("/users/analytics").then(setData).catch((err) => setError(err instanceof ApiError ? err.message : "Could not load analytics"));
  }, []);
  if (error) return <Banner>{error}</Banner>;
  if (!data) return <Loading />;
  return (
    <AnalyticsLayout title="Analytics" eyebrow="Administration" filename="admin-analytics">
      <p className="mb-4 text-sm text-ink/60">
        {data.kpis.users} users · {data.kpis.active} active · {data.kpis.pending} pending · {data.kpis.disabled} disabled · {data.kpis.roles} roles
      </p>
      <div className="grid gap-4 xl:grid-cols-2">
        <Simple title="By status" data={data.by_status} color={chartColors[0]} />
        <Simple title="By role" data={data.by_role} color={chartColors[3]} />
        <Simple title="By unit" data={data.by_unit} color={chartColors[1]} />
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
        <YAxis {...axisProps} allowDecimals={false} />
        <Tip />
        <Bar dataKey="value" fill={color} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ChartCard>
  );
}
