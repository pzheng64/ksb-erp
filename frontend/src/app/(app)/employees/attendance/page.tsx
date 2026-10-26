"use client";

import { useEffect, useMemo, useState } from "react";
import { ListToolbar, useListControls } from "@/components/list-tools";
import { Banner, Empty, Field, Modal, PageHeader } from "@/components/ui";
import { Thumb } from "@/components/image-field";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { clock, todayInput } from "@/lib/format";
import { Term, useText } from "@/lib/i18n";
import { Row } from "@/lib/types";

function timeInputValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const slice = String(value).slice(11, 16);
    return slice.length === 5 && slice[2] === ":" ? slice : "";
  }
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return hours + ":" + minutes;
}

type EditState = { mode: "one" | "bulk"; employeeIds: number[]; clock_in: string; clock_out: string; name?: string };

const BOARD_STATUSES = ["present", "late", "not_in", "leave", "absent"] as const;
type BoardStatus = (typeof BOARD_STATUSES)[number];

const STATUS_EDGE: Record<BoardStatus, string> = {
  present: "border-l-pine",
  late: "border-l-brass",
  not_in: "border-l-ink/25",
  leave: "border-l-tide",
  absent: "border-l-clay",
};

function isRecordedAway(status: string) {
  return status === "leave" || status === "absent";
}

function matchesStatus(status: string, filter: BoardStatus) {
  if (filter === "not_in") return status !== "present" && status !== "late" && !isRecordedAway(status);
  return status === filter;
}

function floorFrom(rows: Row[], unitOrder: { name: string }[]) {
  const counts: Record<BoardStatus, number> = { present: 0, late: 0, not_in: 0, leave: 0, absent: 0 };
  const byUnit = new Map<string, { headcount: number; onSite: number }>();
  const open: Row[] = [];
  for (const row of rows) {
    const status = String(row.status || "not_in");
    if (status === "present" || status === "late" || isRecordedAway(status)) counts[status as BoardStatus] += 1;
    else counts.not_in += 1;
    const name = String(row.unit || "");
    const bucket = byUnit.get(name) ?? { headcount: 0, onSite: 0 };
    bucket.headcount += 1;
    if (status === "present" || status === "late") bucket.onSite += 1;
    byUnit.set(name, bucket);
    if (row.clock_in && !row.clock_out) open.push(row);
  }
  const order = new Map(unitOrder.map((unit, index) => [unit.name, index]));
  const units = [...byUnit.entries()]
    .map(([name, stats]) => ({
      name,
      headcount: stats.headcount,
      onSite: stats.onSite,
      rate: stats.headcount ? stats.onSite / stats.headcount : 0,
    }))
    .sort((a, b) => (order.get(a.name) ?? 999) - (order.get(b.name) ?? 999) || a.name.localeCompare(b.name));
  open.sort((a, b) => String(a.full_name).localeCompare(String(b.full_name)));
  return { counts, units, open };
}

export default function AttendancePage() {
  const { t } = useText();
  const { has, me, options } = useSession();
  const canWrite = has("employees.write");
  const [day, setDay] = useState(todayInput);
  const [unitId, setUnitId] = useState("");
  const [statusFilter, setStatusFilter] = useState<BoardStatus | "">("");
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<EditState | null>(null);

  async function reload(nextDay = day) {
    const params = new URLSearchParams({ work_date: nextDay });
    const result = await api<{ items: Row[] }>("/employees/attendance?" + params.toString());
    setRows(result.items);
    setSelected([]);
  }

  useEffect(() => {
    reload().catch((err) => setError(err instanceof ApiError ? err.message : "Could not load attendance"));
  }, []);

  const selectedUnitName = options.units.find((unit) => String(unit.id) === unitId)?.name ?? "";
  const inUnit = unitId ? rows.filter((row) => row.unit === selectedUnitName) : rows;
  const visible = statusFilter ? inUnit.filter((row) => matchesStatus(String(row.status || "not_in"), statusFilter)) : inUnit;
  const fields = useMemo(
    () => [
      { key: "employee", label: t("common.employee"), value: (row: Row) => String(row.full_name || "–") },
      { key: "unit", label: t("common.unit"), value: (row: Row) => String(row.unit || "–") },
      { key: "in", label: t("attendance.in"), value: (row: Row) => clock(row.clock_in) },
      { key: "out", label: t("attendance.out"), value: (row: Row) => clock(row.clock_out) },
      {
        key: "status",
        label: t("common.status"),
        value: (row: Row) => {
          const key = `attendance.${row.status || "not_in"}`;
          const label = t(key);
          return label === key ? String(row.status || "–") : label;
        },
      },
    ],
    [t],
  );
  const list = useListControls(visible, fields);
  const pageRows = list.pageRows;
  const allSelected = pageRows.length > 0 && pageRows.every((row) => selected.includes(row.employee_id));
  const openDay = day === todayInput();

  function toggleStatus(status: BoardStatus) {
    setStatusFilter((current) => (current === status ? "" : status));
    setSelected([]);
  }

  function applyUnit(next: string) {
    setUnitId(next);
    setSelected([]);
  }

  function pickUnit(name: string) {
    const match = options.units.find((unit) => unit.name === name);
    if (!match) return;
    applyUnit(String(match.id) === unitId ? "" : String(match.id));
  }

  async function punch(employeeId: number) {
    setError(null);
    try {
      await api("/employees/attendance/clock", { method: "POST", body: JSON.stringify({ employee_id: employeeId }) });
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Clock failed");
    }
  }

  async function bulkMark(status: "leave" | "absent") {
    if (!selected.length) return;
    const labelText = status === "leave" ? t("attendance.leave") : t("attendance.absent");
    if (!confirm(t("attendance.bulkMarkConfirm", { count: selected.length, status: labelText, day }))) return;
    setBusy(true);
    setError(null);
    try {
      for (const employeeId of selected) {
        await api("/employees/attendance/mark", {
          method: "POST",
          body: JSON.stringify({ employee_id: employeeId, work_date: day, status }),
        });
      }
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("attendance.markFailed"));
    } finally {
      setBusy(false);
    }
  }

  function openEditOne(row: Row) {
    setEdit({
      mode: "one",
      employeeIds: [row.employee_id],
      clock_in: timeInputValue(row.clock_in),
      clock_out: timeInputValue(row.clock_out),
      name: row.full_name,
    });
  }

  function openEditBulk() {
    if (!selected.length) return;
    setEdit({ mode: "bulk", employeeIds: selected, clock_in: "09:00", clock_out: "17:30" });
  }

  async function saveTimes() {
    if (!edit) return;
    setBusy(true);
    setError(null);
    try {
      if (edit.mode === "one") {
        await api("/employees/attendance/set", {
          method: "POST",
          body: JSON.stringify({
            employee_id: edit.employeeIds[0],
            work_date: day,
            clock_in: edit.clock_in || null,
            clock_out: edit.clock_out || null,
            clear: false,
          }),
        });
      } else {
        await api("/employees/attendance/bulk-set", {
          method: "POST",
          body: JSON.stringify({
            employee_ids: edit.employeeIds,
            work_date: day,
            clock_in: edit.clock_in || null,
            clock_out: edit.clock_out || null,
            clear: false,
          }),
        });
      }
      setEdit(null);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("attendance.saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function revertTimes(employeeIds?: number[]) {
    const ids = employeeIds || edit?.employeeIds || [];
    if (!ids.length) return;
    if (!confirm(t("attendance.revertConfirm", { count: ids.length }))) return;
    setBusy(true);
    setError(null);
    try {
      if (ids.length === 1) {
        await api("/employees/attendance/set", {
          method: "POST",
          body: JSON.stringify({ employee_id: ids[0], work_date: day, clear: true }),
        });
      } else {
        await api("/employees/attendance/bulk-set", {
          method: "POST",
          body: JSON.stringify({ employee_ids: ids, work_date: day, clear: true }),
        });
      }
      setEdit(null);
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("attendance.revertFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Attendance"
        eyebrow="Employment"
        action={
          canWrite && selected.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              <button className="btn-ghost" disabled={busy} onClick={openEditBulk} type="button">
                {t("attendance.editTimes")} ({selected.length})
              </button>
              <button className="btn-ghost" disabled={busy} onClick={() => revertTimes(selected)} type="button">
                {t("attendance.revert")} ({selected.length})
              </button>
              <button className="btn-ghost" disabled={busy} onClick={() => bulkMark("leave")} type="button">
                {t("attendance.leave")} ({selected.length})
              </button>
              <button className="btn-ghost text-clay" disabled={busy} onClick={() => bulkMark("absent")} type="button">
                {t("attendance.absent")} ({selected.length})
              </button>
            </div>
          ) : null
        }
      />
      <p className="mb-2 text-xs text-ink/55">{t("attendance.showHint")}</p>
      {error && <Banner>{error}</Banner>}
      <ListToolbar
        fields={fields}
        controls={list}
        leading={
          <>
            <input className="field h-8 w-auto shrink-0 px-2 py-0 text-xs" type="date" aria-label={t("common.date")} value={day} onChange={(event) => setDay(event.target.value)} />
            {canWrite && (
              <select className="field h-8 w-auto shrink-0 px-2 py-0 text-xs" aria-label={t("common.unit")} value={unitId} onChange={(event) => applyUnit(event.target.value)}>
                <option value="">{t("employees.allUnits")}</option>
                {options.units.map((unit) => (
                  <option key={unit.id} value={unit.id}>{unit.name}</option>
                ))}
              </select>
            )}
            <button className="btn-ghost shrink-0 px-2 py-1 text-xs" type="button" onClick={() => reload()}>{t("common.show")}</button>
          </>
        }
      />
      <div className="card overflow-auto">
        <table className="data-table">
          <thead>
            <tr>
              {canWrite && (
                <th className="w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? [] : pageRows.map((row) => row.employee_id))}
                    aria-label="Select all"
                  />
                </th>
              )}
              <th>{t("common.employee")}</th>
              <th>{t("common.unit")}</th>
              <th>{t("attendance.in")}</th>
              <th>{t("attendance.out")}</th>
              <th>{t("common.status")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => {
              const own = me?.employee?.id === row.employee_id;
              const canPunch = (canWrite || own) && openDay && row.status !== "leave" && row.status !== "absent" && !row.clock_out;
              const hasRecord = Boolean(row.clock_in || row.clock_out || row.status === "leave" || row.status === "absent" || row.status === "open");
              return (
                <tr key={row.employee_id}>
                  {canWrite && (
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.includes(row.employee_id)}
                        onChange={() =>
                          setSelected((current) =>
                            current.includes(row.employee_id)
                              ? current.filter((id) => id !== row.employee_id)
                              : [...current, row.employee_id],
                          )
                        }
                        aria-label={"Select " + row.full_name}
                      />
                    </td>
                  )}
                  <td>
                    <div className="flex items-center gap-3">
                      <Thumb src={row.image_url} alt={row.full_name} />
                      <div>
                        {row.full_name}
                        {row.birth_date ? <div className="text-xs text-ink/40">{row.birth_date}</div> : null}
                      </div>
                    </div>
                  </td>
                  <td>{row.unit}</td>
                  <td>{clock(row.clock_in)}</td>
                  <td>{clock(row.clock_out)}</td>
                  <td>
                    <Term prefix="attendance" value={row.status} />
                  </td>
                  <td className="text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      {canWrite && (
                        <button className="text-sm text-brass" onClick={() => openEditOne(row)} type="button">
                          {t("common.edit")}
                        </button>
                      )}
                      {canWrite && hasRecord && row.status !== "not_in" && (
                        <button className="text-sm text-ink/50 hover:text-clay" disabled={busy} onClick={() => revertTimes([row.employee_id])} type="button">
                          {t("attendance.revert")}
                        </button>
                      )}
                      {canPunch && (
                        <button className="text-sm text-brass" onClick={() => punch(row.employee_id)} type="button">
                          {row.clock_in ? t("attendance.clockOut") : t("attendance.clockIn")}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!list.filtered.length && <Empty>{rows.length ? t("attendance.filterEmpty") : t("attendance.empty")}</Empty>}
      </div>
      {canWrite && rows.length > 0 && (
        <div className="mt-2">
          <FloorBoard
            rows={rows}
            unitOptions={options.units}
            unitId={unitId}
            statusFilter={statusFilter}
            openDay={openDay}
            onStatus={toggleStatus}
            onUnit={pickUnit}
            onAllUnits={() => applyUnit("")}
            onEdit={openEditOne}
          />
        </div>
      )}

      {edit && (
        <Modal title={edit.mode === "bulk" ? t("attendance.bulkEditTimes") : t("attendance.editTimes")} onClose={() => !busy && setEdit(null)}>
          <p className="mb-4 text-sm text-ink/60">
            {edit.mode === "bulk"
              ? t("attendance.bulkEditHint", { count: edit.employeeIds.length, day })
              : t("attendance.editHint", { name: edit.name || "", day })}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("attendance.in")}>
              <input className="field" type="time" value={edit.clock_in} onChange={(event) => setEdit({ ...edit, clock_in: event.target.value })} />
            </Field>
            <Field label={t("attendance.out")}>
              <input className="field" type="time" value={edit.clock_out} onChange={(event) => setEdit({ ...edit, clock_out: event.target.value })} />
            </Field>
          </div>
          <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-line pt-4">
            <button className="btn-ghost text-clay" disabled={busy} onClick={() => revertTimes()} type="button">
              {t("attendance.revert")}
            </button>
            <button className="btn-ghost" disabled={busy} onClick={() => setEdit(null)} type="button">
              {t("common.cancel")}
            </button>
            <button className="btn-primary" disabled={busy} onClick={saveTimes} type="button">
              {busy ? t("common.saving") : t("common.save")}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function FloorBoard({
  rows,
  unitOptions,
  unitId,
  statusFilter,
  openDay,
  onStatus,
  onUnit,
  onAllUnits,
  onEdit,
}: {
  rows: Row[];
  unitOptions: { id: number; name: string }[];
  unitId: string;
  statusFilter: BoardStatus | "";
  openDay: boolean;
  onStatus: (status: BoardStatus) => void;
  onUnit: (name: string) => void;
  onAllUnits: () => void;
  onEdit: (row: Row) => void;
}) {
  const { t } = useText();
  const selectedName = unitOptions.find((unit) => String(unit.id) === unitId)?.name ?? "";
  const scoped = selectedName ? rows.filter((row) => row.unit === selectedName) : rows;
  const { counts, open } = floorFrom(scoped, unitOptions);
  const { units } = floorFrom(rows, unitOptions);

  return (
    <div className="space-y-2">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {BOARD_STATUSES.map((status) => {
          const active = statusFilter === status;
          return (
            <button
              key={status}
              type="button"
              aria-pressed={active}
              onClick={() => onStatus(status)}
              className={`card border-l-4 p-3 text-left ${STATUS_EDGE[status]} ${active ? "ring-2 ring-brass/40" : ""}`}
            >
              <div className="text-[11px] uppercase tracking-[0.16em] text-ink/45">{t(`attendance.${status}`)}</div>
              <div className="mt-1 font-serif text-3xl tracking-tight">{counts[status]}</div>
            </button>
          );
        })}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-4">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h3 className="font-serif text-xl">{t("attendance.byUnit")}</h3>
            <p className="text-xs text-ink/45">{t("attendance.onSite")}</p>
          </div>
          <ul className="space-y-3">
            <li>
              <button
                type="button"
                aria-pressed={!unitId}
                onClick={onAllUnits}
                className={`w-full rounded-md border-l-4 border-l-brass px-2 py-1.5 text-left text-sm font-medium ${!unitId ? "bg-bone" : "hover:bg-bone/70"}`}
              >
                {t("employees.allUnits")}
              </button>
            </li>
            {units.map((unit) => {
              const thin = unit.rate < 0.8;
              const percent = Math.round(unit.rate * 100);
              const label = unit.name || t("attendance.unassigned");
              const canFilter = Boolean(unit.name) && unitOptions.some((option) => option.name === unit.name);
              const pressed = unit.name !== "" && unit.name === selectedName;
              const body = (
                <>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="font-medium">{label}</span>
                    <span className="text-ink/55">
                      {unit.onSite}/{unit.headcount} · {percent}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-bone">
                    <div className={`h-2 rounded-full ${thin ? "bg-clay" : "bg-pine"}`} style={{ width: `${percent}%` }} />
                  </div>
                </>
              );
              return (
                <li key={label}>
                  {canFilter ? (
                    <button
                      type="button"
                      aria-pressed={pressed}
                      onClick={() => onUnit(unit.name)}
                      className={`w-full rounded-md border-l-4 px-2 py-1.5 text-left ${thin ? "border-l-clay" : "border-l-pine"} ${pressed ? "bg-bone" : "hover:bg-bone/70"}`}
                    >
                      {body}
                    </button>
                  ) : (
                    <div className={`rounded-md border-l-4 px-2 py-1.5 ${thin ? "border-l-clay" : "border-l-pine"}`}>{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
        <section className="card p-4">
          <h3 className="font-serif text-xl">{openDay ? t("attendance.stillIn") : t("attendance.forgotPunch")}</h3>
          {open.length === 0 ? (
            <p className="mt-2 text-sm text-ink/50">{t("attendance.noneOpen")}</p>
          ) : (
            <ul className="mt-3 flex flex-wrap gap-2">
              {open.map((row) => (
                <li key={row.employee_id}>
                  <button
                    type="button"
                    className="rounded-md border border-line bg-bone px-2.5 py-1.5 text-sm hover:border-brass"
                    onClick={() => onEdit(row)}
                  >
                    {row.full_name}
                    <span className="ml-2 text-ink/45">{clock(row.clock_in)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

