"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ListToolbar, useListControls } from "@/components/list-tools";
import { ExportButtons } from "@/components/report";
import { Banner, Empty, PageHeader } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { num } from "@/lib/format";
import { Term, useText } from "@/lib/i18n";
import { Row } from "@/lib/types";

type Place = { id: number; name: string; unit_name?: string | null };

export default function GoodsPage() {
  const { has } = useSession();
  const { t } = useText();
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [warehouses, setWarehouses] = useState<Place[]>([]);
  const [locationId, setLocationId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const selected = warehouses.find((item) => String(item.id) === locationId);

  useEffect(() => {
    const params = locationId ? `?location_id=${locationId}` : "";
    api<{ items: Row[]; warehouses: Place[] }>(`/goods${params}`)
      .then((page) => {
        setRows(page.items);
        setWarehouses(page.warehouses || []);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load goods"));
  }, [locationId]);

  function warehouseLabel(row: Row) {
    if (selected) return selected.unit_name ? `${selected.name} · ${selected.unit_name}` : selected.name;
    const places: { name?: string | null; unit_name?: string | null; on_hand: number }[] = row.warehouses || [];
    if (!places.length) return "No warehouse";
    return places
      .map((place) => {
        const name = place.name || "No warehouse";
        const label = place.unit_name ? `${name} · ${place.unit_name}` : name;
        return `${label} ${num(place.on_hand)}`;
      })
      .join(" · ");
  }

  const fields = useMemo(
    () => [
      { key: "sku", label: "SKU", value: (row: Row) => String(row.sku || "–") },
      { key: "name", label: "Name", value: (row: Row) => String(row.name || "–") },
      {
        key: "use",
        label: "Use",
        value: (row: Row) => {
          const key = `category.${row.category}`;
          const label = t(key);
          return label === key ? String(row.category || "–") : label;
        },
      },
      { key: "warehouse", label: "Warehouse", value: warehouseLabel },
      { key: "in", label: "In", value: (row: Row) => num(row.received) },
      { key: "out", label: "Out", value: (row: Row) => num(row.issued) },
      { key: "on_hand", label: "On hand", value: (row: Row) => `${num(row.on_hand)} ${row.uom || ""}`.trim() },
    ],
    [t, selected],
  );
  const list = useListControls(rows, fields);

  return (
    <div>
      <PageHeader
        title="Goods list"
        eyebrow="Goods"
        action={
          <div className="flex flex-wrap gap-2">
            <ExportButtons
              filename="goods"
              title="Goods list"
              subtitle="Goods"
              rows={list.filtered}
              columns={fields.map((field) => ({ key: field.key, label: field.label, value: field.value }))}
            />
            {has("goods.write") ? (
              <button className="btn-primary" type="button" onClick={() => router.push("/goods/new")}>
                {t("common.add")}
              </button>
            ) : null}
          </div>
        }
      />
      <p className="mb-2 text-xs text-ink/55">
        Goods are bought into a warehouse. Out is what was issued or used for employee supply. On hand is what remains at the warehouse you select.
      </p>
      {error && <Banner>{error}</Banner>}
      <ListToolbar
        fields={fields}
        controls={list}
        leading={
          <select className="field h-8 w-auto shrink-0 px-2 py-0 text-xs" aria-label="Warehouse" value={locationId} onChange={(event) => setLocationId(event.target.value)}>
            <option value="">All warehouses</option>
            {warehouses.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.unit_name ? ` · ${item.unit_name}` : ""}
              </option>
            ))}
          </select>
        }
      />
      <div className="card">
        <div className="overflow-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Name</th>
                <th>Use</th>
                <th>Warehouse</th>
                <th>In</th>
                <th>Out</th>
                <th>On hand</th>
              </tr>
            </thead>
            <tbody>
              {list.pageRows.map((row) => (
                <tr key={row.id} className="cursor-pointer" onClick={() => router.push(`/goods/${row.id}`)}>
                  <td>{row.sku}</td>
                  <td>{row.name}</td>
                  <td>
                    <Term prefix="category" value={row.category} />
                  </td>
                  <td>{warehouseLabel(row)}</td>
                  <td>{num(row.received)}</td>
                  <td>{num(row.issued)}</td>
                  <td>
                    {num(row.on_hand)} {row.uom}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!list.filtered.length && <Empty>{t("common.empty")}</Empty>}
        </div>
      </div>
    </div>
  );
}
