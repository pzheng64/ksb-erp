"use client";

import { FieldDef } from "@/components/resource";
import { Term, Tx } from "@/lib/i18n";
import { Row } from "@/lib/types";

export const handlingOptions = [
  { value: "consumable", label: "Consumable" },
  { value: "durable", label: "Durable" },
  { value: "spare", label: "Spare part" },
];

export const storageOptions = [
  { value: "ambient", label: "Ambient" },
  { value: "chilled", label: "Chilled" },
  { value: "frozen", label: "Frozen" },
  { value: "flammable", label: "Flammable" },
  { value: "secure", label: "Secure" },
  { value: "bulky", label: "Bulky" },
];

const handlingLabel = Object.fromEntries(handlingOptions.map((item) => [item.value, item.label]));
const storageLabel = Object.fromEntries(storageOptions.map((item) => [item.value, item.label]));

function yesNo(value: unknown) {
  return value ? "Yes" : "No";
}

export const goodsTypeFields: FieldDef[] = [
  { name: "name", label: "Name", type: "text", required: true },
  { name: "code", label: "Code", type: "text", required: true, placeholder: "FOOD" },
  { name: "handling", label: "Handling", type: "select", required: true, options: handlingOptions },
  { name: "storage", label: "Storage", type: "select", required: true, options: storageOptions },
  { name: "default_uom", label: "Default unit", type: "text", required: true, placeholder: "pcs, kg, L" },
  { name: "perishable", label: "Perishable", type: "checkbox", defaultChecked: false },
  { name: "hazardous", label: "Hazardous", type: "checkbox", defaultChecked: false },
  { name: "is_active", label: "Active", type: "checkbox" },
  { name: "description", label: "Description", type: "textarea" },
];

export const goodsTypeColumns = [
  { key: "name", label: "Name", render: (row: Row) => <Tx value={String(row.name ?? "")} /> },
  { key: "code", label: "Code" },
  {
    key: "handling",
    label: "Handling",
    render: (row: Row) => <Term prefix="goods.handling" value={String(row.handling ?? "")} />,
    exportValue: (row: Row) => handlingLabel[String(row.handling)] || String(row.handling ?? ""),
  },
  {
    key: "storage",
    label: "Storage",
    render: (row: Row) => <Term prefix="goods.storage" value={String(row.storage ?? "")} />,
    exportValue: (row: Row) => storageLabel[String(row.storage)] || String(row.storage ?? ""),
  },
  { key: "default_uom", label: "Default unit" },
  {
    key: "perishable",
    label: "Perishable",
    render: (row: Row) => <Tx value={yesNo(row.perishable)} />,
    exportValue: (row: Row) => yesNo(row.perishable),
  },
  {
    key: "hazardous",
    label: "Hazardous",
    render: (row: Row) => <Tx value={yesNo(row.hazardous)} />,
    exportValue: (row: Row) => yesNo(row.hazardous),
  },
  {
    key: "is_active",
    label: "Active",
    render: (row: Row) => <Tx value={yesNo(row.is_active)} />,
    exportValue: (row: Row) => yesNo(row.is_active),
  },
];

export const goodsTypeDescription =
  "Classify catalog items such as food, fuel, and furniture, and record how each type is stored and handled.";
