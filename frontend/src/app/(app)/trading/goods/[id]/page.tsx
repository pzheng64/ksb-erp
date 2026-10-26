"use client";

import { ResourceDetail } from "@/components/resource";
import { useSession } from "@/lib/auth";
import { useText } from "@/lib/i18n";
import { GoodsHistory } from "../../goods-history";

export default function TradeGoodsDetailPage() {
  const { has } = useSession();
  const { t } = useText();
  const categories = ["clothing", "furniture", "food", "vehicle", "other"].map((value) => ({
    value,
    label: t(`tradeCategory.${value}`),
  }));
  return (
    <ResourceDetail
      title={t("nav.tradeGoods")}
      backLabel={t("nav.tradeGoods")}
      path="/trade-products"
      hrefBase="/trading/goods"
      canWrite={has("trading.write")}
      titleKey="name"
      fields={[
        { name: "sku", label: "SKU", type: "text", required: true },
        { name: "name", label: t("common.name"), type: "text", required: true },
        { name: "category", label: t("trading.category"), type: "select", required: true, options: categories },
        { name: "variety", label: t("trading.variety"), type: "text", required: true },
        { name: "uom", label: t("trading.measure"), type: "text", required: true },
        { name: "is_active", label: t("common.active"), type: "checkbox" },
      ]}
      after={(row) => <GoodsHistory row={row} />}
    />
  );
}
