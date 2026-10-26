"use client";

import { ResourceDetail } from "@/components/resource";
import { useSession } from "@/lib/auth";

export default function TransferDetailPage() {
  const { has, options } = useSession();
  const places = options.locations.map((item) => ({ value: String(item.id), label: `${item.unit_name || "Unit"} · ${item.name}` }));
  return (
    <ResourceDetail
      title="Transfer"
      backLabel="Transfers"
      path="/goods/transfers"
      hrefBase="/goods/transfers"
      canWrite={has("goods.write")}
      canEdit={false}
      titleKey="doc_no"
      fields={[
        { name: "goods_id", label: "Goods", type: "select", required: true, valueType: "number", options: options.goods.map((item) => ({ value: String(item.id), label: `${item.sku} · ${item.name}` })) },
        { name: "from_location_id", label: "From place", type: "select", required: true, valueType: "number", options: places },
        { name: "to_location_id", label: "To place", type: "select", required: true, valueType: "number", options: places },
        { name: "quantity", label: "Quantity", type: "number", required: true },
        { name: "transferred_on", label: "Date", type: "date", required: true },
        { name: "note", label: "Note", type: "text" },
      ]}
    />
  );
}
