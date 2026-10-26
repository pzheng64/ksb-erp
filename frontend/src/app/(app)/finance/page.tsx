"use client";

import { ResourcePage } from "@/components/resource";
import { useSession } from "@/lib/auth";
import { useSettings } from "@/lib/settings";
import { money } from "@/lib/format";

export default function FinancePage() {
  const { has, options } = useSession();
  const { defaultCurrency } = useSettings();
  return (
    <ResourcePage
      title="Finance"
      eyebrow="Operations"
      description="Income and expense stay in the currency they were recorded in."
      path="/finance"
      hrefBase="/finance"
      exportFilename="finance"
      canWrite={has("finance.write")}
      columns={[
        { key: "entry_date", label: "Date" },
        { key: "direction", label: "Direction" },
        { key: "category", label: "Category" },
        { key: "amount", label: "Amount", render: (row) => money(row.amount, row.currency) },
        { key: "unit_name", label: "Unit" },
        { key: "memo", label: "Memo" },
      ]}
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
