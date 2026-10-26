"use client";

import { ResourceDetail } from "@/components/resource";
import { useSession } from "@/lib/auth";
import { goodsTypeFields } from "../fields";

export default function GoodsTypeDetailPage() {
  const { has } = useSession();
  return (
    <ResourceDetail
      title="Goods type"
      backLabel="Goods types"
      path="/goods/types"
      hrefBase="/goods/types"
      canWrite={has("goods.write")}
      titleKey="name"
      fields={goodsTypeFields}
    />
  );
}
