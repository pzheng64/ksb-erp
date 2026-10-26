"use client";

import { ResourcePage } from "@/components/resource";
import { useSession } from "@/lib/auth";

export default function PositionsPage() {
  const { has } = useSession();
  return (
    <ResourcePage
      title="Positions"
      eyebrow="Organization"
      description="Job positions such as Manager, Engineer, Architect, or Worker. Each employee card holds one position plus a free-text subtitle."
      path="/org/positions"
      hrefBase="/admin/positions"
      canWrite={has("org.manage")}
      columns={[
        { key: "name", label: "Name" },
        { key: "code", label: "Code" },
        { key: "rank", label: "Rank" },
      ]}
      fields={[
        { name: "name", label: "Name", type: "text", required: true },
        { name: "code", label: "Code", type: "text", required: true },
        { name: "rank", label: "Rank", type: "number", placeholder: "Lower ranks sort first" },
      ]}
    />
  );
}
