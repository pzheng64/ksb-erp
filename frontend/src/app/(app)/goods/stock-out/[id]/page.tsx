"use client";

import { ResourceDetail } from "@/components/resource";
import { useSession } from "@/lib/auth";
import { OUT_CASES } from "../../cases";

export default function StockOutDetailPage() {
  const { has, options } = useSession();
  return (
    <ResourceDetail
      title="Out"
      backLabel="Out"
      path="/goods/stock-outs"
      hrefBase="/goods/stock-out"
      canWrite={has("goods.write")}
      titleKey="doc_no"
      readOnlyWhen={(row) => Boolean(row?.reversed)}
      fields={[
        { name: "goods_id", label: "Goods", type: "select", required: true, valueType: "number", options: options.goods.map((item) => ({ value: String(item.id), label: `${item.sku} · ${item.name}` })) },
        { name: "location_id", label: "Warehouse", type: "select", required: true, valueType: "number", options: options.locations.map((item) => ({ value: String(item.id), label: `${item.name} · ${item.unit_name || ""}` })) },
        { name: "quantity", label: "Quantity", type: "number", required: true },
        { name: "reason", label: "Case", type: "select", required: true, defaultValue: "usage", options: OUT_CASES },
        { name: "destination", label: "Destination", type: "text", required: true, placeholder: "Person or unit", visible: (form) => form.reason === "usage" },
        { name: "issued_on", label: "Date", type: "date", required: true },
        { name: "note", label: "Comment", type: "text" },
      ]}
    />
  );
}
