"use client";

import { ResourcePage } from "@/components/resource";
import { useSession } from "@/lib/auth";
import { goodsTypeColumns, goodsTypeDescription, goodsTypeFields } from "./fields";

export default function GoodsTypesPage() {
  const { has } = useSession();
  return (
    <ResourcePage
      title="Goods types"
      eyebrow="Goods"
      description={goodsTypeDescription}
      path="/goods/types"
      hrefBase="/goods/types"
      canWrite={has("goods.write")}
      columns={goodsTypeColumns}
      fields={goodsTypeFields}
    />
  );
}
