"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartCard, Tip, axisProps, chartColors } from "@/components/charts";
import { Banner, Loading } from "@/components/ui";
import { AnalyticsLayout } from "@/components/report";
import { api, ApiError } from "@/lib/api";

type Snapshot = {
  headcount: number;
  left_this_year: number;
  by_unit: { name: string; value: number }[];
  by_position: { name: string; value: number }[];
  by_age: { name: string; value: number }[];
  by_tenure: { name: string; value: number }[];
  attendance_by_unit: { unit: string; headcount: number; on_site: number }[];
  flow: { month: string; joined: number; left: number }[];
};

export default function AnalyticsPage() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Snapshot>("/employees/analytics").then(setData).catch((err) => setError(err instanceof ApiError ? err.message : "Could not load analytics"));
  }, []);
  if (error) return <Banner>{error}</Banner>;
  if (!data) return <Loading />;
  return (
    <AnalyticsLayout title="Analytics" eyebrow="Employment" filename="employees-analytics">
      <p className="mb-4 text-sm text-ink/60">{data.headcount} active people. {data.left_this_year} left this year.</p>
      <div className="grid gap-4 xl:grid-cols-2">
        <Chart title="By unit" data={data.by_unit} color={chartColors[0]} />
        <Chart title="By position" data={data.by_position} color={chartColors[3]} />
        <Chart title="By age" data={data.by_age} color={chartColors[2]} />
        <Chart title="By years with the company" data={data.by_tenure} color={chartColors[4]} />
        <ChartCard title="Joined and left" hint="Last six months">
          <BarChart data={data.flow}>
            <CartesianGrid stroke="#efe8dc" vertical={false} />
            <XAxis dataKey="month" {...axisProps} />
            <YAxis {...axisProps} allowDecimals={false} />
            <Tip />
            <Bar dataKey="joined" fill={chartColors[1]} radius={[3, 3, 0, 0]} />
            <Bar dataKey="left" fill={chartColors[2]} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ChartCard>
      </div>
      <section className="card mt-4 p-4">
        <h3 className="font-serif text-xl">On site today</h3>
        <table className="data-table mt-2">
          <thead><tr><th>Unit</th><th>Headcount</th><th>On site</th><th>Rate</th></tr></thead>
          <tbody>
            {data.attendance_by_unit.map((row) => (
              <tr key={row.unit}><td>{row.unit}</td><td>{row.headcount}</td><td>{row.on_site}</td><td>{row.headcount ? `${Math.round((row.on_site / row.headcount) * 100)}%` : "–"}</td></tr>
            ))}
          </tbody>
        </table>
      </section>
    </AnalyticsLayout>
  );
}

function Chart({ title, data, color }: { title: string; data: { name: string; value: number }[]; color: string }) {
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
