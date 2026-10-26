"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, X } from "lucide-react";
import { Banner, DetailHeader, Field, Loading } from "@/components/ui";
import { ImageField } from "@/components/image-field";
import { useToast } from "@/components/toast";
import { isDirty, snapshot, UnsavedDialog } from "@/components/unsaved";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { todayInput } from "@/lib/format";
import { useText } from "@/lib/i18n";
import { Row } from "@/lib/types";

type EmployeeForm = {
  full_name: string;
  gender: string;
  birth_date: string;
  hire_date: string;
  phone: string;
  email: string;
  status: string;
  unit_id: string;
  department_id: string;
  position_id: string;
  subtitle: string;
  user_id: string;
  image_url: string;
};

const blank = (): EmployeeForm => ({
  full_name: "",
  gender: "",
  birth_date: "",
  hire_date: todayInput(),
  phone: "",
  email: "",
  status: "active",
  unit_id: "",
  department_id: "",
  position_id: "",
  subtitle: "",
  user_id: "",
  image_url: "",
});

function fromRow(row: Row): EmployeeForm {
  return {
    full_name: row.full_name || "",
    gender: row.gender || "",
    birth_date: row.birth_date || "",
    hire_date: row.hire_date || todayInput(),
    phone: row.phone || "",
    email: row.email || "",
    status: row.status || "active",
    unit_id: row.unit_id ? String(row.unit_id) : "",
    department_id: row.department_id ? String(row.department_id) : "",
    position_id: row.position_id ? String(row.position_id) : "",
    subtitle: row.subtitle || "",
    user_id: row.user_id ? String(row.user_id) : "",
    image_url: row.image_url || "",
  };
}

export function EmployeeCard({
  employeeId,
  initialUnitId = "",
  canWrite,
  variant,
  onClose,
  onSaved,
  onDirty,
}: {
  /** `null` creates a new employee. */
  employeeId: number | null;
  initialUnitId?: string;
  canWrite: boolean;
  /** `page` renders a full-width card with a back header; `panel` renders compactly for a side panel. */
  variant: "page" | "panel";
  onClose: () => void;
  onSaved: (row: Row, created: boolean) => void | Promise<void>;
  onDirty?: (dirty: boolean) => void;
}) {
  const { t } = useText();
  const toast = useToast();
  const { options } = useSession();
  const isNew = employeeId === null;

  const [form, setForm] = useState<EmployeeForm>(() => ({ ...blank(), unit_id: initialUnitId }));
  const [baseline, setBaseline] = useState(() => snapshot({ ...blank(), unit_id: initialUnitId }));
  const [record, setRecord] = useState<Row | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const dirty = canWrite && isDirty(form, baseline);

  useEffect(() => {
    onDirty?.(dirty);
    return () => onDirty?.(false);
  }, [dirty, onDirty]);

  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api<Row>(`/employees/${employeeId}`)
      .then((row) => {
        if (cancelled) return;
        const next = fromRow(row);
        setRecord(row);
        setForm(next);
        setBaseline(snapshot(next));
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : t("employees.loadOneFailed"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [employeeId, isNew, t]);

  const departments = options.departments.filter((item) => !form.unit_id || String(item.unit_id) === form.unit_id);

  function changeUnit(unit_id: string) {
    const keep = options.departments.some((item) => String(item.id) === form.department_id && String(item.unit_id) === unit_id);
    setForm({ ...form, unit_id, department_id: keep ? form.department_id : "" });
  }

  async function persist() {
    const body = {
      full_name: form.full_name.trim(),
      gender: form.gender || null,
      birth_date: form.birth_date || null,
      hire_date: form.hire_date,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      status: form.status,
      unit_id: Number(form.unit_id),
      department_id: form.department_id ? Number(form.department_id) : null,
      position_id: form.position_id ? Number(form.position_id) : null,
      subtitle: form.subtitle.trim() || null,
      user_id: form.user_id ? Number(form.user_id) : null,
      image_url: form.image_url.trim() || null,
    };
    const saved = isNew
      ? await api<Row>("/employees", { method: "POST", body: JSON.stringify(body) })
      : await api<Row>(`/employees/${employeeId}`, { method: "PATCH", body: JSON.stringify(body) });
    const next = fromRow(saved);
    setRecord(saved);
    setForm(next);
    setBaseline(snapshot(next));
    toast.success(t("common.saved"));
    await onSaved(saved, isNew);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canWrite) return;
    setSaving(true);
    setError(null);
    try {
      await persist();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  function requestClose() {
    if (!dirty) {
      onClose();
      return;
    }
    setLeaveOpen(true);
  }

  async function saveAndClose() {
    setSaving(true);
    setError(null);
    try {
      await persist();
      setLeaveOpen(false);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.saveFailed"));
      setLeaveOpen(false);
    } finally {
      setSaving(false);
    }
  }

  const title = isNew ? t("employees.new") : record?.full_name || form.full_name || t("common.employee");
  const statusLabel =
    form.status === "active" ? t("common.active") : form.status === "left" ? t("employees.left") : form.status === "suspended" ? t("employees.suspended") : form.status;

  const fields = (
    <>
      <div className="sm:col-span-2">
        <Field label="Image">
          <ImageField value={form.image_url} disabled={!canWrite} onChange={(url) => setForm({ ...form, image_url: url })} />
        </Field>
      </div>
      <Field label="Full name">
        <input className="field" value={form.full_name} disabled={!canWrite} onChange={(event) => setForm({ ...form, full_name: event.target.value })} required />
      </Field>
      <Field label="Gender">
        <select className="field" value={form.gender} disabled={!canWrite} onChange={(event) => setForm({ ...form, gender: event.target.value })}>
          <option value="">{t("employees.unspecified")}</option>
          <option value="female">{t("employees.female")}</option>
          <option value="male">{t("employees.male")}</option>
        </select>
      </Field>
      <Field label="Status">
        <select className="field" value={form.status} disabled={!canWrite} onChange={(event) => setForm({ ...form, status: event.target.value })}>
          <option value="active">{t("common.active")}</option>
          <option value="suspended">{t("employees.suspended")}</option>
          <option value="left">{t("employees.left")}</option>
        </select>
      </Field>
      <Field label="Birthday">
        <input className="field" type="date" value={form.birth_date} disabled={!canWrite} onChange={(event) => setForm({ ...form, birth_date: event.target.value })} />
      </Field>
      <Field label="Hire date">
        <input className="field" type="date" value={form.hire_date} disabled={!canWrite} onChange={(event) => setForm({ ...form, hire_date: event.target.value })} required />
      </Field>
      <Field label="Unit">
        <select className="field" value={form.unit_id} disabled={!canWrite} onChange={(event) => changeUnit(event.target.value)} required>
          <option value="">{t("common.select")}</option>
          {options.units.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Department">
        <select className="field" value={form.department_id} disabled={!canWrite} onChange={(event) => setForm({ ...form, department_id: event.target.value })}>
          <option value="">{t("employees.noDepartment")}</option>
          {departments.map((item) => (
            <option key={item.id} value={item.id}>
              {form.unit_id ? item.name : `${item.name} · ${item.unit_name ?? ""}`}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Position">
        <select className="field" value={form.position_id} disabled={!canWrite} onChange={(event) => setForm({ ...form, position_id: event.target.value })}>
          <option value="">{t("common.none")}</option>
          {options.positions.map((position) => (
            <option key={position.id} value={position.id}>
              {position.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Subtitle">
        <input
          className="field"
          value={form.subtitle}
          disabled={!canWrite}
          maxLength={120}
          placeholder={t("employees.subtitleHint")}
          onChange={(event) => setForm({ ...form, subtitle: event.target.value })}
        />
      </Field>
      <Field label="Linked account">
        <select className="field" value={form.user_id} disabled={!canWrite} onChange={(event) => setForm({ ...form, user_id: event.target.value })}>
          <option value="">{t("common.none")}</option>
          {options.people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.full_name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Phone">
        <input className="field" value={form.phone} disabled={!canWrite} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
      </Field>
      <Field label="Email">
        <input className="field" value={form.email} disabled={!canWrite} onChange={(event) => setForm({ ...form, email: event.target.value })} />
      </Field>
      {canWrite && (
        <div className="sm:col-span-2 flex justify-end gap-2 border-t border-line pt-4">
          <button className="btn-ghost" type="button" onClick={requestClose}>
            {t("common.cancel")}
          </button>
          <button className="btn-primary" disabled={saving} type="submit">
            {saving ? t("common.saving") : t("common.save")}
          </button>
        </div>
      )}
    </>
  );

  const dialog = (
    <UnsavedDialog
      open={leaveOpen}
      saving={saving}
      onStay={() => setLeaveOpen(false)}
      onLeave={() => {
        setLeaveOpen(false);
        onClose();
      }}
      onSave={saveAndClose}
    />
  );

  if (variant === "page") {
    return (
      <div>
        <DetailHeader backHref="/employees" backLabel="Employees" title={title} onBack={requestClose} />
        {error && <Banner>{error}</Banner>}
        {loading ? (
          <Loading />
        ) : (
          <form className="card grid max-w-3xl gap-4 p-5 sm:grid-cols-2" onSubmit={save}>
            {fields}
          </form>
        )}
        {dialog}
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.16em] text-brass">{t("common.employee")}</div>
          <h2 className="truncate font-serif text-2xl tracking-tight">{title}</h2>
          {!isNew && record && (
            <p className="mt-1 text-sm text-ink/55">
              {record.employee_no} · {statusLabel}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!isNew && (
            <Link className="grid h-8 w-8 place-items-center rounded-md text-ink/50 hover:bg-bone hover:text-ink" href={`/employees/${employeeId}`} title={t("employees.openPage")} aria-label={t("employees.openPage")}>
              <ExternalLink size={16} />
            </Link>
          )}
          <button className="grid h-8 w-8 place-items-center rounded-md text-ink/50 hover:bg-bone hover:text-ink" type="button" onClick={requestClose} aria-label={t("common.close")}>
            <X size={16} />
          </button>
        </div>
      </div>
      {error && <Banner>{error}</Banner>}
      {loading ? (
        <Loading label={t("employees.loadingOne")} />
      ) : (
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={save}>
          {fields}
        </form>
      )}
      {dialog}
    </div>
  );
}
