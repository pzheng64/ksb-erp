"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loading } from "@/components/ui";

export default function DepartmentsRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/admin/units");
  }, [router]);
  return <Loading label="Opening units" />;
}
