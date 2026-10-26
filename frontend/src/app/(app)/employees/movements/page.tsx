"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ListToolbar, useListControls } from "@/components/list-tools";
import { Banner, Empty, PageHeader } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { todayInput } from "@/lib/format";
import { Term, useText } from "@/lib/i18n";

const eventTypes = ["join", "leave", "transfer_unit", "change_position", "change_department"];
import { Page, Row } from "@/lib/types";

export default function MovementsPage() {
  const { t } = useText();
  const { has, options } = useSession();
  const canWrite = has("employees.write");
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ employee_id: "", event_type: "transfer_unit", to_unit_id: "", occurred_on: todayInput(), note: "" });

  async function reload() {
    const page = await api<Page<Row>>("/employees/movements");
    setRows(page.items);
  }

  useEffect(() => {
    reload().catch((err) => setError(err instanceof ApiError ? err.message : "Could not load movements"));
  }, []);

  const fields = useMemo(
    () => [
      { key: "date", label: t("common.date"), value: (row: Row) => String(row.occurred_on || "–") },
      { key: "employee", label: "Employee", value: (row: Row) => String(row.employee_name || "–") },
      {
        key: "movement",
        label: "Movement",
        value: (row: Row) => {
          const key = `event.${row.event_type}`;
          const label = t(key);
          return label === key ? String(row.event_type || "–") : label;
        },
      },
      { key: "from", label: "From", value: (row: Row) => String(row.from_unit || "–") },
      { key: "to", label: "To", value: (row: Row) => String(row.to_unit || "–") },
      { key: "by", label: "By", value: (row: Row) => String(row.actor || "–") },
    ],
    [t],
  );
  const list = useListControls(rows, fields);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await api("/employees/movements", {
        method: "POST",
        body: JSON.stringify({
          employee_id: Number(form.employee_id),
          event_type: form.event_type,
          to_unit_id: form.to_unit_id ? Number(form.to_unit_id) : null,
          to_department_id: null,
          to_position_id: null,
          occurred_on: form.occurred_on,
          note: form.note || null,
        }),
      });
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not record the movement");
    }
  }

  const people = options.employees.filter((item) => item.status === "active" || form.event_type === "join");

  return (
    <div>
      <PageHeader title="Movements" eyebrow="Employment" />
      <p className="mb-2 text-xs text-ink/55">Joining, leaving, and unit transfers are kept as an audit trail and update the employee card.</p>
      {error && <Banner>{error}</Banner>}
      {canWrite && (
        <form className="mb-2 flex items-center gap-1.5 overflow-x-auto" onSubmit={submit}>
          <select className="field h-8 w-auto shrink-0 px-2 py-0 text-xs" aria-label="Employee" value={form.employee_id} onChange={(event) => setForm({ ...form, employee_id: event.target.value })} required>
            <option value="">{t("common.select")}</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>{person.full_name}</option>
            ))}
          </select>
          <select className="field h-8 w-auto shrink-0 px-2 py-0 text-xs" aria-label={t("movements.movement")} value={form.event_type} onChange={(event) => setForm({ ...form, event_type: event.target.value })}>
            {eventTypes.map((value) => (
              <option key={value} value={value}>{t(`event.${value}`)}</option>
            ))}
          </select>
          <input className="field h-8 w-auto shrink-0 px-2 py-0 text-xs" type="date" aria-label={t("common.date")} value={form.occurred_on} onChange={(event) => setForm({ ...form, occurred_on: event.target.value })} required />
          <select className="field h-8 w-auto shrink-0 px-2 py-0 text-xs" aria-label="To unit" value={form.to_unit_id} onChange={(event) => setForm({ ...form, to_unit_id: event.target.value })}>
            <option value="">Unchanged</option>
            {options.units.map((unit) => (
              <option key={unit.id} value={unit.id}>{unit.name}</option>
            ))}
          </select>
          <input className="field h-8 w-48 shrink-0 px-2 py-0 text-xs" aria-label={t("common.note")} placeholder={t("common.note")} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} />
          <button className="btn-primary shrink-0 px-2 py-1 text-xs" type="submit">Record</button>
        </form>
      )}
      <ListToolbar fields={fields} controls={list} />
      <div className="card overflow-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("common.date")}</th>
              <th>Employee</th>
              <th>Movement</th>
              <th>From</th>
              <th>To</th>
              <th>By</th>
            </tr>
          </thead>
          <tbody>
            {list.pageRows.map((row) => (
              <tr key={row.id}>
                <td>{row.occurred_on}</td>
                <td>{row.employee_name}</td>
                <td><Term prefix="event" value={row.event_type} /></td>
                <td>{row.from_unit || "–"}</td>
                <td>{row.to_unit || "–"}</td>
                <td>{row.actor || "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.filtered.length && <Empty>No movements recorded.</Empty>}
      </div>
    </div>
  );
}
