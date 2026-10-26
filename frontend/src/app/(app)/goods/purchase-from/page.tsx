"use client";

import { ResourcePage } from "@/components/resource";
import { useSession } from "@/lib/auth";

export default function PurchaseFromPage() {
  const { has } = useSession();
  return (
    <ResourcePage
      title="Purchase from"
      eyebrow="Goods"
      description="Vendors and places goods are purchased from. Goods and stock-in history use these names."
      path="/goods/purchase-sources"
      hrefBase="/goods/purchase-from"
      canWrite={has("goods.write")}
      removeLabel="Remove"
      columns={[
        { key: "name", label: "Name" },
        { key: "contact", label: "Contact" },
        { key: "phone", label: "Phone" },
        { key: "address", label: "Address" },
        { key: "is_active", label: "Active", render: (row) => (row.is_active ? "Yes" : "Retired") },
      ]}
      fields={[
        { name: "name", label: "Name", type: "text", required: true },
        { name: "contact", label: "Contact", type: "text" },
        { name: "phone", label: "Phone", type: "text" },
        { name: "address", label: "Address", type: "text" },
        { name: "note", label: "Note", type: "text" },
        { name: "is_active", label: "Active", type: "checkbox" },
      ]}
    />
  );
}
