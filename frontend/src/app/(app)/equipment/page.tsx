"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ListToolbar, useListControls } from "@/components/list-tools";
import { Banner, Empty, PageHeader } from "@/components/ui";
import { ExportButtons } from "@/components/report";
import { Thumb } from "@/components/image-field";
import { api, ApiError } from "@/lib/api";
import { useSession } from "@/lib/auth";
import { Term, useText } from "@/lib/i18n";
import { money } from "@/lib/format";
import { Page, Row } from "@/lib/types";

export default function EquipmentPage() {
  const { t } = useText();
  const { has } = useSession();
  const router = useRouter();
  const canWrite = has("equipment.write");
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    const page = await api<Page<Row>>("/equipment");
    setRows(page.items);
    setSelected([]);
  }

  useEffect(() => {
    reload().catch((err) => setError(err instanceof ApiError ? err.message : "Could not load equipment"));
  }, []);

  const fields = useMemo(
    () => [
      { key: "asset_no", label: t("equipment.asset"), value: (row: Row) => String(row.asset_no || "–") },
      { key: "name", label: t("common.name"), value: (row: Row) => String(row.name || "–") },
      { key: "category", label: t("common.category"), value: (row: Row) => String(row.category || "–") },
      { key: "unit", label: t("common.unit"), value: (row: Row) => String(row.unit_name || "–") },
      {
        key: "status",
        label: t("common.status"),
        value: (row: Row) => {
          const key = `equipment.${row.status}`;
          const label = t(key);
          return label === key ? String(row.status || "–").replaceAll("_", " ") : label;
        },
      },
      { key: "value", label: t("common.value"), value: (row: Row) => money(row.value, row.currency) },
    ],
    [t],
  );
  const list = useListControls(rows, fields);
  const visible = list.pageRows;
  const allSelected = visible.length > 0 && visible.every((row) => selected.includes(row.id));

  async function bulkDelete() {
    if (!selected.length) return;
    if (!confirm(`Delete ${selected.length} asset${selected.length === 1 ? "" : "s"}?`)) return;
    setBusy(true);
    setError(null);
    try {
      for (const id of selected) await api(`/equipment/${id}`, { method: "DELETE" });
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Equipment"
        eyebrow="Assets"
        action={
          <div className="flex flex-wrap gap-2">
            <ExportButtons
              filename="equipment"
              title="Equipment"
              subtitle="Assets"
              rows={list.filtered}
              columns={[
                { key: "asset_no", label: "Asset" },
                { key: "name", label: "Name" },
                { key: "category", label: "Category", value: (row) => row.category || "" },
                { key: "unit_name", label: "Unit", value: (row) => row.unit_name || "" },
                { key: "status", label: "Status", value: (row) => String(row.status || "").replaceAll("_", " ") },
                { key: "value", label: "Value", value: (row) => money(row.value, row.currency) },
              ]}
            />
            {canWrite && selected.length > 0 && (
              <button className="btn-ghost text-clay" disabled={busy} onClick={bulkDelete} type="button">
                {t("common.delete")} ({selected.length})
              </button>
            )}
            {canWrite ? (
              <button className="btn-primary" onClick={() => router.push("/equipment/new")} type="button">
                {t("common.add")}
              </button>
            ) : null}
          </div>
        }
      />
      <p className="mb-2 text-xs text-ink/55">Open an asset to view or edit it. Select rows to delete from the toolbar.</p>
      {error && <Banner>{error}</Banner>}
      <ListToolbar fields={fields} controls={list} />
      <div className="card">
        <div className="overflow-auto">
          <table className="data-table">
            <thead>
              <tr>
                {canWrite && (
                  <th className="w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={() => setSelected(allSelected ? [] : visible.map((row) => row.id))}
                      aria-label="Select all"
                    />
                  </th>
                )}
                <th></th>
                <th>{t("equipment.asset")}</th>
                <th>{t("common.name")}</th>
                <th>{t("common.category")}</th>
                <th>{t("common.unit")}</th>
                <th>{t("common.status")}</th>
                <th>{t("common.value")}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id} className="cursor-pointer hover:bg-brass/[0.06]" onClick={() => router.push(`/equipment/${row.id}`)}>
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
                        aria-label={`Select ${row.asset_no}`}
                      />
                    </td>
                  )}
                  <td>
                    <Thumb src={row.image_url} alt={row.name} />
                  </td>
                  <td>{row.asset_no}</td>
                  <td>{row.name}</td>
                  <td>{row.category}</td>
                  <td>{row.unit_name || "–"}</td>
                  <td><Term prefix="equipment" value={row.status} /></td>
                  <td>{money(row.value, row.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!list.filtered.length && <Empty>Nothing in this list yet.</Empty>}
        </div>
      </div>
    </div>
  );
}
