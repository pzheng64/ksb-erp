"use client";

import { ResourceDetail } from "@/components/resource";
import { useSession } from "@/lib/auth";

export default function PositionDetailPage() {
  const { has } = useSession();
  return (
    <ResourceDetail
      title="Position"
      backLabel="Positions"
      path="/org/positions"
      hrefBase="/admin/positions"
      canWrite={has("org.manage")}
      titleKey="name"
      fields={[
        { name: "name", label: "Name", type: "text", required: true },
        { name: "code", label: "Code", type: "text", required: true },
        { name: "rank", label: "Rank", type: "number", placeholder: "Lower ranks sort first" },
      ]}
    />
  );
}
