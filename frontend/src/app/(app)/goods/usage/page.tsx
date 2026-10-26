"use client";

import { ResourcePage } from "@/components/resource";
import { useSession } from "@/lib/auth";
import { Term } from "@/lib/i18n";
import { categoryLabel } from "@/lib/labels";
import { GoodsLink } from "../goods-panel";

const categories = Object.entries(categoryLabel).map(([value, label]) => ({ value, label }));

export default function UsagePage() {
  const { has, options } = useSession();
  const goods = options.goods.map((item) => ({ value: String(item.id), label: `${item.sku} · ${item.name}` }));
  const places = options.locations.map((item) => ({ value: String(item.id), label: `${item.name} · ${item.unit_name || ""}` }));
  const units = options.units.map((item) => ({ value: String(item.id), label: item.name }));
  return (
    <ResourcePage
      title="Goods usage"
      eyebrow="Goods"
      description="Recording usage takes the quantity out of the chosen place and writes the warehouse ledger."
      path="/goods/usages"
      hrefBase="/goods/usage"
      canWrite={has("goods.write")}
      removeLabel="Reverse"
      canRemoveRow={(row) => !row.reversed}
      columns={[
        { key: "doc_no", label: "Document" },
        { key: "used_on", label: "Date" },
        { key: "goods_name", label: "Goods", render: (row) => <GoodsLink goodsId={row.goods_id} name={row.goods_name || "–"} /> },
        { key: "category", label: "Use", render: (row) => <Term prefix="category" value={row.category} /> },
        { key: "location_name", label: "Place" },
        { key: "actor", label: "Employee" },
        { key: "using_unit", label: "Using unit" },
        { key: "destination", label: "Destination" },
        { key: "quantity", label: "Qty" },
        { key: "reversed", label: "State", render: (row) => (row.reversed ? "Reversed" : "Posted") },
      ]}
      fields={(row) => [
        ...(row ? [] : [
          { name: "goods_id", label: "Goods", type: "select" as const, required: true, valueType: "number" as const, options: goods },
          { name: "location_id", label: "Place", type: "select" as const, required: true, valueType: "number" as const, options: places },
        ]),
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
