"use client";

import { ResponsiveContainer, Tooltip } from "recharts";

export const axisProps = { stroke: "#8a8175", fontSize: 12, tickLine: false, axisLine: false };
export const chartColors = ["#9a7340", "#1f4d3a", "#8c3d36", "#2c4a6e", "#6e6246", "#3d6b6a", "#8a5a2a", "#4d6275"];

export function ChartCard({ title, hint, children }: { title: string; hint?: string; children: React.ReactElement }) {
  return (
    <section className="card p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="font-serif text-xl">{title}</h3>
        {hint && <p className="text-xs text-ink/45">{hint}</p>}
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </section>
  );
}

export function Tip() {
  return <Tooltip cursor={{ fill: "rgba(154,115,64,0.08)" }} contentStyle={{ border: "1px solid #e4ddd2", borderRadius: 8, fontSize: 12 }} />;
}
