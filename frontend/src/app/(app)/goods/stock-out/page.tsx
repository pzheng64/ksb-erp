"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ListToolbar, useListControls } from "@/components/list-tools";
import { Banner, Empty, PageHeader } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { num } from "@/lib/format";
import { useText } from "@/lib/i18n";
import { Page, Row } from "@/lib/types";
import { caseLabel } from "../cases";
import { GoodsLink } from "../goods-panel";

type OutRow = {
  key: string;
  id: number;
  ref_type: "stock_out" | "usage";
  doc_no: string;
  occurred_on: string;
  goods_id: number;
  goods_name: string;
  location_name: string;
  employee: string;
  quantity: number;
  reason: string;
  destination: string;
  comment: string;
  reversed: boolean;
};

const FIELDS = [
  { key: "doc_no", label: "Document" },
  { key: "date", label: "Date" },
  { key: "goods_name", label: "Goods" },
  { key: "location_name", label: "Warehouse" },
  { key: "employee", label: "Employee" },
  { key: "quantity", label: "Qty" },
  { key: "case", label: "Case" },
  { key: "destination", label: "Destination" },
  { key: "comment", label: "Comment" },
  { key: "state", label: "State" },
] as const;

type FieldKey = (typeof FIELDS)[number]["key"];

function fieldValue(row: OutRow, key: FieldKey) {
  if (key === "date") return String(row.occurred_on).slice(0, 10);
  if (key === "case") return caseLabel(row.reason);
  if (key === "state") return row.reversed ? "Reversed" : "Posted";
  if (key === "quantity") return num(row.quantity);
  if (key === "location_name") return row.location_name || "–";
  if (key === "employee") return row.employee || "–";
  if (key === "comment") return row.comment || "–";
  return row[key] || "–";
}

export default function StockOutPage() {
  const { has } = useSession();
  const { t } = useText();
  const router = useRouter();
  const [rows, setRows] = useState<OutRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fields = useMemo(
    () => FIELDS.map((field) => ({ key: field.key, label: field.label, value: (row: OutRow) => fieldValue(row, field.key) })),
    [],
  );
  const list = useListControls(rows, fields);

  async function reload() {
    const [outs, usages] = await Promise.all([api<Page<Row>>("/goods/stock-outs"), api<Page<Row>>("/goods/usages")]);
    const merged: OutRow[] = [
      ...outs.items.map((row) => ({
        key: `out-${row.id}`,
        id: row.id,
        ref_type: "stock_out" as const,
        doc_no: row.doc_no,
        occurred_on: String(row.issued_on),
        goods_id: row.goods_id,
        goods_name: row.goods_name || "–",
        location_name: row.location_name || "–",
        employee: row.actor || "",
        quantity: row.quantity,
        reason: row.reason,
        destination: row.reason === "usage" ? row.destination || "" : "",
        comment: row.note || "",
        reversed: Boolean(row.reversed),
      })),
      ...usages.items.map((row) => ({
        key: `use-${row.id}`,
        id: row.id,
        ref_type: "usage" as const,
        doc_no: row.doc_no,
        occurred_on: String(row.used_on),
        goods_id: row.goods_id,
        goods_name: row.goods_name || "–",
        location_name: row.location_name || "–",
        employee: row.actor || "",
        quantity: row.quantity,
        reason: "usage",
        destination: row.destination || row.using_unit || "",
        comment: row.note || "",
        reversed: Boolean(row.reversed),
      })),
    ];
    merged.sort((a, b) => String(b.occurred_on).localeCompare(String(a.occurred_on)) || b.doc_no.localeCompare(a.doc_no));
    setRows(merged);
  }

  useEffect(() => {
    reload().catch((err) => setError(err instanceof ApiError ? err.message : "Could not load out records"));
  }, []);

  async function reverse(row: OutRow) {
    if (!confirm(`Reverse ${row.doc_no}?`)) return;
    setError(null);
    try {
      const path = row.ref_type === "usage" ? `/goods/usages/${row.id}` : `/goods/stock-outs/${row.id}`;
      await api(path, { method: "DELETE" });
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reverse the record");
    }
  }

  return (
    <div>
      <PageHeader
        title="Out"
        eyebrow="Goods"
        action={
          has("goods.write") ? (
            <button className="btn-primary" type="button" onClick={() => router.push("/goods/stock-out/new")}>
              {t("common.add")}
            </button>
          ) : null
        }
      />
      <p className="mb-2 max-w-3xl text-xs text-ink/55">
        Goods leaving a warehouse. Supply records name the person or unit they go to. Filter or group the list by any column.
      </p>
      {error && <Banner>{error}</Banner>}
      <ListToolbar fields={fields} controls={list} />
      {!list.filtered.length && <Empty>No out records for this filter.</Empty>}
      {list.filtered.length > 0 && list.groups.map((group) => (
        <section key={group.label || "all"} className="card mb-4 overflow-auto">
          {list.groupBy && (
            <h2 className="border-b border-line px-3 py-2 font-serif text-xl">
              {group.label}
              <span className="ml-2 text-sm font-sans text-ink/50">
                {group.rows.length} · {num(group.rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0))}
              </span>
            </h2>
          )}
          <table className="data-table">
            <thead>
              <tr>
                {FIELDS.map((field) => (
                  <th key={field.key}>{field.label}</th>
                ))}
                {has("goods.write") && <th />}
              </tr>
            </thead>
            <tbody>
              {group.rows.map((row) => (
                <tr
                  key={row.key}
                  className="cursor-pointer"
                  onClick={() => router.push(row.ref_type === "usage" ? `/goods/usage/${row.id}` : `/goods/stock-out/${row.id}`)}
                >
                  <td>{fieldValue(row, "doc_no")}</td>
                  <td>{fieldValue(row, "date")}</td>
                  <td>
                    <GoodsLink goodsId={row.goods_id} name={row.goods_name} />
                  </td>
                  <td>{fieldValue(row, "location_name")}</td>
                  <td>{fieldValue(row, "employee")}</td>
                  <td>{fieldValue(row, "quantity")}</td>
                  <td>{fieldValue(row, "case")}</td>
                  <td>{fieldValue(row, "destination")}</td>
                  <td>{fieldValue(row, "comment")}</td>
                  <td>{fieldValue(row, "state")}</td>
                  {has("goods.write") && (
                    <td className="text-right">
                      {!row.reversed && (
                        <button
                          className="text-sm text-clay"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            reverse(row);
                          }}
                        >
                          Reverse
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
