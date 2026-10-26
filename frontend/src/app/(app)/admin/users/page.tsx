"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ListToolbar, useListControls } from "@/components/list-tools";
import { Banner, Empty, PageHeader } from "@/components/ui";
import { ExportButtons } from "@/components/report";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { Page, Row } from "@/lib/types";

export default function UsersPage() {
  const { has, options, refresh } = useSession();
  const router = useRouter();
  const canWrite = has("users.manage");
  const [rows, setRows] = useState<Row[]>([]);
  const [filters, setFilters] = useState({ q: "", unit_id: "", status: "" });
  const [selected, setSelected] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload(next = filters) {
    const params = new URLSearchParams();
    if (next.q) params.set("q", next.q);
    if (next.unit_id) params.set("unit_id", next.unit_id);
    if (next.status) params.set("status", next.status);
    const page = await api<Page<Row>>(`/users?${params.toString()}`);
    setRows(page.items);
    setSelected([]);
  }

  useEffect(() => {
    reload().catch((err) => setError(err instanceof ApiError ? err.message : "Could not load users"));
  }, []);

  const fields = useMemo(
    () => [
      { key: "name", label: "Name", value: (row: Row) => String(row.full_name || "–") },
      { key: "username", label: "Username", value: (row: Row) => String(row.username || "–") },
      { key: "unit", label: "Unit", value: (row: Row) => String(row.unit?.name || "–") },
      { key: "roles", label: "Roles", value: (row: Row) => (row.roles || []).map((role: Row) => role.name).join(", ") || "–" },
      { key: "status", label: "Status", value: (row: Row) => String(row.status || "–") },
    ],
    [],
  );
  const list = useListControls(rows, fields);
  const visible = list.pageRows;
  const allSelected = visible.length > 0 && visible.every((row) => selected.includes(row.id));
  const pendingSelected = rows.filter((row) => selected.includes(row.id) && row.status === "pending");
  const activeSelected = rows.filter((row) => selected.includes(row.id) && row.status === "active");

  async function bulkApprove() {
    if (!pendingSelected.length) return;
    if (!confirm(`Approve ${pendingSelected.length} account${pendingSelected.length === 1 ? "" : "s"}? They will be able to sign in.`)) return;
    setBusy(true);
    setError(null);
    try {
      for (const row of pendingSelected) {
        await api(`/users/${row.id}`, { method: "PATCH", body: JSON.stringify({ status: "active" }) });
      }
      await reload();
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function bulkDisable() {
    if (!activeSelected.length) return;
    if (!confirm(`Disable ${activeSelected.length} account${activeSelected.length === 1 ? "" : "s"}?`)) return;
    setBusy(true);
    setError(null);
    try {
      for (const row of activeSelected) await api(`/users/${row.id}`, { method: "DELETE" });
      await reload();
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Users"
        eyebrow="Administration"
        action={
          <div className="flex flex-wrap gap-2">
            <ExportButtons
              filename="users"
              title="Users"
              subtitle="Administration"
              rows={rows}
              columns={[
                { key: "full_name", label: "Name" },
                { key: "username", label: "Username" },
                { key: "email", label: "Email", value: (row) => row.email || "" },
                { key: "unit", label: "Unit", value: (row) => row.unit?.name || "" },
                {
                  key: "roles",
                  label: "Roles",
                  value: (row) =>
                    Array.isArray(row.roles)
                      ? row.roles
                          .map((role: { name?: string } | string) => (typeof role === "string" ? role : role.name || ""))
                          .filter(Boolean)
                          .join(", ")
                      : "",
                },
                { key: "status", label: "Status" },
              ]}
            />
            {canWrite && pendingSelected.length > 0 && (
              <button className="btn-ghost" disabled={busy} onClick={bulkApprove} type="button">
                Approve ({pendingSelected.length})
              </button>
            )}
            {canWrite && activeSelected.length > 0 && (
              <button className="btn-ghost text-clay" disabled={busy} onClick={bulkDisable} type="button">
                Disable ({activeSelected.length})
              </button>
            )}
            {canWrite ? (
              <button className="btn-primary" onClick={() => router.push("/admin/users/new")} type="button">
                Add
              </button>
            ) : null}
          </div>
        }
      />
      <p className="mb-2 text-xs text-ink/55">Open an account to edit it. Pending accounts cannot sign in until their status is Active.</p>
      {error && <Banner>{error}</Banner>}
      <ListToolbar
        fields={fields}
        controls={list}
        leading={
          <>
            <input className="field h-8 w-44 shrink-0 px-2 py-0 text-xs" placeholder="Name, username, or email" value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} aria-label="Search" />
            <select className="field h-8 w-auto shrink-0 px-2 py-0 text-xs" aria-label="Unit" value={filters.unit_id} onChange={(event) => setFilters({ ...filters, unit_id: event.target.value })}>
              <option value="">All units</option>
              {options.units.map((unit) => (
                <option key={unit.id} value={unit.id}>{unit.name}</option>
              ))}
            </select>
            <select className="field h-8 w-auto shrink-0 px-2 py-0 text-xs" aria-label="Status" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
              <option value="">Any status</option>
              <option value="pending">Pending</option>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </select>
            <button className="btn-ghost shrink-0 px-2 py-1 text-xs" type="button" onClick={() => reload()}>Search</button>
          </>
        }
      />
      <div className="card overflow-auto">
        <table className="data-table">
          <thead>
            <tr>
              {canWrite && (
                <th className="w-10">
                  <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? [] : visible.map((row) => row.id))} aria-label="Select all" />
                </th>
              )}
              <th>Name</th>
              <th>Username</th>
              <th>Unit</th>
              <th>Roles</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.id} className="cursor-pointer hover:bg-brass/[0.06]" onClick={() => router.push(`/admin/users/${row.id}`)}>
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
                  {row.full_name}
                  <div className="text-xs text-ink/40">{row.email}</div>
                </td>
                <td>{row.username}</td>
                <td>{row.unit?.name || "–"}</td>
                <td>{(row.roles || []).map((role: Row) => role.name).join(", ") || "–"}</td>
                <td className="capitalize">{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.filtered.length && <Empty>No accounts match.</Empty>}
      </div>
    </div>
  );
}
