"use client";

import { ResourcePage } from "@/components/resource";
import { useSession } from "@/lib/auth";
import { money } from "@/lib/format";
import { GoodsLink } from "../goods-panel";

export default function StockInPage() {
  const { has, options } = useSession();
  const people = options.people.map((person) => ({ value: String(person.id), label: person.full_name }));
  return (
    <ResourcePage
      title="In"
      eyebrow="Goods"
      description="A receipt records which goods landed in which warehouse, who purchased them, and who accepted them."
      path="/goods/stock-ins"
      hrefBase="/goods/stock-in"
      canWrite={has("goods.write")}
      canEdit={false}
      removeLabel="Reverse"
      canRemoveRow={(row) => !row.reversed}
      columns={[
        { key: "doc_no", label: "Document" },
        { key: "received_on", label: "Date" },
        { key: "goods_name", label: "Goods", render: (row) => <GoodsLink goodsId={row.goods_id} name={row.goods_name || "–"} /> },
        { key: "location_name", label: "Warehouse" },
        { key: "actor", label: "Employee" },
        { key: "quantity", label: "Qty" },
        { key: "unit_price", label: "Price", render: (row) => money(row.unit_price, row.currency, 2) },
        { key: "purchaser", label: "Purchaser" },
        { key: "acceptor", label: "Accepted by" },
        { key: "purchased_from", label: "From" },
        { key: "reversed", label: "State", render: (row) => (row.reversed ? "Reversed" : "Posted") },
      ]}
      fields={[
        { name: "goods_id", label: "Goods", type: "select", required: true, valueType: "number", options: options.goods.map((item) => ({ value: String(item.id), label: `${item.sku} · ${item.name}` })) },
        { name: "location_id", label: "Warehouse", type: "select", required: true, valueType: "number", options: options.locations.map((item) => ({ value: String(item.id), label: `${item.name} · ${item.unit_name || ""}` })) },
        { name: "quantity", label: "Quantity", type: "number", required: true },
        { name: "unit_price", label: "Unit price", type: "number", required: true },
        { name: "purchaser_user_id", label: "Purchaser", type: "select", valueType: "number", options: people },
        { name: "acceptor_user_id", label: "Accepted by", type: "select", valueType: "number", options: people },
        { name: "purchased_from", label: "Purchased from", type: "text" },
        { name: "received_on", label: "Date", type: "date", required: true },
        { name: "note", label: "Note", type: "text" },
      ]}
    />
  );
}
