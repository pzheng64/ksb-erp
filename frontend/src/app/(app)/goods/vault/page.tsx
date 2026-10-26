"use client";

import { useEffect, useMemo, useState } from "react";
import { ListToolbar, useListControls } from "@/components/list-tools";
import { Banner, Empty, PageHeader } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { money, num } from "@/lib/format";
import { Term, useText } from "@/lib/i18n";
import { Row } from "@/lib/types";

export default function VaultPage() {
  const { t } = useText();
  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ items: Row[]; value_by_currency: Record<string, number> }>("/goods/balances?kind=vault")
      .then((result) => {
        setRows(result.items);
        setTotals(result.value_by_currency);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load the vault"));
  }, []);
  const fields = useMemo(
    () => [
      { key: "goods", label: "Goods", value: (row: Row) => String(row.goods || "–") },
      {
        key: "use",
        label: "Use",
        value: (row: Row) => {
          const key = `category.${row.category}`;
          const label = t(key);
          return label === key ? String(row.category || "–") : label;
        },
      },
      { key: "vault", label: "Vault", value: (row: Row) => String(row.location || "–") },
      { key: "unit", label: "Unit", value: (row: Row) => String(row.unit || "–") },
      { key: "qty", label: "Qty", value: (row: Row) => `${num(row.quantity)} ${row.uom || ""}`.trim() },
      { key: "cost", label: "Avg cost", value: (row: Row) => money(row.avg_unit_price, row.currency, 2) },
      { key: "value", label: "Value", value: (row: Row) => money(row.total_value, row.currency, 2) },
    ],
    [t],
  );
  const list = useListControls(rows, fields);
  return (
    <div>
      <PageHeader title="Financial vault" eyebrow="Goods" />
      <p className="mb-2 text-xs text-ink/55">
        Vault places hold inventory at average receipt cost. RMB and USD stay separate.
        {Object.entries(totals).map(([currency, value]) => ` ${currency} ${money(value, currency)}`).join(" ·")}
      </p>
      {error && <Banner>{error}</Banner>}
      <ListToolbar fields={fields} controls={list} />
      <div className="card overflow-auto">
        <table className="data-table">
          <thead><tr><th>Goods</th><th>Use</th><th>Vault</th><th>Unit</th><th>Qty</th><th>Avg cost</th><th>Value</th></tr></thead>
          <tbody>
            {list.pageRows.map((row) => (
              <tr key={`${row.goods_id}-${row.location_id}`}>
                <td>{row.goods}<div className="text-xs text-ink/40">{row.sku}</div></td>
                <td><Term prefix="category" value={row.category} /></td>
                <td>{row.location}</td>
                <td>{row.unit}</td>
                <td>{num(row.quantity)} {row.uom}</td>
                <td>{money(row.avg_unit_price, row.currency, 2)}</td>
                <td>{money(row.total_value, row.currency, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.filtered.length && <Empty>The vault is empty.</Empty>}
      </div>
    </div>
  );
}
