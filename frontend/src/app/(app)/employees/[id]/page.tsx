"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { EmployeeCard } from "@/components/employee-card";
import { useSession } from "@/lib/auth";

export default function EmployeeDetailPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { has } = useSession();
  const isNew = params.id === "new";

  return (
    <EmployeeCard
      key={params.id}
      employeeId={isNew ? null : Number(params.id)}
      initialUnitId={search.get("unit_id") || ""}
      canWrite={has("employees.write")}
      variant="page"
      onClose={() => router.push("/employees")}
      onSaved={(row, created) => {
        if (created) router.replace(`/employees/${row.id}`);
      }}
    />
  );
}
