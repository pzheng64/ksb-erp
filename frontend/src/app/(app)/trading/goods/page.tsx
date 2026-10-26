"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ListToolbar, useListControls } from "@/components/list-tools";
import { Banner, Empty, PageHeader } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { num } from "@/lib/format";
import { useText } from "@/lib/i18n";
import { Row } from "@/lib/types";

type Warehouse = { id: number; name: string; unit_name?: string | null };

export default function TradeGoodsPage() {
  const { has } = useSession();
  const { t } = useText();
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [locationId, setLocationId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const selected = warehouses.find((item) => String(item.id) === locationId);

  useEffect(() => {
    const params = locationId ? `?location_id=${locationId}` : "";
    api<{ items: Row[]; warehouses: Warehouse[] }>(`/trade-products${params}`)
      .then((page) => {
        setRows(page.items);
        setWarehouses(page.warehouses || []);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : t("common.loadFailed")));
  }, [locationId, t]);

  function warehouseLabel(row: Row) {
    if (selected) return selected.unit_name ? `${selected.name} · ${selected.unit_name}` : selected.name;
    const places: { name?: string | null; unit_name?: string | null; on_hand: number }[] = row.warehouses || [];
    if (!places.length) return t("trading.unassigned");
    return places
      .map((place) => {
        const name = place.name || t("trading.unassigned");
        const label = place.unit_name ? `${name} · ${place.unit_name}` : name;
        return `${label} ${num(place.on_hand)}`;
      })
      .join(" · ");
  }

  const fields = useMemo(
    () => [
      { key: "sku", label: "SKU", value: (row: Row) => String(row.sku || "–") },
      { key: "name", label: t("common.name"), value: (row: Row) => String(row.name || "–") },
      { key: "category", label: t("trading.category"), value: (row: Row) => t(`tradeCategory.${row.category}`) },
      { key: "variety", label: t("trading.variety"), value: (row: Row) => String(row.variety || "–") },
      { key: "uom", label: t("trading.measure"), value: (row: Row) => String(row.uom || "–") },
      { key: "warehouse", label: t("trading.warehouse"), value: warehouseLabel },
      { key: "imported", label: t("trading.imported"), value: (row: Row) => num(row.imported) },
      { key: "sold", label: t("trading.sold"), value: (row: Row) => num(row.sold) },
      { key: "on_hand", label: t("common.onHand"), value: (row: Row) => num(row.on_hand) },
    ],
    [t, selected],
  );
  const list = useListControls(rows, fields);

  return (
    <div>
      <PageHeader
        title={t("nav.tradeGoods")}
        eyebrow={t("nav.trading")}
        action={
          has("trading.write") ? (
            <button className="btn-primary" type="button" onClick={() => router.push("/trading/goods/new")}>
              {t("common.add")}
            </button>
          ) : null
        }
      />
      <p className="mb-2 text-xs text-ink/55">{t("trading.goodsBlurb")}</p>
      {error && <Banner>{error}</Banner>}
      <ListToolbar
        fields={fields}
        controls={list}
        leading={
          <select className="field h-8 w-auto shrink-0 px-2 py-0 text-xs" aria-label={t("trading.warehouse")} value={locationId} onChange={(event) => setLocationId(event.target.value)}>
            <option value="">{t("trading.allWarehouses")}</option>
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
                <th>{t("common.name")}</th>
                <th>{t("trading.category")}</th>
                <th>{t("trading.variety")}</th>
                <th>{t("trading.measure")}</th>
                <th>{t("trading.warehouse")}</th>
                <th>{t("trading.imported")}</th>
                <th>{t("trading.sold")}</th>
                <th>{t("common.onHand")}</th>
              </tr>
            </thead>
            <tbody>
              {list.pageRows.map((row) => (
                <tr key={row.id} className="cursor-pointer" onClick={() => router.push(`/trading/goods/${row.id}`)}>
                  <td>{row.sku}</td>
                  <td>{row.name}</td>
                  <td>{t(`tradeCategory.${row.category}`)}</td>
                  <td>{row.variety}</td>
                  <td>{row.uom}</td>
                  <td>{warehouseLabel(row)}</td>
                  <td>{num(row.imported)}</td>
                  <td>{num(row.sold)}</td>
                  <td>{num(row.on_hand)}</td>
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
