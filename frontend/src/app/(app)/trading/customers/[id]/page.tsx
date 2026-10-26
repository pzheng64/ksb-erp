"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Banner, DetailHeader, Field, Loading } from "@/components/ui";
import { useToast } from "@/components/toast";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { money, moneyParts } from "@/lib/format";
import { Term, useText } from "@/lib/i18n";
import { Row } from "@/lib/types";

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const { t } = useText();
  const { has } = useSession();
  const canWrite = has("trading.write");
  const router = useRouter();
  const toast = useToast();
  const [row, setRow] = useState<Row | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<Row>(`/trade-customers/${params.id}`)
      .then(setRow)
      .catch((err) => setError(err instanceof ApiError ? err.message : t("common.loadFailed")));
  }, [params.id, t]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!row || !canWrite) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await api<Row>(`/trade-customers/${params.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          kind: row.kind,
          name: row.name,
          contact_name: row.contact_name || null,
          phone: row.phone || null,
          email: row.email || null,
          address: row.address || null,
          reference_no: row.reference_no || null,
          note: row.note || null,
          is_active: Boolean(row.is_active),
        }),
      });
      setRow({ ...row, ...saved, orders: row.orders });
      toast.success(t("common.saved"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm(t("common.removeConfirm"))) return;
    try {
      await api(`/trade-customers/${params.id}`, { method: "DELETE" });
      router.push("/trading/customers");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.removeFailed"));
    }
  }

  if (error && !row) return <Banner>{error}</Banner>;
  if (!row) return <Loading />;
  const orders: Row[] = row.orders || [];

  return (
    <div>
      <DetailHeader
        backHref="/trading/customers"
        backLabel={t("nav.customers")}
        title={row.name}
        action={
          canWrite ? (
            <button className="btn-danger" type="button" onClick={remove}>
              {t("common.delete")}
            </button>
          ) : null
        }
      />
      {error && <Banner>{error}</Banner>}
      <p className="mb-4 text-sm text-ink/60">
        <Term prefix="customerKind" value={row.kind} /> · {row.order_count} {t("trading.ordersCount")} · {moneyParts(row.amounts)}
      </p>
      <form className="card grid gap-3 p-4 md:grid-cols-2" onSubmit={onSubmit}>
        <Field label={t("common.kind")}>
          <select className="field" value={row.kind} onChange={(event) => setRow({ ...row, kind: event.target.value })} disabled={!canWrite}>
            <option value="company">{t("customerKind.company")}</option>
            <option value="personal">{t("customerKind.personal")}</option>
          </select>
        </Field>
        <Field label={t("common.name")}>
          <input className="field" value={row.name || ""} onChange={(event) => setRow({ ...row, name: event.target.value })} required disabled={!canWrite} />
        </Field>
        <Field label={t("trading.contact")}>
          <input className="field" value={row.contact_name || ""} onChange={(event) => setRow({ ...row, contact_name: event.target.value })} disabled={!canWrite} />
        </Field>
        <Field label={t("common.phone")}>
          <input className="field" value={row.phone || ""} onChange={(event) => setRow({ ...row, phone: event.target.value })} disabled={!canWrite} />
        </Field>
        <Field label={t("common.email")}>
          <input className="field" value={row.email || ""} onChange={(event) => setRow({ ...row, email: event.target.value })} disabled={!canWrite} />
        </Field>
        <Field label={t("trading.reference")}>
          <input className="field" value={row.reference_no || ""} onChange={(event) => setRow({ ...row, reference_no: event.target.value })} disabled={!canWrite} />
        </Field>
        <Field label={t("common.address")}>
          <input className="field" value={row.address || ""} onChange={(event) => setRow({ ...row, address: event.target.value })} disabled={!canWrite} />
        </Field>
        <Field label={t("common.note")}>
          <input className="field" value={row.note || ""} onChange={(event) => setRow({ ...row, note: event.target.value })} disabled={!canWrite} />
        </Field>
        <label className="flex items-center gap-2 text-sm md:col-span-2">
          <input type="checkbox" checked={Boolean(row.is_active)} onChange={(event) => setRow({ ...row, is_active: event.target.checked })} disabled={!canWrite} />
          {t("common.active")}
        </label>
        {canWrite && (
          <div className="md:col-span-2">
            <button className="btn-primary" type="submit" disabled={saving}>
              {saving ? t("common.saving") : t("common.save")}
            </button>
          </div>
        )}
      </form>
      <section className="card mt-4 p-4">
        <h2 className="font-serif text-xl">{t("trading.customerOrders")}</h2>
        <table className="data-table mt-2">
          <thead>
            <tr>
              <th>{t("common.code")}</th>
              <th>{t("common.date")}</th>
              <th>{t("trading.assignee")}</th>
              <th>{t("trading.seller")}</th>
              <th>{t("trading.lines")}</th>
              <th>{t("trading.total")}</th>
              <th>{t("common.status")}</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
                <tr key={order.id} className="cursor-pointer" onClick={() => router.push(`/trading/sales/${order.id}`)}>
                <td>{order.order_no}</td>
                <td>{String(order.trade_date).slice(0, 10)}</td>
                <td>{order.assignee_name || "–"}</td>
                <td>{order.seller_name || "–"}</td>
                <td>{order.line_count}</td>
                <td>{money(order.amount, order.currency, 2)}</td>
                <td>
                  <Term prefix="tradeStatus" value={order.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!orders.length && <p className="px-3 py-6 text-sm text-ink/50">{t("common.empty")}</p>}
      </section>
    </div>
  );
}
