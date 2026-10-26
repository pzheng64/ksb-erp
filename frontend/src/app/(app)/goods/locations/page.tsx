"use client";

import { ResourcePage } from "@/components/resource";
import { useSession } from "@/lib/auth";

export default function LocationsPage() {
  const { has, options } = useSession();
  return (
    <ResourcePage
      title="Places"
      eyebrow="Goods"
      description="Warehouses hold operating stock. Vaults hold inventory the finance view treats as the financial vault."
      path="/goods/locations"
      hrefBase="/goods/locations"
      canWrite={has("goods.write")}
      columns={[
        { key: "name", label: "Place" },
        { key: "kind", label: "Kind" },
        { key: "unit_name", label: "Unit" },
      ]}
      fields={[
        { name: "name", label: "Name", type: "text", required: true },
        { name: "kind", label: "Kind", type: "select", required: true, options: [{ value: "warehouse", label: "Warehouse" }, { value: "vault", label: "Vault" }] },
        { name: "unit_id", label: "Unit", type: "select", required: true, valueType: "number", options: options.units.map((unit) => ({ value: String(unit.id), label: unit.name })) },
        { name: "note", label: "Note", type: "text" },
      ]}
    />
  );
}
