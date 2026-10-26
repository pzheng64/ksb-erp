"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ListToolbar, useListControls } from "@/components/list-tools";
import { Banner, Empty, PageHeader } from "@/components/ui";
import { ExportButtons } from "@/components/report";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { money } from "@/lib/format";
import { Term, useText } from "@/lib/i18n";
import { Page, Row } from "@/lib/types";
import { GoodsLink } from "./goods-link";

function GoodsNames({ lines }: { lines: Row[] }) {
  const named = lines.filter((line) => line.name);
  if (!named.length) return "–";
  return (
    <>
      {named.map((line, index) => (
        <span key={line.id ?? index}>
          {index > 0 ? ", " : null}
          {line.product_id ? (
            <GoodsLink productId={line.product_id} name={line.name} />
          ) : (
            line.name
          )}
        </span>
      ))}
    </>
  );
}

export function OrderList({ direction }: { direction: "buy" | "sell" }) {
  const buy = direction === "buy";
  const { t } = useText();
  const { has, me } = useSession();
  const ownOrders = !me?.roles.some((role) => role.code === "ceo");
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const listHref = buy ? "/trading" : "/trading/sales";

  useEffect(() => {
    api<Page<Row>>("/trades")
      .then((page) => setRows(page.items.filter((row) => row.direction === direction)))
      .catch((err) => setError(err instanceof ApiError ? err.message : t("common.loadFailed")));
  }, [direction, t]);

  const fields = useMemo(() => {
    function named(prefix: string, value?: string | null) {
      if (!value) return "–";
      const key = `${prefix}.${value}`;
      const label = t(key);
      return label === key ? String(value) : label;
    }
    const goods = (row: Row) => {
      const lines: Row[] = row.lines || [];
      const names = lines.map((line) => line.name).filter(Boolean);
      return names.length ? names.join(", ") : "–";
    };
    return buy
      ? [
          { key: "order_no", label: t("common.code"), value: (row: Row) => String(row.order_no || "–") },
          { key: "date", label: t("common.date"), value: (row: Row) => String(row.trade_date).slice(0, 10) },
          { key: "party", label: t("trading.party"), value: (row: Row) => String(row.counterparty || "–") },
          { key: "assignee", label: t("trading.assignee"), value: (row: Row) => String(row.assignee_name || "–") },
          { key: "transport", label: t("trading.transport"), value: (row: Row) => named("tradeTransport", row.transport_mode) },
          { key: "lines", label: t("trading.lines"), value: goods },
          { key: "consumed", label: t("trading.consumed"), value: (row: Row) => money(row.consumed, row.currency, 2) },
          { key: "amount", label: t("trading.total"), value: (row: Row) => money(row.amount, row.currency, 2) },
          { key: "status", label: t("common.status"), value: (row: Row) => named("tradeStatus", row.status) },
        ]
      : [
          { key: "order_no", label: t("common.code"), value: (row: Row) => String(row.order_no || "–") },
          { key: "date", label: t("common.date"), value: (row: Row) => String(row.trade_date).slice(0, 10) },
          { key: "party", label: t("trading.customer"), value: (row: Row) => String(row.counterparty || "–") },
          { key: "seller", label: t("trading.seller"), value: (row: Row) => String(row.seller_name || "–") },
          { key: "assignee", label: t("trading.assignee"), value: (row: Row) => String(row.assignee_name || "–") },
          { key: "lines", label: t("trading.lines"), value: goods },
          { key: "amount", label: t("trading.total"), value: (row: Row) => money(row.amount, row.currency, 2) },
          { key: "status", label: t("common.status"), value: (row: Row) => named("tradeStatus", row.status) },
        ];
  }, [buy, t]);
  const list = useListControls(rows, fields);
  const visible = list.filtered;
  const columns = buy
    ? [
        { key: "order_no", label: t("common.code") },
        { key: "trade_date", label: t("common.date") },
        { key: "counterparty", label: t("trading.party") },
        { key: "assignee_name", label: t("trading.assignee") },
        { key: "transport_mode", label: t("trading.transport") },
        { key: "line_count", label: t("trading.lines") },
        { key: "consumed", label: t("trading.consumed") },
        { key: "amount", label: t("trading.total") },
        { key: "status", label: t("common.status") },
      ]
    : [
        { key: "order_no", label: t("common.code") },
        { key: "trade_date", label: t("common.date") },
        { key: "counterparty", label: t("trading.customer") },
        { key: "seller_name", label: t("trading.seller") },
        { key: "assignee_name", label: t("trading.assignee") },
        { key: "line_count", label: t("trading.lines") },
        { key: "amount", label: t("trading.total") },
        { key: "status", label: t("common.status") },
      ];

  return (
    <div>
      <PageHeader
        title={buy ? t("nav.orders") : t("nav.sales")}
        eyebrow={t("nav.trading")}
        action={
          <div className="flex flex-wrap gap-2">
            <ExportButtons filename={buy ? "trading-orders" : "trading-sales"} title={buy ? t("nav.orders") : t("nav.sales")} columns={columns} rows={visible} />
            {has("trading.write") && (
              <button className="btn-primary" type="button" onClick={() => router.push(`${listHref}/new`)}>
                {t("common.add")}
              </button>
            )}
          </div>
        }
      />
      <p className="mb-2 max-w-3xl text-xs text-ink/55">{ownOrders ? t(buy ? "trading.ownOrders" : "trading.ownSales") : t(buy ? "trading.ordersBlurb" : "trading.sellBlurb")}</p>
      {error && <Banner>{error}</Banner>}
      <ListToolbar fields={fields} controls={list} />
      <div className="card">
        <div className="overflow-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("trading.orderNo")}</th>
                <th>{t("common.date")}</th>
                <th>{buy ? t("trading.party") : t("trading.customer")}</th>
                {buy ? <th>{t("trading.assignee")}</th> : <th>{t("trading.seller")}</th>}
                {buy ? <th>{t("trading.transport")}</th> : <th>{t("trading.assignee")}</th>}
                <th>{t("trading.lines")}</th>
                {buy && <th>{t("trading.consumed")}</th>}
                <th>{t("trading.total")}</th>
                <th>{t("common.status")}</th>
              </tr>
            </thead>
            <tbody>
              {list.pageRows.map((row) => (
                <tr key={row.id} className="cursor-pointer" onClick={() => router.push(`${listHref}/${row.id}`)}>
                  <td>{row.order_no}</td>
                  <td>{String(row.trade_date).slice(0, 10)}</td>
                  <td>
                    {row.counterparty}
                    {row.customer_kind ? (
                      <span className="text-ink/45">
                        {" "}
                        · <Term prefix="customerKind" value={row.customer_kind} />
                      </span>
                    ) : null}
                  </td>
                  {buy ? <td>{row.assignee_name || "–"}</td> : <td>{row.seller_name || "–"}</td>}
                  {buy ? <td>{row.transport_mode ? <Term prefix="tradeTransport" value={row.transport_mode} /> : "–"}</td> : <td>{row.assignee_name || "–"}</td>}
                  <td className="max-w-xs">
                    <GoodsNames lines={row.lines || []} />
                  </td>
                  {buy && <td>{money(row.consumed, row.currency, 2)}</td>}
                  <td>{money(row.amount, row.currency, 2)}</td>
                  <td>
                    <Term prefix="tradeStatus" value={row.status} />
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
