"use client";

import { ResourcePage } from "@/components/resource";
import { useSession } from "@/lib/auth";

export default function TransfersPage() {
  const { has, options } = useSession();
  const places = options.locations.map((item) => ({ value: String(item.id), label: `${item.unit_name || "Unit"} · ${item.name}` }));
  return (
    <ResourcePage
      title="Transfers"
      eyebrow="Goods"
      description="Move goods from a place in one unit to a place in another unit. Same-unit moves are refused."
      path="/goods/transfers"
      hrefBase="/goods/transfers"
      canWrite={has("goods.write")}
      canEdit={false}
      canRemoveRow={() => false}
      columns={[
        { key: "doc_no", label: "Document" },
        { key: "transferred_on", label: "Date" },
        { key: "goods_name", label: "Goods" },
        { key: "from_unit", label: "From unit" },
        { key: "from_location", label: "From place" },
        { key: "to_unit", label: "To unit" },
        { key: "to_location", label: "To place" },
        { key: "quantity", label: "Qty" },
      ]}
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
