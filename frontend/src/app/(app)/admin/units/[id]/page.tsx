"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Banner, DetailHeader, Empty, Field, Loading } from "@/components/ui";
import { useToast } from "@/components/toast";
import { isDirty, snapshot, UnsavedDialog } from "@/components/unsaved";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { unitKind } from "@/lib/labels";
import { Page, Row } from "@/lib/types";

type UnitDetail = {
  id: number;
  name: string;
  code: string;
  kind: string;
  parent_id?: number | null;
  parent_name?: string | null;
  address?: string | null;
  phone?: string | null;
  is_active: boolean;
  employee_count?: number;
  employees: Row[];
};

const kinds = Object.entries(unitKind).map(([value, label]) => ({ value, label }));
const blank = { name: "", code: "", kind: "shop", parent_id: "", address: "", phone: "", is_active: true };

export default function UnitDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { has, options, refresh } = useSession();
  const canOrg = has("org.manage");
  const canEmp = has("employees.write");
  const canSeePeople = has("org.manage") || has("employees.read") || has("employees.write") || has("dashboard.view");
  const isNew = params.id === "new";

  const [form, setForm] = useState(blank);
  const [baseline, setBaseline] = useState(snapshot(blank));
  const [title, setTitle] = useState(isNew ? "New unit" : "Unit");
  const [detail, setDetail] = useState<UnitDetail | null>(null);
  const [units, setUnits] = useState<Row[]>([]);
  const [status, setStatus] = useState("active");
  const [selectedPeople, setSelectedPeople] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const dirty = canOrg && isDirty(form, baseline);

  async function loadDetail(nextStatus = status) {
    const paramsQs = new URLSearchParams();
    if (nextStatus) paramsQs.set("status", nextStatus);
    const data = await api<UnitDetail>(`/org/units/${params.id}?${paramsQs.toString()}`);
    setDetail(data);
    setTitle(data.name);
    const next = {
      name: data.name,
      code: data.code,
      kind: data.kind,
      parent_id: data.parent_id ? String(data.parent_id) : "",
      address: data.address || "",
      phone: data.phone || "",
      is_active: data.is_active,
    };
    setForm(next);
    setBaseline(snapshot(next));
    setSelectedPeople([]);
  }

  useEffect(() => {
    api<Page<Row>>("/org/units")
      .then((page) => setUnits(page.items))
      .catch(() => undefined);
    if (isNew) return;
    loadDetail()
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load unit"))
      .finally(() => setLoading(false));
  }, [isNew, params.id]);

  useEffect(() => {
    if (isNew || !canSeePeople) return;
    loadDetail(status).catch((err) => setError(err instanceof ApiError ? err.message : "Could not load people"));
  }, [status]);

  async function persistUnit() {
    const body = {
      name: form.name.trim(),
      code: form.code.trim(),
      kind: form.kind,
      parent_id: form.parent_id ? Number(form.parent_id) : null,
      address: form.address.trim() || null,
      phone: form.phone.trim() || null,
      is_active: form.is_active,
    };
    if (isNew) {
      const created = await api<Row>("/org/units", { method: "POST", body: JSON.stringify(body) });
      await refresh();
      toast.success("Saved");
      setBaseline(snapshot(form));
      router.replace(`/admin/units/${created.id}`);
      return;
    }
    await api(`/org/units/${params.id}`, { method: "PATCH", body: JSON.stringify(body) });
    setTitle(body.name);
    setBaseline(snapshot(form));
    await refresh();
    toast.success("Saved");
  }

  async function saveUnit(event: FormEvent) {
    event.preventDefault();
    if (!canOrg) return;
    setSaving(true);
    setError(null);
    try {
      await persistUnit();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save unit");
    } finally {
      setSaving(false);
    }
  }

  function requestLeave() {
    if (!dirty) {
      router.push("/admin/units");
      return;
    }
    setLeaveOpen(true);
  }

  async function saveAndLeave() {
    setSaving(true);
    setError(null);
    try {
      await persistUnit();
      setLeaveOpen(false);
      router.push("/admin/units");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save unit");
      setLeaveOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function bulkMarkLeft() {
    if (!selectedPeople.length) return;
    if (!confirm(`Mark ${selectedPeople.length} employee${selectedPeople.length === 1 ? "" : "s"} as left?`)) return;
    setError(null);
    try {
      for (const id of selectedPeople) {
        await api(`/employees/${id}`, { method: "PATCH", body: JSON.stringify({ status: "left" }) });
      }
      await loadDetail(status);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Update failed");
    }
  }

  const people = detail?.employees || [];
  const allPeopleSelected = people.length > 0 && people.every((row) => selectedPeople.includes(row.id));

  if (loading) return <Loading />;

  return (
    <div>
      <DetailHeader backHref="/admin/units" backLabel="Units" title={title} onBack={requestLeave} />
      {error && <Banner>{error}</Banner>}

      <form className="card mb-6 grid max-w-3xl gap-4 p-5 sm:grid-cols-2" onSubmit={saveUnit}>
        <Field label="Name">
          <input className="field" value={form.name} disabled={!canOrg} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
        </Field>
        <Field label="Code">
          <input className="field" value={form.code} disabled={!canOrg} onChange={(event) => setForm({ ...form, code: event.target.value })} required />
        </Field>
        <Field label="Kind">
          <select className="field" value={form.kind} disabled={!canOrg} onChange={(event) => setForm({ ...form, kind: event.target.value })} required>
            {kinds.map((kind) => (
              <option key={kind.value} value={kind.value}>
                {kind.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Parent">
          <select className="field" value={form.parent_id} disabled={!canOrg} onChange={(event) => setForm({ ...form, parent_id: event.target.value })}>
            <option value="">None</option>
            {units
              .filter((unit) => isNew || String(unit.id) !== params.id)
              .map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Address">
          <input className="field" value={form.address} disabled={!canOrg} onChange={(event) => setForm({ ...form, address: event.target.value })} />
        </Field>
        <Field label="Phone">
          <input className="field" value={form.phone} disabled={!canOrg} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
        </Field>
        <label className="flex items-center gap-2 pt-6">
          <input type="checkbox" checked={form.is_active} disabled={!canOrg} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} />
          <span className="text-sm">Active</span>
        </label>
        {canOrg && (
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
          router.push("/admin/units");
        }}
        onSave={saveAndLeave}
      />

      {!isNew && canSeePeople && (
        <section className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-3">
            <h2 className="font-serif text-xl">Employees</h2>
            <div className="flex flex-wrap items-center gap-2">
              <select className="field w-auto" value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="left">Left</option>
                <option value="">Any status</option>
              </select>
              {canEmp && selectedPeople.length > 0 && (
                <button className="btn-ghost text-clay" onClick={bulkMarkLeft} type="button">
                  Mark left ({selectedPeople.length})
                </button>
              )}
              {canEmp && (
                <button className="btn-primary" onClick={() => router.push(`/employees/new?unit_id=${params.id}`)} type="button">
                  Add employee
                </button>
              )}
            </div>
          </div>
          <div className="overflow-auto">
            <table className="data-table">
              <thead>
                <tr>
                  {canEmp && (
                    <th className="w-10">
                      <input
                        type="checkbox"
                        checked={allPeopleSelected}
                        onChange={() => setSelectedPeople(allPeopleSelected ? [] : people.map((row) => row.id))}
                        aria-label="Select all employees"
                      />
                    </th>
                  )}
                  <th>Name</th>
                  <th>Birthday</th>
                  <th>Position</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {people.map((row) => (
                  <tr key={row.id} className="cursor-pointer hover:bg-brass/[0.06]" onClick={() => router.push(`/employees/${row.id}`)}>
                    {canEmp && (
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedPeople.includes(row.id)}
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedPeople((current) =>
                              current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id],
                            );
                          }}
                          onChange={() => undefined}
                          aria-label={`Select ${row.full_name}`}
                        />
                      </td>
                    )}
                    <td>{row.full_name}</td>
                    <td>{row.birth_date || "–"}</td>
                    <td>
                      <div>{row.position?.name || "–"}</div>
                      {row.subtitle && <div className="text-xs text-ink/60">{row.subtitle}</div>}
                    </td>
                    <td className="capitalize">{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!people.length && <Empty>No employees in this unit.</Empty>}
          </div>
        </section>
      )}
    </div>
  );
}
