"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { ListToolbar, useListControls } from "@/components/list-tools";
import { money, num } from "@/lib/format";
import { Term, useText } from "@/lib/i18n";
import { Row } from "@/lib/types";

export function GoodsHistory({ row }: { row: Row | null }) {
  const { t } = useText();
  const router = useRouter();
  const movements: Row[] = row?.movements || [];
  const imports = movements.filter((item) => item.direction === "buy");
  const sales = movements.filter((item) => item.direction === "sell");

  return (
    <div className="mt-3 grid gap-2">
      <section className="card px-3 py-2">
        <h2 className="font-serif text-lg">
          {t("common.onHand")} {num(row?.on_hand)} {row?.uom || ""}
        </h2>
        <p className="mt-1 text-sm text-ink/55">
          {t("trading.imported")} {num(row?.imported)} · {t("trading.sold")} {num(row?.sold)}
        </p>
        <WarehouseStock row={row} />
      </section>
      <HistoryTable title={t("trading.importHistory")} rows={imports} empty={t("trading.historyEmpty")} onOpen={(id) => router.push(`/trading/${id}`)} />
      <HistoryTable title={t("trading.salesHistory")} rows={sales} empty={t("trading.historyEmpty")} onOpen={(id) => router.push(`/trading/sales/${id}`)} />
    </div>
  );
}

function WarehouseStock({ row }: { row: Row | null }) {
  const { t } = useText();
  const places: { location_id?: number | null; name?: string | null; unit_name?: string | null; on_hand?: number; imported?: number; sold?: number }[] = row?.warehouses || [];
  const shown = places.length ? places : [{ name: null, on_hand: row?.on_hand, imported: row?.imported, sold: row?.sold }];
  return (
    <div className="mt-3 border-t border-line pt-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink/45">{t("trading.warehouse")}</p>
      <ul className="mt-1">
        {shown.map((place, index) => {
          const name = place.name || t("trading.unassigned");
          const label = place.unit_name ? `${name} · ${place.unit_name}` : name;
          return (
            <li key={place.location_id ?? index} className="flex items-baseline justify-between gap-3 py-1 text-sm">
              <span>{label}</span>
              <span className="shrink-0 text-ink/70">
                {num(place.on_hand)} {row?.uom || ""}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function HistoryTable({ title, rows, empty, onOpen }: { title: string; rows: Row[]; empty: string; onOpen: (id: number) => void }) {
  const { t } = useText();
  const fields = useMemo(
    () => [
      { key: "date", label: t("common.date"), value: (item: Row) => String(item.trade_date).slice(0, 10) },
      { key: "order", label: t("trading.orderNo"), value: (item: Row) => String(item.order_no || "–") },
      { key: "party", label: t("trading.party"), value: (item: Row) => String(item.counterparty || "–") },
      { key: "warehouse", label: t("trading.warehouse"), value: (item: Row) => String(item.location_name || t("trading.unassigned")) },
      { key: "qty", label: t("trading.qty"), value: (item: Row) => num(item.quantity) },
      { key: "amount", label: t("trading.lineAmount"), value: (item: Row) => money(item.line_amount, item.currency, 2) },
      {
        key: "status",
        label: t("common.status"),
        value: (item: Row) => {
          const key = `tradeStatus.${item.status}`;
          const label = t(key);
          return label === key ? String(item.status || "–") : label;
        },
      },
    ],
    [t],
  );
  const list = useListControls(rows, fields);
  return (
    <section className="card px-3 py-2">
      <h2 className="font-serif text-lg">{title}</h2>
      {!rows.length ? (
        <p className="mt-2 text-sm text-ink/50">{empty}</p>
      ) : (
        <>
          <div className="mt-3">
            <ListToolbar fields={fields} controls={list} />
          </div>
          {!list.filtered.length ? (
            <p className="text-sm text-ink/50">{empty}</p>
          ) : (
        <div className="overflow-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("common.date")}</th>
                <th>{t("trading.orderNo")}</th>
                <th>{t("trading.party")}</th>
                <th>{t("trading.warehouse")}</th>
                <th>{t("trading.qty")}</th>
                <th>{t("trading.lineAmount")}</th>
                <th>{t("common.status")}</th>
              </tr>
            </thead>
            <tbody>
              {list.pageRows.map((item) => (
                <tr key={item.id} className="cursor-pointer" onClick={() => onOpen(item.order_id)}>
                  <td>{String(item.trade_date).slice(0, 10)}</td>
                  <td>{item.order_no}</td>
                  <td>{item.counterparty}</td>
                  <td>{item.location_name || t("trading.unassigned")}</td>
                  <td>{num(item.quantity)}</td>
                  <td>{money(item.line_amount, item.currency, 2)}</td>
                  <td>
                    <Term prefix="tradeStatus" value={item.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
          )}
        </>
      )}
    </section>
  );
}
