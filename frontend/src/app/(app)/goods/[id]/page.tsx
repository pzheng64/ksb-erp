"use client";

import { ResourceDetail } from "@/components/resource";
import { useSession } from "@/lib/auth";
import { useSettings } from "@/lib/settings";
import { categoryLabel } from "@/lib/labels";
import { GoodsFlow } from "../goods-flow";

const categories = Object.entries(categoryLabel).map(([value, label]) => ({ value, label }));

export default function GoodsDetailPage() {
  const { has, options } = useSession();
  const { defaultCurrency } = useSettings();
  const sources = options.purchase_sources.map((item) => ({ value: item.name, label: item.name }));
  return (
    <ResourceDetail
      title="Goods"
      backLabel="Goods list"
      path="/goods"
      hrefBase="/goods"
      canWrite={has("goods.write")}
      titleKey="name"
      fields={[
        { name: "image_url", label: "Image", type: "image" },
        { name: "sku", label: "SKU", type: "text", required: true },
        { name: "name", label: "Name", type: "text", required: true },
        { name: "type_id", label: "Type", type: "select", valueType: "number", options: options.goods_types.filter((item) => item.is_active !== false).map((item) => ({ value: String(item.id), label: item.name })) },
        { name: "category", label: "Use", type: "select", required: true, options: categories },
        { name: "quota", label: "Quota", type: "number" },
        { name: "specs", label: "Specs", type: "text" },
        { name: "uom", label: "Unit of measure", type: "text", required: true, placeholder: "pcs, box, kg" },
        { name: "unit_price", label: "Unit price", type: "number" },
        { name: "currency", label: "Currency", type: "select", required: true, defaultValue: defaultCurrency, options: [{ value: "USD", label: "USD" }, { value: "RMB", label: "RMB" }] },
        { name: "purchased_from", label: "Purchase from", type: "select", options: sources },
        { name: "working_unit_id", label: "Working unit", type: "select", valueType: "number", options: options.units.map((unit) => ({ value: String(unit.id), label: unit.name })) },
        { name: "is_active", label: "Active", type: "checkbox" },
      ]}
      after={(row) => <GoodsFlow row={row} />}
    />
  );
}
