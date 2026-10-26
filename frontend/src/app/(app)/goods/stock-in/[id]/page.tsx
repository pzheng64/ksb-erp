"use client";

import { ResourceDetail } from "@/components/resource";
import { useSession } from "@/lib/auth";

export default function StockInDetailPage() {
  const { has, options } = useSession();
  const people = options.people.map((person) => ({ value: String(person.id), label: person.full_name }));
  return (
    <ResourceDetail
      title="In"
      backLabel="In"
      path="/goods/stock-ins"
      hrefBase="/goods/stock-in"
      canWrite={has("goods.write")}
      titleKey="doc_no"
      readOnlyWhen={(row) => Boolean(row?.reversed)}
      fields={[
        { name: "goods_id", label: "Goods", type: "select", required: true, valueType: "number", options: options.goods.map((item) => ({ value: String(item.id), label: `${item.sku} · ${item.name}` })) },
        { name: "location_id", label: "Warehouse", type: "select", required: true, valueType: "number", options: options.locations.map((item) => ({ value: String(item.id), label: `${item.name} · ${item.unit_name || ""}` })) },
        { name: "quantity", label: "Quantity", type: "number", required: true },
        { name: "unit_price", label: "Unit price", type: "number", required: true },
        { name: "purchaser_user_id", label: "Purchaser", type: "select", valueType: "number", options: people },
        { name: "acceptor_user_id", label: "Accepted by", type: "select", valueType: "number", options: people },
        { name: "purchased_from", label: "Purchased from", type: "text" },
        { name: "received_on", label: "Date", type: "date", required: true },
        { name: "note", label: "Note", type: "text" },
      ]}
    />
  );
}
