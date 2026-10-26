"use client";

import { ResourceDetail } from "@/components/resource";
import { useSession } from "@/lib/auth";
import { categoryLabel } from "@/lib/labels";

const categories = Object.entries(categoryLabel).map(([value, label]) => ({ value, label }));

export default function UsageDetailPage() {
  const { has, options } = useSession();
  const goods = options.goods.map((item) => ({ value: String(item.id), label: `${item.sku} · ${item.name}` }));
  const places = options.locations.map((item) => ({ value: String(item.id), label: `${item.name} · ${item.unit_name || ""}` }));
  const units = options.units.map((item) => ({ value: String(item.id), label: item.name }));
  return (
    <ResourceDetail
      title="Goods usage"
      backLabel="Goods usage"
      path="/goods/usages"
      hrefBase="/goods/usage"
      canWrite={has("goods.write")}
      titleKey="doc_no"
      readOnlyWhen={(row) => Boolean(row?.reversed)}
      fields={[
        { name: "goods_id", label: "Goods", type: "select" as const, required: true, valueType: "number" as const, options: goods },
        { name: "location_id", label: "Warehouse", type: "select" as const, required: true, valueType: "number" as const, options: places },
        { name: "using_unit_id", label: "Using unit", type: "select", valueType: "number", options: units },
        { name: "destination", label: "Destination", type: "text", required: true, placeholder: "Person or unit" },
        { name: "category", label: "Use", type: "select", required: true, options: categories },
        { name: "quantity", label: "Quantity", type: "number", required: true },
        { name: "used_on", label: "Date", type: "date", required: true },
        { name: "note", label: "Comment", type: "text" },
      ]}
    />
  );
}
