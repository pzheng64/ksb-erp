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
    assets: number;
    in_service: number;
    maintenance: number;
    retired: number;
    value: Record<string, number>;
  };
  by_status: { name: string; value: number }[];
  by_category: { name: string; value: number }[];
  by_unit: { name: string; value: number }[];
};

export default function EquipmentAnalyticsPage() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Snapshot>("/equipment/analytics").then(setData).catch((err) => setError(err instanceof ApiError ? err.message : "Could not load analytics"));
  }, []);
  if (error) return <Banner>{error}</Banner>;
  if (!data) return <Loading />;
  const value = Object.entries(data.kpis.value)
    .map(([c, v]) => money(v, c))
    .join(" / ");
  return (
    <AnalyticsLayout title="Analytics" eyebrow="Equipment" filename="equipment-analytics">
      <p className="mb-4 text-sm text-ink/60">
        {data.kpis.assets} assets · {data.kpis.in_service} in service · {data.kpis.maintenance} maintenance · {data.kpis.retired} retired
        {value ? ` · book value ${value}` : ""}
      </p>
      <div className="grid gap-4 xl:grid-cols-2">
        <Simple title="By status" data={data.by_status} color={chartColors[0]} />
        <Simple title="By category" data={data.by_category} color={chartColors[3]} />
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
