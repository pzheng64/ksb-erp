"use client";

import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { ChartCard, Tip, axisProps, chartColors } from "@/components/charts";
import { Banner, Loading } from "@/components/ui";
import { AnalyticsLayout } from "@/components/report";
import { api, ApiError } from "@/lib/api";
import { money, num } from "@/lib/format";

type Snapshot = {
  kpis: {
    vehicles: number;
    runs: number;
    distance_km: number;
    fuel_liters: number;
    fuel_per_100km: number | null;
    fuel_cost: Record<string, number>;
  };
  by_status: { name: string; value: number }[];
  months: { month: string; distance_km: number; fuel_liters: number; runs: number }[];
  by_vehicle: { name: string; distance_km: number; fuel_liters: number; runs: number; fuel_per_100km: number | null }[];
};

export default function TransportAnalyticsPage() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<Snapshot>("/vehicles/analytics").then(setData).catch((err) => setError(err instanceof ApiError ? err.message : "Could not load analytics"));
  }, []);
  if (error) return <Banner>{error}</Banner>;
  if (!data) return <Loading />;
  const fuelCost = Object.entries(data.kpis.fuel_cost)
    .map(([c, v]) => money(v, c))
    .join(" / ");
  return (
    <AnalyticsLayout title="Analytics" eyebrow="Transport" filename="transport-analytics">
      <p className="mb-4 text-sm text-ink/60">
        {data.kpis.vehicles} vehicles · {data.kpis.runs} runs · {num(data.kpis.distance_km)} km · {num(data.kpis.fuel_liters)} L fuel
        {data.kpis.fuel_per_100km != null ? ` · ${num(data.kpis.fuel_per_100km)} L/100 km` : ""}
        {fuelCost ? ` · fuel cost ${fuelCost}` : ""}
      </p>
      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Fleet status">
          <BarChart data={data.by_status}>
            <CartesianGrid stroke="#efe8dc" vertical={false} />
            <XAxis dataKey="name" {...axisProps} />
            <YAxis {...axisProps} allowDecimals={false} />
            <Tip />
            <Bar dataKey="value" fill={chartColors[0]} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ChartCard>
        <ChartCard title="Distance by month" hint="Last six months">
          <LineChart data={data.months}>
            <CartesianGrid stroke="#efe8dc" vertical={false} />
            <XAxis dataKey="month" {...axisProps} />
            <YAxis {...axisProps} />
            <Tip />
            <Line type="monotone" dataKey="distance_km" stroke={chartColors[3]} strokeWidth={2} dot={false} />
          </LineChart>
        </ChartCard>
        <ChartCard title="Fuel by month" hint="Liters">
          <BarChart data={data.months}>
            <CartesianGrid stroke="#efe8dc" vertical={false} />
            <XAxis dataKey="month" {...axisProps} />
            <YAxis {...axisProps} />
            <Tip />
            <Bar dataKey="fuel_liters" fill={chartColors[4]} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ChartCard>
        <ChartCard title="Distance by vehicle">
          <BarChart data={data.by_vehicle}>
            <CartesianGrid stroke="#efe8dc" vertical={false} />
            <XAxis dataKey="name" {...axisProps} interval={0} angle={-18} height={70} textAnchor="end" />
            <YAxis {...axisProps} />
            <Tip />
            <Bar dataKey="distance_km" fill={chartColors[1]} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ChartCard>
      </div>
      <section className="card mt-4 p-4">
        <h3 className="font-serif text-xl">Per vehicle</h3>
        <table className="data-table mt-2">
          <thead>
            <tr>
              <th>Plate</th>
              <th>Runs</th>
              <th>Distance</th>
              <th>Fuel</th>
              <th>L/100 km</th>
            </tr>
          </thead>
          <tbody>
            {data.by_vehicle.map((row) => (
              <tr key={row.name}>
                <td>{row.name}</td>
                <td>{row.runs}</td>
                <td>{num(row.distance_km)} km</td>
                <td>{num(row.fuel_liters)} L</td>
                <td>{row.fuel_per_100km != null ? num(row.fuel_per_100km) : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </AnalyticsLayout>
  );
}
