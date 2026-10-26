"use client";

import { ResourceDetail } from "@/components/resource";
import { useSession } from "@/lib/auth";

export default function PurchaseFromDetailPage() {
  const { has } = useSession();
  return (
    <ResourceDetail
      title="Purchase from"
      backLabel="Purchase from"
      path="/goods/purchase-sources"
      hrefBase="/goods/purchase-from"
      canWrite={has("goods.write")}
      titleKey="name"
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
