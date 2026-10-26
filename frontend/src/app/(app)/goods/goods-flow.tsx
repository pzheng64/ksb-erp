"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { ListToolbar, useListControls } from "@/components/list-tools";
import { money, num } from "@/lib/format";
import { Row } from "@/lib/types";
import { caseLabel } from "./cases";

export function GoodsFlow({ row }: { row: Row | null }) {
  const router = useRouter();
  const movements: Row[] = row?.movements || [];
  const incoming = movements.filter((item) => item.direction === "in");
  const outgoing = movements.filter((item) => item.direction === "out");

  return (
    <div className="mt-3 grid gap-2">
      <section className="card px-3 py-2">
        <h2 className="font-serif text-lg">
          On hand {num(row?.on_hand)} {row?.uom || ""}
        </h2>
        <p className="mt-1 text-sm text-ink/55">
          In {num(row?.received)} · Out {num(row?.issued)}
        </p>
        <WarehouseStock row={row} />
      </section>
      <FlowTable
        title="In"
        rows={incoming}
        empty="No receipts yet."
        kind="in"
        onOpen={(item) => router.push(`/goods/stock-in/${item.ref_id}`)}
      />
      <FlowTable
        title="Out"
        rows={outgoing}
        empty="No issues yet."
        kind="out"
        onOpen={(item) => router.push(item.ref_type === "usage" ? `/goods/usage/${item.ref_id}` : `/goods/stock-out/${item.ref_id}`)}
      />
    </div>
  );
}

function WarehouseStock({ row }: { row: Row | null }) {
  const places: { location_id?: number | null; name?: string | null; unit_name?: string | null; on_hand?: number }[] = row?.warehouses || [];
  const shown = places.length ? places : [{ name: null, on_hand: row?.on_hand }];
  return (
    <div className="mt-3 border-t border-line pt-3">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-ink/45">Warehouse</p>
      <ul className="mt-1">
        {shown.map((place, index) => {
          const name = place.name || "No warehouse";
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

function FlowTable({
  title,
  rows,
  empty,
  kind,
  onOpen,
}: {
  title: string;
  rows: Row[];
  empty: string;
  kind: "in" | "out";
  onOpen: (row: Row) => void;
}) {
  const fields = useMemo(() => {
    const columns: { key: string; label: string; value: (item: Row) => string }[] = [
      { key: "date", label: "Date", value: (item) => String(item.occurred_on).slice(0, 10) },
      { key: "doc", label: "Document", value: (item) => String(item.doc_no || "–") },
      {
        key: "party",
        label: kind === "in" ? "From" : "Case",
        value: (item) => (kind === "in" ? String(item.party || "–") : caseLabel(item.case)),
      },
    ];
    if (kind === "out") {
      columns.push({
        key: "destination",
        label: "Destination",
        value: (item) => (item.case === "usage" ? String(item.destination || "–") : "–"),
      });
    }
    columns.push(
      { key: "comment", label: kind === "in" ? "Note" : "Comment", value: (item) => String(item.comment || "–") },
      { key: "warehouse", label: "Warehouse", value: (item) => String(item.location_name || "No warehouse") },
      { key: "employee", label: "Employee", value: (item) => String(item.actor || "–") },
      { key: "qty", label: "Qty", value: (item) => num(item.quantity) },
      { key: "amount", label: "Amount", value: (item) => money(item.line_amount, item.currency, 2) },
    );
    return columns;
  }, [kind]);
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
            <p className="text-sm text-ink/50">No lines for this filter.</p>
          ) : (
        <div className="overflow-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Document</th>
                <th>{kind === "in" ? "From" : "Case"}</th>
                {kind === "out" && <th>Destination</th>}
                <th>{kind === "in" ? "Note" : "Comment"}</th>
                <th>Warehouse</th>
                <th>Employee</th>
                <th>Qty</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {list.pageRows.map((item) => (
                <tr key={item.id} className="cursor-pointer" onClick={() => onOpen(item)}>
                  <td>{String(item.occurred_on).slice(0, 10)}</td>
                  <td>{item.doc_no}</td>
                  <td>{kind === "in" ? item.party || "–" : caseLabel(item.case)}</td>
                  {kind === "out" && <td>{item.case === "usage" ? item.destination || "–" : "–"}</td>}
                  <td>{item.comment || "–"}</td>
                  <td>{item.location_name || "No warehouse"}</td>
                  <td>{item.actor || "–"}</td>
                  <td>{num(item.quantity)}</td>
                  <td>{money(item.line_amount, item.currency, 2)}</td>
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
