"use client";

import { ResourceDetail } from "@/components/resource";
import { useSession } from "@/lib/auth";

export default function LocationDetailPage() {
  const { has, options } = useSession();
  return (
    <ResourceDetail
      title="Place"
      backLabel="Places"
      path="/goods/locations"
      hrefBase="/goods/locations"
      canWrite={has("goods.write")}
      titleKey="name"
      fields={[
        { name: "name", label: "Name", type: "text", required: true },
        { name: "kind", label: "Kind", type: "select", required: true, options: [{ value: "warehouse", label: "Warehouse" }, { value: "vault", label: "Vault" }] },
        { name: "unit_id", label: "Unit", type: "select", required: true, valueType: "number", options: options.units.map((unit) => ({ value: String(unit.id), label: unit.name })) },
        { name: "note", label: "Note", type: "text" },
      ]}
    />
  );
}
