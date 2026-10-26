"use client";

import { useEffect, useMemo, useState } from "react";
import { ListToolbar, useListControls } from "@/components/list-tools";
import { Banner, Empty, PageHeader } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { money, num } from "@/lib/format";
import { Page, Row } from "@/lib/types";

export default function LedgerPage() {
  const { options } = useSession();
  const [kind, setKind] = useState("warehouse");
  const [goodsId, setGoodsId] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function reload(nextKind = kind, nextGoods = goodsId) {
    const params = new URLSearchParams();
    if (nextKind) params.set("kind", nextKind);
    if (nextGoods) params.set("goods_id", nextGoods);
    const page = await api<Page<Row>>(`/goods/ledger?${params.toString()}`);
    setRows(page.items);
  }

  useEffect(() => {
    reload().catch((err) => setError(err instanceof ApiError ? err.message : "Could not load the ledger"));
  }, []);

  const fields = useMemo(
    () => [
      { key: "date", label: "Date", value: (row: Row) => String(row.occurred_on || "–") },
      { key: "movement", label: "Movement", value: (row: Row) => String(row.movement_type || "–").replaceAll("_", " ") },
      { key: "goods", label: "Goods", value: (row: Row) => String(row.goods || "–") },
      { key: "place", label: "Place", value: (row: Row) => [row.location, row.unit].filter(Boolean).join(" · ") || "–" },
      { key: "qty", label: "Qty", value: (row: Row) => num(row.quantity) },
      { key: "balance", label: "Balance", value: (row: Row) => num(row.balance_after) },
      { key: "value", label: "Value", value: (row: Row) => money(row.value_delta, row.currency, 2) },
      { key: "by", label: "By", value: (row: Row) => String(row.actor || "–") },
    ],
    [],
  );
  const list = useListControls(rows, fields);

  return (
    <div>
      <PageHeader title="Warehouse ledger" eyebrow="Goods" />
      <p className="mb-2 text-xs text-ink/55">Every receipt, issue, usage, and transfer posts a line with the balance after the movement.</p>
      {error && <Banner>{error}</Banner>}
      <ListToolbar
        fields={fields}
        controls={list}
        leading={
          <>
            <select className="field h-8 w-auto shrink-0 px-2 py-0 text-xs" aria-label="Place" value={kind} onChange={(event) => setKind(event.target.value)}>
              <option value="">All places</option>
              <option value="warehouse">Warehouses</option>
              <option value="vault">Vaults</option>
            </select>
            <select className="field h-8 w-auto shrink-0 px-2 py-0 text-xs" aria-label="Goods" value={goodsId} onChange={(event) => setGoodsId(event.target.value)}>
              <option value="">All goods</option>
              {options.goods.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <button className="btn-ghost shrink-0 px-2 py-1 text-xs" type="button" onClick={() => reload()}>Show</button>
          </>
        }
      />
      <div className="card overflow-auto">
        <table className="data-table">
          <thead><tr><th>Date</th><th>Movement</th><th>Goods</th><th>Place</th><th>Qty</th><th>Balance</th><th>Value</th><th>By</th></tr></thead>
          <tbody>
            {list.pageRows.map((row) => (
              <tr key={row.id}>
                <td>{row.occurred_on}</td>
                <td className="capitalize">{String(row.movement_type).replaceAll("_", " ")}</td>
                <td>{row.goods}</td>
                <td>{row.location}<div className="text-xs text-ink/40">{row.unit}</div></td>
                <td>{num(row.quantity)}</td>
                <td>{num(row.balance_after)}</td>
                <td>{money(row.value_delta, row.currency, 2)}</td>
                <td>{row.actor || "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.filtered.length && <Empty>No ledger lines for this filter.</Empty>}
      </div>
    </div>
  );
}
