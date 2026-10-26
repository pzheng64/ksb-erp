"use client";

import { useParams } from "next/navigation";
import { OrderForm } from "../order-form";

export default function TradingDetailPage() {
  const params = useParams<{ id: string }>();
  return <OrderForm id={params.id} mode="buy" />;
}
