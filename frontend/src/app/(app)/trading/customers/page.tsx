"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ListToolbar, useListControls } from "@/components/list-tools";
import { Banner, Empty, Field, Modal, PageHeader } from "@/components/ui";
import { useToast } from "@/components/toast";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { moneyParts } from "@/lib/format";
import { Term, useText } from "@/lib/i18n";
import { Row } from "@/lib/types";

type CustomerPage = { items: Row[]; total: number; companies: number; personal: number };

const blank = {
  kind: "company",
  name: "",
  contact_name: "",
  phone: "",
  email: "",
  address: "",
  reference_no: "",
  note: "",
  is_active: true,
};

export default function CustomersPage() {
  const { t } = useText();
  const { has } = useSession();
  const canWrite = has("trading.write");
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState<CustomerPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);

  function load() {
    api<CustomerPage>("/trade-customers")
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : t("common.loadFailed")));
  }

  useEffect(() => {
    load();
  }, [t]);

  const items = data?.items || [];
  const fields = useMemo(
    () => [
      { key: "name", label: t("common.name"), value: (row: Row) => String(row.name || "–") },
      {
        key: "kind",
        label: t("common.kind"),
        value: (row: Row) => {
          const key = `customerKind.${row.kind}`;
          const label = t(key);
          return label === key ? String(row.kind || "–") : label;
        },
      },
      { key: "contact", label: t("trading.contact"), value: (row: Row) => String(row.contact_name || "–") },
      { key: "phone", label: t("common.phone"), value: (row: Row) => String(row.phone || "–") },
      { key: "orders", label: t("trading.ordersCount"), value: (row: Row) => String(row.order_count ?? "–") },
      { key: "total", label: t("trading.sellTotal"), value: (row: Row) => moneyParts(row.amounts) },
    ],
    [t],
  );
  const list = useListControls(items, fields);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const created = await api<Row>("/trade-customers", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          contact_name: form.contact_name || null,
          phone: form.phone || null,
          email: form.email || null,
          address: form.address || null,
          reference_no: form.reference_no || null,
          note: form.note || null,
        }),
      });
      toast.success(t("common.saved"));
      setOpen(false);
      setForm(blank);
      router.push(`/trading/customers/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={t("nav.customers")}
        eyebrow={t("nav.trading")}
        action={
          canWrite ? (
            <button className="btn-primary" type="button" onClick={() => setOpen(true)}>
              {t("common.add")}
            </button>
          ) : null
        }
      />
      <p className="mb-2 text-xs text-ink/55">
        {t("trading.customersBlurb")}
        {data ? ` ${data.total} · ${data.companies} ${t("trading.companies")} · ${data.personal} ${t("trading.people")}` : ""}
      </p>
      {error && <Banner>{error}</Banner>}
      <ListToolbar fields={fields} controls={list} />
      <div className="card">
        <div className="overflow-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("common.name")}</th>
                <th>{t("common.kind")}</th>
                <th>{t("trading.contact")}</th>
                <th>{t("common.phone")}</th>
                <th>{t("trading.ordersCount")}</th>
                <th>{t("trading.sellTotal")}</th>
              </tr>
            </thead>
            <tbody>
              {list.pageRows.map((row) => (
                <tr key={row.id} className="cursor-pointer" onClick={() => router.push(`/trading/customers/${row.id}`)}>
                  <td>{row.name}</td>
                  <td>
                    <Term prefix="customerKind" value={row.kind} />
                  </td>
                  <td>{row.contact_name || "–"}</td>
                  <td>{row.phone || "–"}</td>
                  <td>{row.order_count}</td>
                  <td>{moneyParts(row.amounts)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!list.filtered.length && <Empty>{t("trading.noCustomers")}</Empty>}
        </div>
      </div>
      {open && (
        <Modal title={t("trading.newCustomer")} onClose={() => setOpen(false)}>
          <form className="grid gap-3 md:grid-cols-2" onSubmit={onSubmit}>
            {error && <div className="md:col-span-2"><Banner>{error}</Banner></div>}
            <Field label={t("common.kind")}>
              <select className="field" value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })}>
                <option value="company">{t("customerKind.company")}</option>
                <option value="personal">{t("customerKind.personal")}</option>
              </select>
            </Field>
            <Field label={t("common.name")}>
              <input className="field" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
            </Field>
            <Field label={t("trading.contact")}>
              <input className="field" value={form.contact_name} onChange={(event) => setForm({ ...form, contact_name: event.target.value })} />
            </Field>
            <Field label={t("common.phone")}>
              <input className="field" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
            </Field>
            <Field label={t("common.email")}>
              <input className="field" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
            </Field>
            <Field label={t("trading.reference")}>
              <input className="field" value={form.reference_no} onChange={(event) => setForm({ ...form, reference_no: event.target.value })} />
            </Field>
            <Field label={t("common.address")}>
              <input className="field" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
            </Field>
            <Field label={t("common.note")}>
              <input className="field" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} />
            </Field>
            <div className="md:col-span-2 flex justify-end gap-2">
              <button className="btn-ghost" type="button" onClick={() => setOpen(false)}>
                {t("common.cancel")}
              </button>
              <button className="btn-primary" type="submit" disabled={saving}>
                {saving ? t("common.saving") : t("common.save")}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
