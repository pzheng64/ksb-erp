"use client";

import { ResourceDetail } from "@/components/resource";
import { useSession } from "@/lib/auth";
import { useSettings } from "@/lib/settings";

export default function FinanceDetailPage() {
  const { has, options } = useSession();
  const { defaultCurrency } = useSettings();
  return (
    <ResourceDetail
      title="Finance"
      backLabel="Finance"
      path="/finance"
      hrefBase="/finance"
      canWrite={has("finance.write")}
      titleKey="category"
      fields={[
        { name: "entry_date", label: "Date", type: "date", required: true },
        { name: "direction", label: "Direction", type: "select", required: true, options: [{ value: "income", label: "Income" }, { value: "expense", label: "Expense" }] },
        { name: "category", label: "Category", type: "text", required: true },
        { name: "amount", label: "Amount", type: "number", required: true },
        { name: "currency", label: "Currency", type: "select", required: true, defaultValue: defaultCurrency, options: [{ value: "USD", label: "USD" }, { value: "RMB", label: "RMB" }] },
        { name: "unit_id", label: "Unit", type: "select", valueType: "number", options: options.units.map((unit) => ({ value: String(unit.id), label: unit.name })) },
        { name: "memo", label: "Memo", type: "text" },
      ]}
    />
  );
}
