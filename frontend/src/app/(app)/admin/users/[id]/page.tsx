"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Banner, DetailHeader, Field, Loading } from "@/components/ui";
import { useToast } from "@/components/toast";
import { isDirty, snapshot, UnsavedDialog } from "@/components/unsaved";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { Row } from "@/lib/types";

type UserForm = {
  username: string;
  full_name: string;
  email: string;
  password: string;
  phone: string;
  status: string;
  unit_id: string;
  role_ids: number[];
};

const blank: UserForm = {
  username: "",
  full_name: "",
  email: "",
  password: "",
  phone: "",
  status: "active",
  unit_id: "",
  role_ids: [],
};

function sorted(ids: number[]) {
  return [...ids].sort((a, b) => a - b);
}

function toggle(ids: number[], id: number) {
  return sorted(ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]);
}

export default function UserDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { has, options, refresh } = useSession();
  const canWrite = has("users.manage");
  const isNew = params.id === "new";

  const [form, setForm] = useState<UserForm>(blank);
  const [baseline, setBaseline] = useState(snapshot(blank));
  const [recordStatus, setRecordStatus] = useState<string | null>(null);
  const [title, setTitle] = useState(isNew ? "New user" : "User");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [missing, setMissing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const dirty = canWrite && isDirty(form, baseline);
  const approving = !isNew && recordStatus === "pending" && form.status === "active";

  useEffect(() => {
    if (isNew) return;
    api<Row>(`/users/${params.id}`)
      .then((row) => {
        setTitle(row.full_name || "User");
        setRecordStatus(row.status || "pending");
        const next: UserForm = {
          username: row.username || "",
          full_name: row.full_name || "",
          email: row.email || "",
          password: "",
          phone: row.phone || "",
          status: row.status || "pending",
          unit_id: row.unit_id ? String(row.unit_id) : "",
          role_ids: sorted((row.roles || []).map((role: Row) => role.id)),
        };
        setForm(next);
        setBaseline(snapshot(next));
      })
      .catch((err) => {
        setMissing(true);
        setError(err instanceof ApiError ? err.message : "Could not load user");
      })
      .finally(() => setLoading(false));
  }, [isNew, params.id]);

  async function persist() {
    const profile = {
      full_name: form.full_name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || null,
      status: form.status,
      unit_id: form.unit_id ? Number(form.unit_id) : null,
    };
    if (isNew) {
      const created = await api<Row>("/users", {
        method: "POST",
        body: JSON.stringify({
          ...profile,
          username: form.username.trim(),
          password: form.password,
          role_ids: form.role_ids,
        }),
      });
      toast.success("Saved");
      const next = { ...form, password: "" };
      setForm(next);
      setBaseline(snapshot(next));
      await refresh();
      router.replace(`/admin/users/${created.id}`);
      return;
    }
    await api(`/users/${params.id}`, { method: "PATCH", body: JSON.stringify(profile) });
    await api(`/users/${params.id}/roles`, { method: "PUT", body: JSON.stringify({ role_ids: form.role_ids }) });
    if (form.password) {
      await api(`/users/${params.id}/reset-password`, { method: "POST", body: JSON.stringify({ password: form.password }) });
    }
    const next = { ...form, password: "" };
    setForm(next);
    setRecordStatus(form.status);
    setTitle(next.full_name || "User");
    setBaseline(snapshot(next));
    toast.success(approving ? "Approved" : "Saved");
    await refresh();
  }

  async function save(event: FormEvent) {
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
      router.push("/admin/users");
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
      router.push("/admin/users");
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
      <DetailHeader backHref="/admin/users" backLabel="Users" title={title} onBack={requestLeave} />
      {error && <Banner>{error}</Banner>}
      {!missing && (
        <form className="card grid max-w-3xl gap-4 p-5 sm:grid-cols-2" onSubmit={save}>
          <Field label="Username">
            <input
              className="field"
              value={form.username}
              disabled={!canWrite || !isNew}
              onChange={(event) => setForm({ ...form, username: event.target.value })}
              required
              pattern="[A-Za-z0-9._-]{3,64}"
            />
          </Field>
          <Field label="Full name">
            <input className="field" value={form.full_name} disabled={!canWrite} onChange={(event) => setForm({ ...form, full_name: event.target.value })} required />
          </Field>
          <Field label="Email">
            <input className="field" type="email" value={form.email} disabled={!canWrite} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
          </Field>
          <Field label={isNew ? "Password" : "Reset password"}>
            <input
              className="field"
              type="password"
              autoComplete="new-password"
              value={form.password}
              disabled={!canWrite}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              required={isNew}
              minLength={form.password ? 8 : undefined}
              placeholder={isNew ? "" : "Leave blank to keep the current password"}
            />
          </Field>
          <Field label="Phone">
            <input className="field" value={form.phone} disabled={!canWrite} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
          </Field>
          <Field label="Status">
            <select className="field" value={form.status} disabled={!canWrite} onChange={(event) => setForm({ ...form, status: event.target.value })}>
              <option value="pending">Pending</option>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </select>
            {recordStatus === "pending" && <p className="mt-1 text-xs text-ink/50">Set Active and save to approve this registration.</p>}
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
          <div className="sm:col-span-2">
            <div className="label">Roles</div>
            <div className="flex flex-wrap gap-2">
              {options.roles.map((role) => (
                <label key={role.id} className="flex items-center gap-2 rounded-md border border-line px-2 py-1 text-sm">
                  <input
                    type="checkbox"
                    disabled={!canWrite}
                    checked={form.role_ids.includes(role.id)}
                    onChange={() => setForm({ ...form, role_ids: toggle(form.role_ids, role.id) })}
                  />
                  {role.name}
                </label>
              ))}
            </div>
          </div>
          {canWrite && (
            <div className="sm:col-span-2 flex justify-end gap-2 border-t border-line pt-4">
              <button className="btn-ghost" type="button" onClick={requestLeave}>
                Cancel
              </button>
              <button className="btn-primary" disabled={saving} type="submit">
                {saving ? "Saving" : approving ? "Approve" : "Save"}
              </button>
            </div>
          )}
        </form>
      )}
      <UnsavedDialog
        open={leaveOpen}
        saving={saving}
        onStay={() => setLeaveOpen(false)}
        onLeave={() => {
          setLeaveOpen(false);
          router.push("/admin/users");
        }}
        onSave={saveAndLeave}
      />
    </div>
  );
}
