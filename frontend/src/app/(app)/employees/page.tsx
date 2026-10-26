"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ListToolbar, useListControls } from "@/components/list-tools";
import { Banner, Empty, PageHeader } from "@/components/ui";
import { EmployeeCard } from "@/components/employee-card";
import { ExportButtons } from "@/components/report";
import { Thumb } from "@/components/image-field";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { useText } from "@/lib/i18n";
import { Page, Row } from "@/lib/types";
import { useMediaQuery, WIDE_SCREEN } from "@/lib/use-media-query";

type Filters = {
  q: string;
  unit_id: string;
  department_id: string;
  position_id: string;
  status: string;
  gender: string;
  hired_from: string;
  hired_to: string;
};

const defaultFilters: Filters = {
  q: "",
  unit_id: "",
  department_id: "",
  position_id: "",
  status: "active",
  gender: "",
  hired_from: "",
  hired_to: "",
};

const noColumnFields: { key: string; label: string; value: (row: Row) => string }[] = [];

type Selection = { kind: "employee"; id: number } | { kind: "new" } | null;

function detailHref(next: NonNullable<Selection>, unitId: string) {
  if (next.kind === "employee") return `/employees/${next.id}`;
  return unitId ? `/employees/new?unit_id=${unitId}` : "/employees/new";
}

export default function EmployeesPage() {
  const { t } = useText();
  const { has, options, refresh } = useSession();
  const router = useRouter();
  const wide = useMediaQuery(WIDE_SCREEN);
  const canWrite = has("employees.write");
  const [rows, setRows] = useState<Row[]>([]);
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [selected, setSelected] = useState<number[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [cardVersion, setCardVersion] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const markDirty = useCallback((value: boolean) => {
    setDirty((prev) => (prev === value ? prev : value));
  }, []);

  function choose(next: Selection) {
    // On narrow screens there is no room for a side panel; open the full page instead.
    if (next && wide === false) {
      router.push(detailHref(next, filters.unit_id));
      return;
    }
    if (JSON.stringify(selection) === JSON.stringify(next)) return;
    if (dirty && !confirm(t("unsaved.body"))) return;
    setDirty(false);
    setSelection(next);
  }

  // If the window shrinks while a card is open, move it to the full page unless there is unsaved work.
  useEffect(() => {
    if (wide !== false || !selection || dirty) return;
    router.push(detailHref(selection, filters.unit_id));
    setSelection(null);
  }, [wide]);

  const departments = filters.unit_id ? options.departments.filter((item) => String(item.unit_id) === filters.unit_id) : options.departments;
  const hasCustomFilters = (Object.keys(defaultFilters) as (keyof Filters)[]).some((key) => filters[key] !== defaultFilters[key]);

  async function reload(next = filters) {
    const params = new URLSearchParams();
    (Object.keys(next) as (keyof Filters)[]).forEach((key) => {
      const value = next[key].trim();
      if (value) params.set(key, value);
    });
    const page = await api<Page<Row>>(`/employees?${params.toString()}`);
    setRows(page.items);
    setSelected((current) => current.filter((id) => page.items.some((row) => row.id === id)));
  }

  function load(next = filters) {
    setError(null);
    reload(next).catch((err) => setError(err instanceof ApiError ? err.message : t("employees.loadFailed")));
  }

  useEffect(() => {
    load();
  }, []);

  function update(patch: Partial<Filters>) {
    setFilters((current) => ({ ...current, ...patch }));
  }

  function changeUnit(unit_id: string) {
    const keep = !unit_id || options.departments.some((item) => String(item.id) === filters.department_id && String(item.unit_id) === unit_id);
    update({ unit_id, department_id: keep ? filters.department_id : "" });
  }

  function clearFilters() {
    setFilters(defaultFilters);
    load(defaultFilters);
  }

  const list = useListControls(rows, noColumnFields);
  const visible = list.pageRows;
  const allSelected = visible.length > 0 && visible.every((row) => selected.includes(row.id));

  async function bulkMarkLeft() {
    if (!selected.length) return;
    if (!confirm(`Mark ${selected.length} employee${selected.length === 1 ? "" : "s"} as left?`)) return;
    setBusy(true);
    setError(null);
    try {
      for (const id of selected) await api(`/employees/${id}`, { method: "PATCH", body: JSON.stringify({ status: "left" }) });
      await reload();
      setCardVersion((current) => current + 1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Employees"
        eyebrow="Employment"
        action={
          <div className="flex flex-wrap gap-2">
            <ExportButtons
              filename="employees"
              title="Employees"
              subtitle="Employment"
              rows={list.filtered}
              columns={[
                { key: "employee_no", label: "Employee number", value: (row) => row.employee_no },
                { key: "full_name", label: "Full name" },
                { key: "birth_date", label: "Birth date", value: (row) => row.birth_date || "" },
                { key: "unit", label: "Unit", value: (row) => row.unit?.name || "" },
                { key: "department", label: "Department", value: (row) => row.department?.name || "" },
                { key: "position", label: "Position", value: (row) => row.position?.name || "" },
                { key: "hire_date", label: "Hire date", value: (row) => row.hire_date || "" },
                { key: "status", label: "Status" },
              ]}
            />
            {canWrite && selected.length > 0 && (
              <button className="btn-ghost text-clay" disabled={busy} onClick={bulkMarkLeft} type="button">
                {t("employees.markLeft")} ({selected.length})
              </button>
            )}
            {canWrite ? (
              <button className="btn-primary" onClick={() => choose({ kind: "new" })} type="button">
                {t("common.add")}
              </button>
            ) : null}
          </div>
        }
      />
      <p className="mb-2 text-xs text-ink/55">{t("employees.openHint")}</p>
      {error && <Banner>{error}</Banner>}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          load();
        }}
      >
        <ListToolbar
          fields={noColumnFields}
          controls={list}
          columnFilters={false}
          leading={
            <>
              <input className="field h-8 w-40 shrink-0 px-2 py-0 text-xs" placeholder={t("employees.searchHint")} value={filters.q} onChange={(event) => update({ q: event.target.value })} aria-label={t("common.search")} />
              <select className="field h-8 w-auto shrink-0 px-2 py-0 text-xs" value={filters.unit_id} onChange={(event) => changeUnit(event.target.value)} aria-label={t("common.unit")}>
                <option value="">{t("employees.allUnits")}</option>
                {options.units.map((unit) => (
                  <option key={unit.id} value={unit.id}>{unit.name}</option>
                ))}
              </select>
              <select className="field h-8 w-auto shrink-0 px-2 py-0 text-xs" value={filters.department_id} onChange={(event) => update({ department_id: event.target.value })} aria-label={t("common.department")}>
                <option value="">{t("employees.allDepartments")}</option>
                {departments.map((item) => (
                  <option key={item.id} value={item.id}>{filters.unit_id ? item.name : `${item.name} · ${item.unit_name ?? ""}`}</option>
                ))}
              </select>
              <select className="field h-8 w-auto shrink-0 px-2 py-0 text-xs" value={filters.position_id} onChange={(event) => update({ position_id: event.target.value })} aria-label={t("common.position")}>
                <option value="">{t("employees.allPositions")}</option>
                {options.positions.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
              <select className="field h-8 w-auto shrink-0 px-2 py-0 text-xs" value={filters.gender} onChange={(event) => update({ gender: event.target.value })} aria-label={t("employees.gender")}>
                <option value="">{t("employees.anyGender")}</option>
                <option value="female">{t("employees.female")}</option>
                <option value="male">{t("employees.male")}</option>
              </select>
              <select className="field h-8 w-auto shrink-0 px-2 py-0 text-xs" value={filters.status} onChange={(event) => update({ status: event.target.value })} aria-label={t("common.status")}>
                <option value="">{t("employees.anyStatus")}</option>
                <option value="active">{t("common.active")}</option>
                <option value="left">{t("employees.left")}</option>
                <option value="suspended">{t("employees.suspended")}</option>
              </select>
              <input className="field h-8 w-auto shrink-0 px-2 py-0 text-xs" type="date" aria-label={t("employees.hiredFrom")} value={filters.hired_from} max={filters.hired_to || undefined} onChange={(event) => update({ hired_from: event.target.value })} />
              <input className="field h-8 w-auto shrink-0 px-2 py-0 text-xs" type="date" aria-label={t("employees.hiredTo")} value={filters.hired_to} min={filters.hired_from || undefined} onChange={(event) => update({ hired_to: event.target.value })} />
              <button className="btn-ghost shrink-0 px-2 py-1 text-xs" type="submit">{t("common.search")}</button>
              {hasCustomFilters && (
                <button className="btn-ghost shrink-0 px-2 py-1 text-xs" type="button" onClick={clearFilters}>{t("employees.clearFilters")}</button>
              )}
            </>
          }
        />
      </form>
      <div className={`grid items-start gap-4 ${selection ? "xl:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)]" : ""}`}>
        <div className="card min-w-0 overflow-auto">
          <table className="data-table">
            <thead>
              <tr>
                {canWrite && (
                  <th className="w-10">
                    <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? [] : visible.map((row) => row.id))} aria-label={t("common.selectAll")} />
                  </th>
                )}
                <th></th>
                <th>{t("common.name")}</th>
                <th>{t("employees.birthday")}</th>
                <th>{t("common.unit")}</th>
                <th>{t("common.department")}</th>
                <th>{t("common.position")}</th>
                <th>{t("employees.hireDate")}</th>
                <th>{t("common.status")}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const active = selection?.kind === "employee" && selection.id === row.id;
                return (
                  <tr
                    key={row.id}
                    className={`cursor-pointer ${active ? "bg-brass/15" : "hover:bg-brass/[0.06]"}`}
                    aria-selected={active}
                    onClick={() => choose({ kind: "employee", id: row.id })}
                  >
                    {canWrite && (
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.includes(row.id)}
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelected((current) => (current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id]));
                          }}
                          onChange={() => undefined}
                          aria-label={`Select ${row.full_name}`}
                        />
                      </td>
                    )}
                    <td>
                      <Thumb src={row.image_url} alt={row.full_name} />
                    </td>
                    <td>{row.full_name}</td>
                    <td>{row.birth_date || "–"}</td>
                    <td>{row.unit?.name}</td>
                    <td>{row.department?.name || "–"}</td>
                    <td>
                      <div>{row.position?.name || "–"}</div>
                      {row.subtitle && <div className="text-xs text-ink/60">{row.subtitle}</div>}
                    </td>
                    <td>{row.hire_date || "–"}</td>
                    <td>{row.status === "active" ? t("common.active") : row.status === "left" ? t("employees.left") : row.status === "suspended" ? t("employees.suspended") : row.status}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!list.filtered.length && <Empty>{t("employees.noMatch")}</Empty>}
        </div>
        {selection && (
          <aside className="card min-w-0 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-auto">
            <EmployeeCard
              key={selection.kind === "employee" ? `emp-${selection.id}-${cardVersion}` : "new"}
              employeeId={selection.kind === "employee" ? selection.id : null}
              initialUnitId={filters.unit_id}
              canWrite={canWrite}
              variant="panel"
              onDirty={markDirty}
              onClose={() => {
                setDirty(false);
                setSelection(null);
              }}
              onSaved={async (row, created) => {
                setDirty(false);
                await reload();
                await refresh();
                if (created) setSelection({ kind: "employee", id: row.id });
              }}
            />
          </aside>
        )}
      </div>
    </div>
  );
}
