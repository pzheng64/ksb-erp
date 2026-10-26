"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Building2, ChevronDown, ChevronRight, UserRound, Users } from "lucide-react";
import { Banner, Empty, Field, Loading, PageHeader } from "@/components/ui";
import { ImageField } from "@/components/image-field";
import { useToast } from "@/components/toast";
import { isDirty, snapshot } from "@/components/unsaved";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { todayInput } from "@/lib/format";
import { useText } from "@/lib/i18n";
import { unitKind } from "@/lib/labels";
import { Page, Row } from "@/lib/types";

type UnitRow = {
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
  department_count?: number;
};

type Dept = {
  id: number;
  name: string;
  code: string;
  unit_id: number;
  employee_count: number;
};

type Emp = {
  id: number;
  employee_no: string;
  full_name: string;
  birth_date?: string | null;
  status: string;
  phone?: string | null;
  email?: string | null;
  hire_date?: string | null;
  unit_id: number;
  department_id?: number | null;
  department?: { id: number; name: string } | null;
  position?: { id: number; name: string } | null;
  subtitle?: string | null;
};

type UnitDetail = UnitRow & {
  departments: Dept[];
  employees: Emp[];
  unassigned_count: number;
};

type Selection =
  | { kind: "unit"; id: number }
  | { kind: "department"; id: number; unitId: number }
  | { kind: "employee"; id: number; unitId: number }
  | { kind: "unassigned"; unitId: number }
  | { kind: "new-unit" }
  | { kind: "new-department"; unitId: number }
  | { kind: "new-employee"; unitId: number; departmentId: number | null };

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

const kinds = Object.entries(unitKind).map(([value, label]) => ({ value, label }));
const blankUnit = { name: "", code: "", kind: "shop", parent_id: "", address: "", phone: "", is_active: true };
const blankEmployee = (): EmployeeForm => ({
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

function failMessage(err: unknown, fallback: string) {
  return err instanceof ApiError ? err.message : fallback;
}

function hit(query: string, ...parts: Array<string | null | undefined>) {
  return parts.join(" ").toLowerCase().includes(query);
}

function peopleIn(detail: UnitDetail | undefined, departmentId: number | null) {
  if (!detail) return [];
  return detail.employees
    .filter((emp) => (departmentId == null ? emp.department_id == null : Number(emp.department_id) === departmentId))
    .slice()
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
}

async function fetchUnit(id: number, status: string) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  const qs = params.toString();
  return api<UnitDetail>(`/org/units/${id}${qs ? `?${qs}` : ""}`);
}

function TreeRow({
  depth,
  selected,
  label,
  meta,
  icon,
  open,
  canToggle,
  muted,
  onToggle,
  onSelect,
}: {
  depth: number;
  selected: boolean;
  label: string;
  meta?: string;
  icon: React.ReactNode;
  open?: boolean;
  canToggle: boolean;
  muted?: boolean;
  onToggle: () => void;
  onSelect: () => void;
}) {
  const { text } = useText();
  return (
    <div className="flex items-center gap-0.5" style={{ paddingLeft: depth * 14 }}>
      {canToggle ? (
        <button
          type="button"
          className="grid h-7 w-7 shrink-0 place-items-center rounded text-ink/40 hover:bg-bone hover:text-ink"
          aria-expanded={open}
          aria-label={open ? `Collapse ${label}` : `Expand ${label}`}
          onClick={onToggle}
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
      ) : (
        <span className="h-7 w-7 shrink-0" />
      )}
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? "true" : undefined}
        className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${selected ? "bg-brass/15 ring-1 ring-brass/30" : "hover:bg-bone"} ${muted ? "text-ink/50" : ""}`}
      >
        <span className="shrink-0 text-ink/45">{icon}</span>
        <span className="truncate">{label}</span>
        {meta && <span className="ml-auto shrink-0 pl-2 text-[11px] text-ink/40">{text(meta)}</span>}
      </button>
    </div>
  );
}

function DetailFrame({
  kicker,
  title,
  subtitle,
  action,
  children,
}: {
  kicker: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { text } = useText();
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.16em] text-brass">{text(kicker)}</div>
          <h2 className="font-serif text-2xl tracking-tight">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-ink/55">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Fact({ label, value }: { label: string; value?: string | null }) {
  const { text } = useText();
  return (
    <div>
      <div className="label">{text(label)}</div>
      <div className="text-sm">{value || "–"}</div>
    </div>
  );
}

function UnitPanel({
  creating,
  unit,
  units,
  canOrg,
  canEmp,
  onDirty,
  onSaved,
  onDeleted,
  onCancel,
  onAddDepartment,
  onAddEmployee,
}: {
  creating: boolean;
  unit: UnitDetail | null;
  units: UnitRow[];
  canOrg: boolean;
  canEmp: boolean;
  onDirty: (dirty: boolean) => void;
  onSaved: (id: number) => Promise<void>;
  onDeleted: () => Promise<void>;
  onCancel: () => void;
  onAddDepartment: () => void;
  onAddEmployee: () => void;
}) {
  const { t, text } = useText();
  const toast = useToast();
  const { refresh } = useSession();
  const initial = unit
    ? {
        name: unit.name,
        code: unit.code,
        kind: unit.kind,
        parent_id: unit.parent_id ? String(unit.parent_id) : "",
        address: unit.address || "",
        phone: unit.phone || "",
        is_active: unit.is_active,
      }
    : blankUnit;
  const [form, setForm] = useState(initial);
  const [baseline, setBaseline] = useState(snapshot(initial));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dirty = canOrg && isDirty(form, baseline);

  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);

  function cancel() {
    if (creating) {
      onCancel();
      return;
    }
    setForm(JSON.parse(baseline));
    setError(null);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canOrg) return;
    setSaving(true);
    setError(null);
    const body = {
      name: form.name.trim(),
      code: form.code.trim(),
      kind: form.kind,
      parent_id: form.parent_id ? Number(form.parent_id) : null,
      address: form.address.trim() || null,
      phone: form.phone.trim() || null,
      is_active: form.is_active,
    };
    try {
      const saved = creating
        ? await api<UnitRow>("/org/units", { method: "POST", body: JSON.stringify(body) })
        : await api<UnitRow>(`/org/units/${unit?.id}`, { method: "PATCH", body: JSON.stringify(body) });
      setBaseline(snapshot(form));
      onDirty(false);
      await refresh();
      toast.success("Saved");
      await onSaved(saved.id);
    } catch (err) {
      setError(failMessage(err, "Could not save unit"));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!unit) return;
    if (!confirm(`Delete ${unit.name}?`)) return;
    setError(null);
    try {
      await api(`/org/units/${unit.id}`, { method: "DELETE" });
      await refresh();
      toast.success("Deleted");
      await onDeleted();
    } catch (err) {
      setError(failMessage(err, "Could not delete unit"));
    }
  }

  const title = creating ? "New unit" : unit?.name || "Unit";
  const subtitle = unit ? `${text(unitKind[unit.kind] || unit.kind)} · ${unit.code} · ${unit.employee_count ?? 0} ${t("units.people")} · ${unit.department_count ?? 0} ${t("units.depts")}` : t("units.blurb");

  return (
    <DetailFrame
      kicker="Unit"
      title={title}
      subtitle={subtitle}
      action={
        !creating && unit ? (
          <div className="flex flex-wrap gap-2">
            {canOrg && (
              <button className="btn-ghost" type="button" onClick={onAddDepartment}>
                Add department
              </button>
            )}
            {canEmp && (
              <button className="btn-primary" type="button" onClick={onAddEmployee}>
                Add employee
              </button>
            )}
          </div>
        ) : null
      }
    >
      {error && <Banner>{error}</Banner>}
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={save}>
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
                {text(kind.label)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Parent">
          <select className="field" value={form.parent_id} disabled={!canOrg} onChange={(event) => setForm({ ...form, parent_id: event.target.value })}>
            <option value="">{t("common.none")}</option>
            {units
              .filter((item) => creating || item.id !== unit?.id)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
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
            {!creating && (
              <button className="btn-ghost mr-auto text-clay" type="button" onClick={remove}>
                Delete
              </button>
            )}
            <button className="btn-ghost" type="button" onClick={cancel}>
              Cancel
            </button>
            <button className="btn-primary" disabled={saving} type="submit">
              {saving ? "Saving" : "Save"}
            </button>
          </div>
        )}
      </form>
    </DetailFrame>
  );
}

function DepartmentPanel({
  creating,
  unitId,
  department,
  units,
  canOrg,
  canEmp,
  onDirty,
  onSaved,
  onDeleted,
  onCancel,
  onAddEmployee,
}: {
  creating: boolean;
  unitId: number;
  department: Dept | null;
  units: UnitRow[];
  canOrg: boolean;
  canEmp: boolean;
  onDirty: (dirty: boolean) => void;
  onSaved: (id: number, unitId: number) => Promise<void>;
  onDeleted: () => Promise<void>;
  onCancel: () => void;
  onAddEmployee: () => void;
}) {
  const toast = useToast();
  const { refresh } = useSession();
  const initial = {
    name: department?.name || "",
    code: department?.code || "",
    unit_id: String(department?.unit_id || unitId),
  };
  const [form, setForm] = useState(initial);
  const [baseline, setBaseline] = useState(snapshot(initial));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dirty = canOrg && isDirty(form, baseline);
  const unitName = units.find((item) => item.id === (department?.unit_id || unitId))?.name;

  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);

  function cancel() {
    if (creating) {
      onCancel();
      return;
    }
    setForm(JSON.parse(baseline));
    setError(null);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canOrg) return;
    setSaving(true);
    setError(null);
    const body = { name: form.name.trim(), code: form.code.trim(), unit_id: Number(form.unit_id) };
    try {
      const saved = creating
        ? await api<Dept>("/org/departments", { method: "POST", body: JSON.stringify(body) })
        : await api<Dept>(`/org/departments/${department?.id}`, { method: "PATCH", body: JSON.stringify(body) });
      setBaseline(snapshot(form));
      onDirty(false);
      await refresh();
      toast.success("Saved");
      await onSaved(saved.id, saved.unit_id);
    } catch (err) {
      setError(failMessage(err, "Could not save department"));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!department) return;
    if (!confirm(`Delete ${department.name}?`)) return;
    setError(null);
    try {
      await api(`/org/departments/${department.id}`, { method: "DELETE" });
      await refresh();
      toast.success("Deleted");
      await onDeleted();
    } catch (err) {
      setError(failMessage(err, "Could not delete department"));
    }
  }

  return (
    <DetailFrame
      kicker="Department"
      title={creating ? "New department" : department?.name || "Department"}
      subtitle={creating ? unitName : department ? `${department.code} · ${unitName || "Unit"} · ${department.employee_count} people` : undefined}
      action={
        !creating && canEmp ? (
          <button className="btn-primary" type="button" onClick={onAddEmployee}>
            Add employee
          </button>
        ) : null
      }
    >
      {error && <Banner>{error}</Banner>}
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={save}>
        <Field label="Name">
          <input className="field" value={form.name} disabled={!canOrg} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
        </Field>
        <Field label="Code">
          <input className="field" value={form.code} disabled={!canOrg} onChange={(event) => setForm({ ...form, code: event.target.value })} required />
        </Field>
        <Field label="Unit">
          <select className="field" value={form.unit_id} disabled={!canOrg} onChange={(event) => setForm({ ...form, unit_id: event.target.value })} required>
            {units.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>
        {canOrg && (
          <div className="sm:col-span-2 flex justify-end gap-2 border-t border-line pt-4">
            {!creating && (
              <button className="btn-ghost mr-auto text-clay" type="button" onClick={remove}>
                Delete
              </button>
            )}
            <button className="btn-ghost" type="button" onClick={cancel}>
              Cancel
            </button>
            <button className="btn-primary" disabled={saving} type="submit">
              {saving ? "Saving" : "Save"}
            </button>
          </div>
        )}
      </form>
    </DetailFrame>
  );
}

function employeeFromRow(row: Row, fallbackUnit: number, fallbackDepartment: number | null): EmployeeForm {
  return {
    full_name: row.full_name || "",
    gender: row.gender || "",
    birth_date: row.birth_date || "",
    hire_date: row.hire_date || todayInput(),
    phone: row.phone || "",
    email: row.email || "",
    status: row.status || "active",
    unit_id: row.unit_id ? String(row.unit_id) : String(fallbackUnit),
    department_id: row.department_id ? String(row.department_id) : fallbackDepartment ? String(fallbackDepartment) : "",
    position_id: row.position_id ? String(row.position_id) : "",
    subtitle: row.subtitle || "",
    user_id: row.user_id ? String(row.user_id) : "",
    image_url: row.image_url || "",
  };
}

function EmployeePanel({
  creating,
  employeeId,
  unitId,
  departmentId,
  brief,
  details,
  canRead,
  canWrite,
  onDirty,
  onSaved,
  onCancel,
}: {
  creating: boolean;
  employeeId: number | null;
  unitId: number;
  departmentId: number | null;
  brief: Emp | null;
  details: Record<number, UnitDetail>;
  canRead: boolean;
  canWrite: boolean;
  onDirty: (dirty: boolean) => void;
  onSaved: (id: number, unitId: number, departmentId: number | null) => Promise<void>;
  onCancel: () => void;
}) {
  const toast = useToast();
  const { options, refresh } = useSession();
  const seeded = employeeFromRow(
    creating
      ? {}
      : {
          unit_id: unitId,
          department_id: departmentId,
        },
    unitId,
    departmentId,
  );
  const [form, setForm] = useState<EmployeeForm>(creating ? { ...seeded, unit_id: String(unitId), department_id: departmentId ? String(departmentId) : "" } : seeded);
  const [baseline, setBaseline] = useState(snapshot(form));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!creating && canRead);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(creating || !canRead);
  const dirty = canWrite && loaded && isDirty(form, baseline);

  useEffect(() => {
    onDirty(dirty);
    return () => onDirty(false);
  }, [dirty, onDirty]);

  function cancel() {
    if (creating) {
      onCancel();
      return;
    }
    setForm(JSON.parse(baseline));
    setError(null);
  }

  useEffect(() => {
    if (creating || !canRead || !employeeId) return;
    let cancelled = false;
    api<Row>(`/employees/${employeeId}`)
      .then((row) => {
        if (cancelled) return;
        const next = employeeFromRow(row, unitId, departmentId);
        setForm(next);
        setBaseline(snapshot(next));
        setLoaded(true);
      })
      .catch((err) => {
        if (!cancelled) setError(failMessage(err, "Could not load employee"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [creating, canRead, employeeId, unitId, departmentId]);

  function departmentsFor(nextUnitId: string) {
    const id = Number(nextUnitId);
    return details[id]?.departments || options.departments.filter((item) => item.unit_id === id);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!canWrite) return;
    setSaving(true);
    setError(null);
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
    try {
      const saved = creating
        ? await api<Row>("/employees", { method: "POST", body: JSON.stringify(body) })
        : await api<Row>(`/employees/${employeeId}`, { method: "PATCH", body: JSON.stringify(body) });
      const next = employeeFromRow(saved, body.unit_id, body.department_id);
      setForm(next);
      setBaseline(snapshot(next));
      onDirty(false);
      await refresh();
      toast.success("Saved");
      await onSaved(saved.id, saved.unit_id, saved.department_id ?? null);
    } catch (err) {
      setError(failMessage(err, "Could not save employee"));
    } finally {
      setSaving(false);
    }
  }

  if (!creating && !canRead && brief) {
    return (
      <DetailFrame kicker="Employee" title={brief.full_name} subtitle={`${brief.employee_no} · ${brief.status}`}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Fact label="Employee number" value={brief.employee_no} />
          <Fact label="Status" value={brief.status} />
          <Fact label="Birthday" value={brief.birth_date} />
          <Fact label="Hire date" value={brief.hire_date} />
          <Fact label="Phone" value={brief.phone} />
          <Fact label="Email" value={brief.email} />
          <Fact label="Department" value={brief.department?.name} />
          <Fact label="Position" value={brief.position?.name} />
          <Fact label="Subtitle" value={brief.subtitle} />
        </div>
      </DetailFrame>
    );
  }

  if (loading) return <Loading label="Loading employee" />;

  return (
    <DetailFrame
      kicker="Employee"
      title={creating ? "New employee" : form.full_name || brief?.full_name || "Employee"}
      subtitle={creating ? undefined : brief ? `${brief.employee_no} · ${form.status}` : form.status}
    >
      {error && <Banner>{error}</Banner>}
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={save}>
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
            <option value="">Unspecified</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
          </select>
        </Field>
        <Field label="Status">
          <select className="field" value={form.status} disabled={!canWrite} onChange={(event) => setForm({ ...form, status: event.target.value })}>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="left">Left</option>
          </select>
        </Field>
        <Field label="Birthday">
          <input className="field" type="date" value={form.birth_date} disabled={!canWrite} onChange={(event) => setForm({ ...form, birth_date: event.target.value })} />
        </Field>
        <Field label="Hire date">
          <input className="field" type="date" value={form.hire_date} disabled={!canWrite} onChange={(event) => setForm({ ...form, hire_date: event.target.value })} required />
        </Field>
        <Field label="Unit">
          <select
            className="field"
            value={form.unit_id}
            disabled={!canWrite}
            onChange={(event) => {
              const nextUnit = event.target.value;
              const keep = departmentsFor(nextUnit).some((item) => String(item.id) === form.department_id);
              setForm({ ...form, unit_id: nextUnit, department_id: keep ? form.department_id : "" });
            }}
            required
          >
            <option value="">Select</option>
            {options.units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Department">
          <select className="field" value={form.department_id} disabled={!canWrite} onChange={(event) => setForm({ ...form, department_id: event.target.value })}>
            <option value="">No department</option>
            {departmentsFor(form.unit_id).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Position">
          <select className="field" value={form.position_id} disabled={!canWrite} onChange={(event) => setForm({ ...form, position_id: event.target.value })}>
            <option value="">None</option>
            {options.positions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
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
            placeholder="e.g. Builder, Cook, Architect"
            onChange={(event) => setForm({ ...form, subtitle: event.target.value })}
          />
        </Field>
        <Field label="Linked account">
          <select className="field" value={form.user_id} disabled={!canWrite} onChange={(event) => setForm({ ...form, user_id: event.target.value })}>
            <option value="">None</option>
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
            <button className="btn-ghost" type="button" onClick={cancel}>
              Cancel
            </button>
            <button className="btn-primary" disabled={saving} type="submit">
              {saving ? "Saving" : "Save"}
            </button>
          </div>
        )}
      </form>
    </DetailFrame>
  );
}

export default function UnitsPage() {
  const { t } = useText();
  const { has } = useSession();
  const canOrg = has("org.manage");
  const canEmp = has("employees.write");
  const canReadEmp = has("employees.read") || has("employees.write");
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [details, setDetails] = useState<Record<number, UnitDetail>>({});
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("active");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pinnedClosed, setPinnedClosed] = useState<Set<string>>(new Set());
  const [selection, setSelection] = useState<Selection | null>(null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seeded = useRef(false);

  const markDirty = useCallback((value: boolean) => {
    setDirty((prev) => (prev === value ? prev : value));
  }, []);

  const reload = useCallback(async (nextStatus: string) => {
    const page = await api<Page<UnitRow>>("/org/units");
    const trees = await Promise.all(page.items.map((unit) => fetchUnit(unit.id, nextStatus)));
    const map: Record<number, UnitDetail> = {};
    for (const tree of trees) map[tree.id] = tree;
    setUnits(page.items);
    setDetails(map);
    setExpanded((current) => {
      if (seeded.current) return current;
      seeded.current = true;
      return new Set(page.items.map((unit) => `unit:${unit.id}`));
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    reload(status)
      .catch((err) => {
        if (!cancelled) setError(failMessage(err, "Could not load units"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reload, status]);

  useEffect(() => {
    setPinnedClosed(new Set());
  }, [query]);

  const q = query.trim().toLowerCase();
  const childrenOf = useMemo(() => {
    const ids = new Set(units.map((unit) => unit.id));
    const map = new Map<number | null, UnitRow[]>();
    for (const unit of units) {
      const parent = unit.parent_id && ids.has(unit.parent_id) ? unit.parent_id : null;
      const list = map.get(parent) ?? [];
      list.push(unit);
      map.set(parent, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    return map;
  }, [units]);
  const byId = useMemo(() => new Map(units.map((unit) => [unit.id, unit])), [units]);

  function unitVisible(id: number, seen = new Set<number>()): boolean {
    if (!q) return true;
    if (seen.has(id)) return false;
    seen.add(id);
    const unit = byId.get(id);
    if (!unit) return false;
    if (hit(q, unit.name, unit.code)) return true;
    const detail = details[id];
    if (detail?.departments.some((dept) => hit(q, dept.name, dept.code))) return true;
    if (detail?.employees.some((emp) => hit(q, emp.full_name, emp.employee_no))) return true;
    return (childrenOf.get(id) || []).some((child) => unitVisible(child.id, seen));
  }

  function isOpen(key: string, force: boolean) {
    if (pinnedClosed.has(key)) return false;
    return expanded.has(key) || force;
  }

  function toggle(key: string, force: boolean) {
    if (isOpen(key, force)) {
      setExpanded((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      setPinnedClosed((prev) => new Set(prev).add(key));
      return;
    }
    setPinnedClosed((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    setExpanded((prev) => new Set(prev).add(key));
  }

  function reveal(...keys: string[]) {
    setPinnedClosed((prev) => {
      const next = new Set(prev);
      for (const key of keys) next.delete(key);
      return next;
    });
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const key of keys) next.add(key);
      return next;
    });
  }

  function choose(next: Selection | null) {
    if (JSON.stringify(selection) === JSON.stringify(next)) return true;
    if (dirty && !confirm("Discard unsaved changes?")) return false;
    setDirty(false);
    setSelection(next);
    return true;
  }

  function ancestorKeys(unitId: number) {
    const keys = [`unit:${unitId}`];
    let parent = byId.get(unitId)?.parent_id;
    const guard = new Set<number>([unitId]);
    while (parent && !guard.has(parent)) {
      keys.push(`unit:${parent}`);
      guard.add(parent);
      parent = byId.get(parent)?.parent_id;
    }
    return keys;
  }

  async function refreshTree() {
    await reload(status);
  }

  const selectedDepartment =
    selection?.kind === "department" ? details[selection.unitId]?.departments.find((dept) => dept.id === selection.id) || null : null;
  const selectedEmployee =
    selection?.kind === "employee" ? details[selection.unitId]?.employees.find((emp) => emp.id === selection.id) || null : null;

  function renderEmployees(list: Emp[], unitId: number, depth: number, showAll: boolean) {
    const visible = list.filter((emp) => !q || showAll || hit(q, emp.full_name, emp.employee_no));
    if (!visible.length) {
      return (
        <div className="py-1 text-xs text-ink/40" style={{ paddingLeft: depth * 14 + 40 }}>
          No employees
        </div>
      );
    }
    return visible.map((emp) => (
      <TreeRow
        key={emp.id}
        depth={depth}
        selected={selection?.kind === "employee" && selection.id === emp.id}
        label={emp.full_name}
        meta={emp.status === "left" ? t("employees.left") : emp.status === "suspended" ? t("employees.suspended") : undefined}
        muted={emp.status !== "active"}
        icon={<UserRound size={14} />}
        canToggle={false}
        onToggle={() => undefined}
        onSelect={() => {
          if (!choose({ kind: "employee", id: emp.id, unitId })) return;
          const deptKey = emp.department_id ? `dept:${emp.department_id}` : `none:${unitId}`;
          reveal(...ancestorKeys(unitId), deptKey);
        }}
      />
    ));
  }

  function renderUnit(unit: UnitRow, depth: number): React.ReactNode {
    if (!unitVisible(unit.id)) return null;
    const detail = details[unit.id];
    const childUnits = childrenOf.get(unit.id) || [];
    const unitHit = !q || hit(q, unit.name, unit.code);
    const departments = (detail?.departments || []).filter((dept) => {
      if (!q || unitHit) return true;
      if (hit(q, dept.name, dept.code)) return true;
      return peopleIn(detail, dept.id).some((emp) => hit(q, emp.full_name, emp.employee_no));
    });
    const unassigned = peopleIn(detail, null).filter((emp) => !q || unitHit || hit(q, emp.full_name, emp.employee_no));
    const showUnassigned = unassigned.length > 0;
    const canToggle = departments.length > 0 || childUnits.some((child) => unitVisible(child.id)) || showUnassigned || Boolean(detail && ((detail.departments.length || 0) > 0));
    const force = Boolean(q) && unitVisible(unit.id);
    const open = isOpen(`unit:${unit.id}`, force);
    const selected = selection?.kind === "unit" && selection.id === unit.id;

    return (
      <div key={unit.id}>
        <TreeRow
          depth={depth}
          selected={selected}
          label={unit.name}
          meta={unit.is_active ? unitKind[unit.kind] || unit.kind : "Inactive"}
          icon={<Building2 size={14} />}
          open={open}
          canToggle={canToggle || childUnits.length > 0}
          onToggle={() => toggle(`unit:${unit.id}`, force)}
          onSelect={() => {
            if (!choose({ kind: "unit", id: unit.id })) return;
            reveal(...ancestorKeys(unit.id));
          }}
        />
        {open && (
          <>
            {departments.map((dept) => {
              const people = peopleIn(detail, dept.id);
              const deptHit = !q || unitHit || hit(q, dept.name, dept.code);
              const forceDept = Boolean(q) && (hit(q, dept.name, dept.code) || people.some((emp) => hit(q, emp.full_name, emp.employee_no)));
              const deptOpen = isOpen(`dept:${dept.id}`, forceDept);
              return (
                <div key={dept.id}>
                  <TreeRow
                    depth={depth + 1}
                    selected={selection?.kind === "department" && selection.id === dept.id}
                    label={dept.name}
                    meta={String(dept.employee_count)}
                    icon={<Users size={14} />}
                    open={deptOpen}
                    canToggle
                    onToggle={() => toggle(`dept:${dept.id}`, forceDept)}
                    onSelect={() => {
                      if (!choose({ kind: "department", id: dept.id, unitId: unit.id })) return;
                      reveal(...ancestorKeys(unit.id), `dept:${dept.id}`);
                    }}
                  />
                  {deptOpen && renderEmployees(people, unit.id, depth + 2, deptHit)}
                </div>
              );
            })}
            {showUnassigned && (
              <div>
                <TreeRow
                  depth={depth + 1}
                  selected={selection?.kind === "unassigned" && selection.unitId === unit.id}
                  label="No department"
                  meta={String(unassigned.length)}
                  icon={<Users size={14} />}
                  open={isOpen(`none:${unit.id}`, Boolean(q) && unassigned.some((emp) => hit(q, emp.full_name, emp.employee_no)))}
                  canToggle
                  onToggle={() => toggle(`none:${unit.id}`, Boolean(q) && unassigned.some((emp) => hit(q, emp.full_name, emp.employee_no)))}
                  onSelect={() => {
                    if (!choose({ kind: "unassigned", unitId: unit.id })) return;
                    reveal(...ancestorKeys(unit.id), `none:${unit.id}`);
                  }}
                />
                {isOpen(`none:${unit.id}`, Boolean(q) && unassigned.some((emp) => hit(q, emp.full_name, emp.employee_no))) &&
                  renderEmployees(unassigned, unit.id, depth + 2, !q || unitHit)}
              </div>
            )}
            {childUnits.map((child) => renderUnit(child, depth + 1))}
          </>
        )}
      </div>
    );
  }

  const roots = childrenOf.get(null) || [];
  const anyVisible = roots.some((unit) => unitVisible(unit.id));

  function detail() {
    if (!selection) {
      return (
        <div className="grid min-h-[24rem] place-items-center px-6 text-center text-sm text-ink/50">
          Select a unit, department, or employee to see its details.
        </div>
      );
    }
    if (selection.kind === "unit" || selection.kind === "new-unit") {
      const unit = selection.kind === "unit" ? details[selection.id] || null : null;
      return (
        <UnitPanel
          key={selection.kind === "unit" ? `unit-${selection.id}` : "new-unit"}
          creating={selection.kind === "new-unit"}
          unit={unit}
          units={units}
          canOrg={canOrg}
          canEmp={canEmp}
          onDirty={markDirty}
          onSaved={async (id) => {
            setDirty(false);
            await refreshTree();
            setSelection({ kind: "unit", id });
            reveal(`unit:${id}`);
          }}
          onDeleted={async () => {
            setDirty(false);
            setSelection(null);
            await refreshTree();
          }}
          onCancel={() => {
            setDirty(false);
            setSelection(null);
          }}
          onAddDepartment={() => {
            if (selection.kind !== "unit") return;
            if (!choose({ kind: "new-department", unitId: selection.id })) return;
            reveal(`unit:${selection.id}`);
          }}
          onAddEmployee={() => {
            if (selection.kind !== "unit") return;
            if (!choose({ kind: "new-employee", unitId: selection.id, departmentId: null })) return;
            reveal(`unit:${selection.id}`, `none:${selection.id}`);
          }}
        />
      );
    }
    if (selection.kind === "department" || selection.kind === "new-department") {
      const unitId = selection.unitId;
      return (
        <DepartmentPanel
          key={selection.kind === "department" ? `dept-${selection.id}` : `new-dept-${unitId}`}
          creating={selection.kind === "new-department"}
          unitId={unitId}
          department={selection.kind === "department" ? selectedDepartment : null}
          units={units}
          canOrg={canOrg}
          canEmp={canEmp}
          onDirty={markDirty}
          onSaved={async (id, nextUnitId) => {
            setDirty(false);
            await refreshTree();
            setSelection({ kind: "department", id, unitId: nextUnitId });
            reveal(...ancestorKeys(nextUnitId), `dept:${id}`);
          }}
          onDeleted={async () => {
            setDirty(false);
            setSelection({ kind: "unit", id: unitId });
            await refreshTree();
          }}
          onCancel={() => {
            setDirty(false);
            setSelection({ kind: "unit", id: unitId });
          }}
          onAddEmployee={() => {
            if (selection.kind !== "department") return;
            if (!choose({ kind: "new-employee", unitId, departmentId: selection.id })) return;
            reveal(...ancestorKeys(unitId), `dept:${selection.id}`);
          }}
        />
      );
    }
    if (selection.kind === "unassigned") {
      const unit = details[selection.unitId];
      const count = peopleIn(unit, null).length;
      return (
        <DetailFrame kicker="Department" title="No department" subtitle={`${count} ${count === 1 ? "person" : "people"} in ${unit?.name || "this unit"} ${count === 1 ? "is" : "are"} not assigned to a department.`}>
          <p className="text-sm text-ink/60">Select a person in the tree to see their record. New people added here stay unassigned until you pick a department.</p>
          {canEmp && (
            <button
              className="btn-primary mt-4"
              type="button"
              onClick={() => {
                if (!choose({ kind: "new-employee", unitId: selection.unitId, departmentId: null })) return;
                reveal(...ancestorKeys(selection.unitId), `none:${selection.unitId}`);
              }}
            >
              Add employee
            </button>
          )}
        </DetailFrame>
      );
    }
    const unitId = selection.unitId;
    const departmentId = selection.kind === "new-employee" ? selection.departmentId : selectedEmployee?.department_id ?? null;
    return (
      <EmployeePanel
        key={selection.kind === "employee" ? `emp-${selection.id}` : `new-emp-${unitId}-${departmentId ?? "none"}`}
        creating={selection.kind === "new-employee"}
        employeeId={selection.kind === "employee" ? selection.id : null}
        unitId={unitId}
        departmentId={departmentId}
        brief={selectedEmployee}
        details={details}
        canRead={canReadEmp}
        canWrite={canEmp}
        onDirty={markDirty}
        onSaved={async (id, nextUnitId, nextDepartmentId) => {
          setDirty(false);
          await refreshTree();
          setSelection({ kind: "employee", id, unitId: nextUnitId });
          reveal(...ancestorKeys(nextUnitId), nextDepartmentId ? `dept:${nextDepartmentId}` : `none:${nextUnitId}`);
        }}
        onCancel={() => {
          setDirty(false);
          if (selection.kind !== "new-employee") return;
          if (selection.departmentId) setSelection({ kind: "department", id: selection.departmentId, unitId: selection.unitId });
          else if (peopleIn(details[selection.unitId], null).length) setSelection({ kind: "unassigned", unitId: selection.unitId });
          else setSelection({ kind: "unit", id: selection.unitId });
        }}
      />
    );
  }

  if (loading && !units.length) return <Loading />;

  return (
    <div>
      <PageHeader
        title="Units"
        eyebrow="Organization"
        action={
          canOrg ? (
            <button className="btn-primary" type="button" onClick={() => choose({ kind: "new-unit" })}>
              {t("common.add")}
            </button>
          ) : null
        }
      />
      <p className="mb-2 text-xs text-ink/55">Open a unit to see its departments, then open a department to see its people. Selecting a department or employee shows that record on the right.</p>
      {error && <Banner>{error}</Banner>}
      <div className="grid items-start gap-4 md:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)]">
        <aside className="card overflow-hidden md:sticky md:top-4">
          <div className="space-y-2 border-b border-line p-3">
            <input className="field" placeholder="Filter units, departments, people" value={query} onChange={(event) => setQuery(event.target.value)} />
            <select className="field" aria-label="Employee status" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="active">{t("common.active")}</option>
              <option value="suspended">{t("employees.suspended")}</option>
              <option value="left">{t("employees.left")}</option>
              <option value="">{t("employees.anyStatus")}</option>
            </select>
          </div>
          <div className="max-h-[70vh] overflow-auto p-2 md:max-h-[calc(100vh-12rem)]">
            {roots.map((unit) => renderUnit(unit, 0))}
            {!anyVisible && <Empty>{units.length ? "No matches." : "No units yet."}</Empty>}
          </div>
        </aside>
        <section className="card min-h-[24rem] p-5 md:sticky md:top-4 md:max-h-[calc(100vh-8rem)] md:overflow-auto">{detail()}</section>
      </div>
    </div>
  );
}
