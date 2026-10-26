"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useText } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { Page, Row } from "@/lib/types";
import { useToast } from "./toast";
import { isDirty, snapshot, UnsavedDialog } from "./unsaved";
import { Banner, DetailHeader, Empty, Field, Loading, PageHeader } from "./ui";
import { ImageField } from "./image-field";
import { ExportButtons } from "./report";
import { ListToolbar, useListControls } from "./list-tools";
import type { ExportColumn } from "@/lib/export";

export type FieldDef = {
  name: string;
  label: string;
  type: "text" | "number" | "date" | "textarea" | "select" | "checkbox" | "image";
  required?: boolean;
  options?: { value: string; label: string }[];
  valueType?: "string" | "number";
  placeholder?: string;
  defaultChecked?: boolean;
  defaultValue?: string;
  visible?: (form: Record<string, string | boolean>) => boolean;
};

type Column = { key: string; label: string; render?: (row: Row) => React.ReactNode; exportValue?: (row: Row) => string | number | null | undefined; skipExport?: boolean };

function blankForm(fields: FieldDef[]) {
  const next: Record<string, string | boolean> = {};
  for (const field of fields) {
    next[field.name] = field.type === "checkbox" ? field.defaultChecked !== false : field.defaultValue ?? "";
  }
  return next;
}

function rowToForm(fields: FieldDef[], row: Row) {
  const next: Record<string, string | boolean> = {};
  for (const field of fields) {
    const raw = row[field.name];
    next[field.name] = field.type === "checkbox" ? Boolean(raw) : raw == null ? "" : String(raw);
  }
  return next;
}

function formToBody(fields: FieldDef[], form: Record<string, string | boolean>, requiredMessage?: (label: string) => string) {
  const body: Row = {};
  for (const field of fields) {
    const value = form[field.name];
    if (field.visible && !field.visible(form)) {
      body[field.name] = null;
      continue;
    }
    if (field.type === "checkbox") {
      body[field.name] = Boolean(value);
      continue;
    }
    const text = String(value ?? "").trim();
    if (field.required && !text) throw new Error(requiredMessage ? requiredMessage(field.label) : `${field.label} is required`);
    if (!text) {
      body[field.name] = field.type === "number" ? 0 : null;
      continue;
    }
    body[field.name] = field.type === "number" || field.valueType === "number" ? Number(text) : text;
  }
  return body;
}

async function loadRow(path: string, id: string): Promise<Row> {
  try {
    return await api<Row>(`${path}/${id}`);
  } catch (err) {
    if (!(err instanceof ApiError) || (err.status !== 404 && err.status !== 405)) throw err;
    const page = await api<Page<Row>>(path);
    const row = page.items.find((item) => String(item.id) === id);
    if (!row) throw new Error("Record was not found");
    return row;
  }
}

export function ResourcePage({
  title,
  eyebrow,
  description,
  path,
  hrefBase,
  columns,
  fields,
  canWrite,
  canEdit = true,
  removeLabel = "Delete",
  canRemoveRow,
  exportFilename,
}: {
  title: string;
  eyebrow?: string;
  description?: string;
  path: string;
  hrefBase: string;
  columns: Column[];
  fields: FieldDef[] | ((row: Row | null) => FieldDef[]);
  canWrite: boolean;
  canEdit?: boolean;
  removeLabel?: string;
  canRemoveRow?: (row: Row) => boolean;
  exportFilename?: string;
}) {
  const { t, text } = useText();
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);

  async function reload() {
    const page = await api<Page<Row>>(path);
    setRows(page.items);
    setSelected([]);
  }

  useEffect(() => {
    reload().catch((err) => setError(err instanceof ApiError ? err.message : t("common.loadFailed")));
  }, [path]);

  const listFields = columns
    .filter((column) => column.label && column.key !== "image_url")
    .map((column) => ({
      key: column.key,
      label: text(column.label),
      value: (row: Row) => {
        if (column.exportValue) {
          const exported = column.exportValue(row);
          return exported == null || exported === "" ? "–" : String(exported);
        }
        const raw = row[column.key];
        return raw == null || raw === "" ? "–" : String(raw);
      },
    }));
  const list = useListControls(rows, listFields);
  const filtered = list.filtered;
  const visible = list.pageRows;
  const exportColumns: ExportColumn<Row>[] = columns
    .filter((column) => !column.skipExport && column.label && column.key !== "image_url")
    .map((column) => ({
      key: column.key,
      label: column.label,
      value: column.exportValue,
    }));

  const showSelect = canWrite && (!canRemoveRow || visible.some((row) => canRemoveRow(row)));
  const removable = useMemo(
    () => visible.filter((row) => selected.includes(row.id) && (!canRemoveRow || canRemoveRow(row))),
    [visible, selected, canRemoveRow],
  );
  const allVisibleSelected = showSelect && visible.filter((row) => !canRemoveRow || canRemoveRow(row)).length > 0
    && visible.filter((row) => !canRemoveRow || canRemoveRow(row)).every((row) => selected.includes(row.id));

  function toggleAll() {
    const ids = visible.filter((row) => !canRemoveRow || canRemoveRow(row)).map((row) => row.id);
    if (allVisibleSelected) setSelected((current) => current.filter((id) => !ids.includes(id)));
    else setSelected((current) => Array.from(new Set([...current, ...ids])));
  }

  function toggleOne(id: number, event: React.MouseEvent) {
    event.stopPropagation();
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  async function bulkRemove() {
    if (!removable.length) return;
    if (!confirm(t("common.removeConfirm"))) return;
    setBusy(true);
    setError(null);
    try {
      for (const row of removable) {
        await api(`${path}/${row.id}`, { method: "DELETE" });
      }
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("common.removeFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={title}
        eyebrow={eyebrow}
        action={
          <div className="flex flex-wrap gap-2">
            {exportFilename ? (
              <ExportButtons filename={exportFilename} title={title} subtitle={eyebrow} columns={exportColumns} rows={filtered} />
            ) : null}
            {canWrite && removable.length > 0 && (
              <button className="btn-ghost text-clay" disabled={busy} onClick={bulkRemove} type="button">
                {text(removeLabel)} ({removable.length})
              </button>
            )}
            {canWrite ? (
              <button className="btn-primary" onClick={() => router.push(`${hrefBase}/new`)} type="button">
                {t("common.add")}
              </button>
            ) : null}
          </div>
        }
      />
      {description && <p className="mb-2 text-xs text-ink/55">{text(description)}</p>}
      {error && <Banner>{error}</Banner>}
      <ListToolbar fields={listFields} controls={list} />
      <div className="card">
        <div className="overflow-auto">
          <table className="data-table">
            <thead>
              <tr>
                {showSelect && (
                  <th className="w-10">
                    <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} aria-label={t("common.selectAll")} />
                  </th>
                )}
                {columns.map((column) => (
                  <th key={column.key}>{text(column.label)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer hover:bg-brass/[0.06]"
                  onClick={() => router.push(`${hrefBase}/${row.id}`)}
                >
                  {showSelect && (
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.includes(row.id)}
                        disabled={Boolean(canRemoveRow && !canRemoveRow(row))}
                        onClick={(event) => toggleOne(row.id, event)}
                        onChange={() => undefined}
                        aria-label={`Select ${row.id}`}
                      />
                    </td>
                  )}
                  {columns.map((column) => (
                    <td key={column.key}>{column.render ? column.render(row) : String(row[column.key] ?? "–")}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {!filtered.length && <Empty>{t("common.empty")}</Empty>}
        </div>
      </div>
    </div>
  );
}

export function ResourceDetail({
  title,
  backLabel,
  path,
  hrefBase,
  fields,
  canWrite,
  canEdit = true,
  titleKey,
  after,
  readOnlyWhen,
}: {
  title: string;
  backLabel: string;
  path: string;
  hrefBase: string;
  fields: FieldDef[] | ((row: Row | null) => FieldDef[]);
  canWrite: boolean;
  canEdit?: boolean;
  titleKey?: string;
  after?: (row: Row | null) => React.ReactNode;
  readOnlyWhen?: (row: Row | null) => boolean;
}) {
  const { t, text } = useText();
  const { defaultCurrency } = useSettings();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const isNew = params.id === "new";
  const resolveFields = (row: Row | null) => (typeof fields === "function" ? fields(row) : fields);

  const [row, setRow] = useState<Row | null>(null);
  const [form, setForm] = useState<Record<string, string | boolean>>({});
  const [baseline, setBaseline] = useState("");
  const [heading, setHeading] = useState(isNew ? `New ${title}` : title);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const edited = useRef(false);

  const activeFields = resolveFields(row);
  const readOnly = !canWrite || (!isNew && !canEdit) || (!isNew && Boolean(readOnlyWhen?.(row)));
  const dirty = !readOnly && baseline !== "" && isDirty(form, baseline);

  useEffect(() => {
    edited.current = false;
  }, [params.id]);

  useEffect(() => {
    if (isNew) {
      if (edited.current) return;
      const blank = blankForm(resolveFields(null));
      if ("currency" in blank && !blank.currency) blank.currency = defaultCurrency;
      setForm(blank);
      setBaseline(snapshot(blank));
      return;
    }
    if (edited.current) return;
    loadRow(path, params.id)
      .then((item) => {
        setRow(item);
        const next = rowToForm(resolveFields(item), item);
        setForm(next);
        setBaseline(snapshot(next));
        if (titleKey && item[titleKey]) setHeading(String(item[titleKey]));
        else setHeading(title);
      })
      .catch((err) => setError(err instanceof Error && err.message === "Record was not found" ? t("resource.notFound") : err instanceof ApiError ? err.message : t("common.loadFailed")))
      .finally(() => setLoading(false));
  }, [isNew, params.id, path, defaultCurrency]);

  async function persist() {
    const body = formToBody(activeFields, form, (label) => t("common.required", { label: text(label) }));
    if (isNew) {
      const created = await api<Row>(path, { method: "POST", body: JSON.stringify(body) });
      toast.success(t("common.saved"));
      setBaseline(snapshot(form));
      router.replace(`${hrefBase}/${created.id}`);
      return;
    }
    const updated = await api<Row>(`${path}/${params.id}`, { method: "PATCH", body: JSON.stringify(body) });
    setRow(updated);
    const next = rowToForm(resolveFields(updated), updated);
    setForm(next);
    setBaseline(snapshot(next));
    if (titleKey && updated[titleKey]) setHeading(String(updated[titleKey]));
    toast.success(t("common.saved"));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (readOnly) return;
    setSaving(true);
    setError(null);
    try {
      await persist();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  function requestLeave() {
    if (!dirty) {
      router.push(hrefBase);
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
      router.push(hrefBase);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.saveFailed"));
      setLeaveOpen(false);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Loading label={t("common.loading")} />;

  const displayHeading = isNew ? t("resource.newTitle", { title: text(title) }) : heading === title ? text(title) : heading;

  return (
    <div>
      <DetailHeader backHref={hrefBase} backLabel={text(backLabel)} title={displayHeading} onBack={requestLeave} />
      {error && <Banner>{error}</Banner>}
      <form className="card grid max-w-3xl gap-4 p-5 sm:grid-cols-2" onSubmit={onSubmit}>
        {activeFields.map((field) => {
          if (field.visible && !field.visible(form)) return null;
          return (
          <div key={field.name} className={field.type === "textarea" || field.type === "image" ? "sm:col-span-2" : ""}>
            <Field label={field.label}>
              {field.type === "textarea" ? (
                <textarea
                  className="field min-h-24"
                  disabled={readOnly}
                  value={String(form[field.name] ?? "")}
                  onChange={(event) => {
                    edited.current = true;
                    setForm({ ...form, [field.name]: event.target.value });
                  }}
                />
              ) : field.type === "image" ? (
                <ImageField
                  value={String(form[field.name] ?? "")}
                  disabled={readOnly}
                  onChange={(url) => {
                    edited.current = true;
                    setForm({ ...form, [field.name]: url });
                  }}
                />
              ) : field.type === "select" ? (
                <select
                  className="field"
                  disabled={readOnly}
                  value={String(form[field.name] ?? "")}
                  onChange={(event) => {
                    edited.current = true;
                    setForm({ ...form, [field.name]: event.target.value });
                  }}
                  required={field.required}
                >
                  <option value="">{t("common.select")}</option>
                  {(field.options || []).map((option) => (
                    <option key={option.value} value={option.value}>
                      {text(option.label)}
                    </option>
                  ))}
                </select>
              ) : field.type === "checkbox" ? (
                <input
                  type="checkbox"
                  className="mt-2 h-4 w-4"
                  disabled={readOnly}
                  checked={Boolean(form[field.name])}
                  onChange={(event) => {
                    edited.current = true;
                    setForm({ ...form, [field.name]: event.target.checked });
                  }}
                />
              ) : (
                <input
                  className="field"
                  disabled={readOnly}
                  type={field.type === "number" ? "number" : field.type}
                  step={field.type === "number" ? "any" : undefined}
                  placeholder={field.placeholder}
                  required={field.required}
                  value={String(form[field.name] ?? "")}
                  onChange={(event) => {
                    edited.current = true;
                    setForm({ ...form, [field.name]: event.target.value });
                  }}
                />
              )}
            </Field>
          </div>
          );
        })}
        {!readOnly && (
          <div className="sm:col-span-2 flex justify-end gap-2 border-t border-line pt-4">
            <button className="btn-ghost" type="button" onClick={requestLeave}>
              {t("common.cancel")}
            </button>
            <button className="btn-primary" disabled={saving} type="submit">
              {saving ? t("common.saving") : t("common.save")}
            </button>
          </div>
        )}
      </form>
      {!isNew && after ? after(row) : null}
      <UnsavedDialog
        open={leaveOpen}
        saving={saving}
        onStay={() => setLeaveOpen(false)}
        onLeave={() => {
          setLeaveOpen(false);
          router.push(hrefBase);
        }}
        onSave={saveAndLeave}
      />
    </div>
  );
}
