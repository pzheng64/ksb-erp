"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Banner, DetailHeader, Field, Loading } from "@/components/ui";
import { ImageField } from "@/components/image-field";
import { useToast } from "@/components/toast";
import { isDirty, snapshot, UnsavedDialog } from "@/components/unsaved";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { useSettings } from "@/lib/settings";
import { Row } from "@/lib/types";

const blank = {
  asset_no: "",
  name: "",
  category: "",
  unit_id: "",
  status: "in_service",
  value: "0",
  currency: "USD",
  purchased_on: "",
  note: "",
  image_url: "",
};

export default function EquipmentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { has, options } = useSession();
  const { defaultCurrency } = useSettings();
  const canWrite = has("equipment.write");
  const isNew = params.id === "new";

  const [form, setForm] = useState(blank);
  const [baseline, setBaseline] = useState(snapshot(blank));
  const [title, setTitle] = useState(isNew ? "New equipment" : "Equipment");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const dirty = canWrite && isDirty(form, baseline);
  const formRef = useRef(form);
  formRef.current = form;

  useEffect(() => {
    if (!isNew) return;
    const current = formRef.current;
    const started = Boolean(current.asset_no || current.name || current.category || current.note);
    if (started) return;
    const next = { ...current, currency: defaultCurrency };
    setForm(next);
    setBaseline(snapshot(next));
  }, [defaultCurrency, isNew]);

  useEffect(() => {
    if (isNew) return;
    api<Row>(`/equipment/${params.id}`)
      .then((row) => {
        setTitle(row.name || row.asset_no || "Equipment");
        const next = {
          asset_no: row.asset_no || "",
          name: row.name || "",
          category: row.category || "",
          unit_id: row.unit_id == null ? "" : String(row.unit_id),
          status: row.status || "in_service",
          value: String(row.value ?? 0),
          currency: row.currency || defaultCurrency,
          purchased_on: row.purchased_on || "",
          note: row.note || "",
          image_url: row.image_url || "",
        };
        setForm(next);
        setBaseline(snapshot(next));
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load equipment"))
      .finally(() => setLoading(false));
  }, [isNew, params.id]);

  async function persist() {
    const body = {
      asset_no: form.asset_no.trim(),
      name: form.name.trim(),
      category: form.category.trim(),
      unit_id: form.unit_id ? Number(form.unit_id) : null,
      status: form.status,
      value: Number(form.value || 0),
      currency: form.currency,
      purchased_on: form.purchased_on || null,
      note: form.note.trim() || null,
      image_url: form.image_url.trim() || null,
    };
    if (isNew) {
      const created = await api<Row>("/equipment", { method: "POST", body: JSON.stringify(body) });
      toast.success("Saved");
      setBaseline(snapshot(form));
      router.replace(`/equipment/${created.id}`);
      return;
    }
    const updated = await api<Row>(`/equipment/${params.id}`, { method: "PATCH", body: JSON.stringify(body) });
    setTitle(updated.name || updated.asset_no || "Equipment");
    setBaseline(snapshot(form));
    toast.success("Saved");
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canWrite) return;
    setSaving(true);
    setError(null);
    try {
      await persist();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function requestLeave() {
    if (!dirty) {
      router.push("/equipment");
      return;
    }
    setLeaveOpen(true);
  }

  async function saveAndLeave() {
    setSaving(true);
    setError(null);
    try {
      await persist();
      setLeaveOpen(false);
      router.push("/equipment");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Save failed");
      setLeaveOpen(false);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Loading />;

  return (
    <div>
      <DetailHeader backHref="/equipment" backLabel="Equipment" title={title} onBack={requestLeave} />
      {error && <Banner>{error}</Banner>}
      <form className="card grid max-w-3xl gap-4 p-5 sm:grid-cols-2" onSubmit={onSubmit}>
        <div className="sm:col-span-2">
          <Field label="Image">
            <ImageField value={form.image_url} disabled={!canWrite} onChange={(url) => setForm({ ...form, image_url: url })} />
          </Field>
        </div>
        <Field label="Asset number">
          <input className="field" value={form.asset_no} disabled={!canWrite} onChange={(event) => setForm({ ...form, asset_no: event.target.value })} required />
        </Field>
        <Field label="Name">
          <input className="field" value={form.name} disabled={!canWrite} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
        </Field>
        <Field label="Category">
          <input className="field" value={form.category} disabled={!canWrite} onChange={(event) => setForm({ ...form, category: event.target.value })} required />
        </Field>
        <Field label="Unit">
          <select className="field" value={form.unit_id} disabled={!canWrite} onChange={(event) => setForm({ ...form, unit_id: event.target.value })}>
            <option value="">None</option>
            {options.units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select className="field" value={form.status} disabled={!canWrite} onChange={(event) => setForm({ ...form, status: event.target.value })} required>
            <option value="in_service">In service</option>
            <option value="maintenance">Maintenance</option>
            <option value="retired">Retired</option>
          </select>
        </Field>
        <Field label="Purchased">
          <input className="field" type="date" value={form.purchased_on} disabled={!canWrite} onChange={(event) => setForm({ ...form, purchased_on: event.target.value })} />
        </Field>
        <Field label="Value">
          <input className="field" type="number" step="any" value={form.value} disabled={!canWrite} onChange={(event) => setForm({ ...form, value: event.target.value })} />
        </Field>
        <Field label="Currency">
          <select className="field" value={form.currency} disabled={!canWrite} onChange={(event) => setForm({ ...form, currency: event.target.value })} required>
            <option value="USD">USD</option>
            <option value="RMB">RMB</option>
          </select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="Note">
            <textarea className="field min-h-24" value={form.note} disabled={!canWrite} onChange={(event) => setForm({ ...form, note: event.target.value })} />
          </Field>
        </div>
        {canWrite && (
          <div className="sm:col-span-2 flex justify-end gap-2 border-t border-line pt-4">
            <button className="btn-ghost" type="button" onClick={requestLeave}>
              Cancel
            </button>
            <button className="btn-primary" disabled={saving} type="submit">
              {saving ? "Saving" : "Save"}
            </button>
          </div>
        )}
      </form>
      <UnsavedDialog
        open={leaveOpen}
        saving={saving}
        onStay={() => setLeaveOpen(false)}
        onLeave={() => {
          setLeaveOpen(false);
          router.push("/equipment");
        }}
        onSave={saveAndLeave}
      />
    </div>
  );
}
