"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Shell } from "@/components/shell";
import { Loading } from "@/components/ui";
import { useSession } from "@/lib/auth";
import { useText } from "@/lib/i18n";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { t } = useText();
  const { ready, me } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (ready && !me) router.replace("/login");
  }, [ready, me, router]);
  if (!ready || !me) return <Loading label={t("common.opening")} />;
  return <Shell>{children}</Shell>;
}
