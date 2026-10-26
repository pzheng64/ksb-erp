"use client";

import { useEffect, useMemo, useState } from "react";

export type ListField<T> = { key: string; label: string; value: (row: T) => string };

export function useListControls<T>(rows: T[], fields: ListField<T>[]) {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [groupBy, setGroupBy] = useState("");
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(1);
  const filterStamp = JSON.stringify(filters);

  const filtered = useMemo(
    () => rows.filter((row) => fields.every((field) => !filters[field.key] || field.value(row) === filters[field.key])),
    [rows, fields, filters],
  );

  useEffect(() => {
    setPage(1);
  }, [filterStamp, pageSize]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize) || 1);
  const current = Math.min(page, pageCount);
  const start = filtered.length ? (current - 1) * pageSize : 0;
  const pageRows = filtered.slice(start, start + pageSize);

  const groups = useMemo(() => {
    if (!groupBy) return [{ label: "", rows: pageRows }];
    const field = fields.find((item) => item.key === groupBy);
    const buckets = new Map<string, T[]>();
    for (const row of pageRows) {
      const label = field ? field.value(row) || "–" : "–";
      const bucket = buckets.get(label);
      if (bucket) bucket.push(row);
      else buckets.set(label, [row]);
    }
    return Array.from(buckets, ([label, items]) => ({ label, rows: items }));
  }, [groupBy, pageRows, fields]);

  const choices = useMemo(() => {
    const next: Record<string, string[]> = {};
    for (const field of fields) {
      next[field.key] = Array.from(new Set(rows.map((row) => field.value(row) || "–"))).sort((a, b) => a.localeCompare(b));
    }
    return next;
  }, [rows, fields]);

  return {
    filters,
    setFilters,
    groupBy,
    setGroupBy,
    pageSize,
    setPageSize,
    page: current,
    setPage,
    pageCount,
    filtered,
    pageRows,
    groups,
    choices,
    start,
    filtering: Object.values(filters).some(Boolean),
  };
}

export const compactField = "field h-8 w-auto shrink-0 px-2 py-0 text-xs";

const compact = compactField;

export function ListToolbar<T>({
  fields,
  controls,
  leading,
  columnFilters = true,
}: {
  fields: ListField<T>[];
  controls: ReturnType<typeof useListControls<T>>;
  leading?: React.ReactNode;
  columnFilters?: boolean;
}) {
  const { filters, setFilters, groupBy, setGroupBy, pageSize, setPageSize, page, setPage, pageCount, filtered, choices, start, filtering } = controls;
  const end = Math.min(start + pageSize, filtered.length);
  return (
    <div className="mb-2 flex items-center gap-1.5 overflow-x-auto">
      {leading}
      {columnFilters && (
        <>
          <select className={`${compact} min-w-[7.5rem]`} aria-label="Group by" value={groupBy} onChange={(event) => setGroupBy(event.target.value)}>
            <option value="">Group by</option>
            {fields.map((field) => (
              <option key={field.key} value={field.key}>
                {field.label}
              </option>
            ))}
          </select>
          {fields.map((field) => (
            <select
              key={field.key}
              className={`${compact} max-w-[11rem]`}
              aria-label={field.label}
              value={filters[field.key] || ""}
              onChange={(event) => setFilters((current) => ({ ...current, [field.key]: event.target.value }))}
            >
              <option value="">{field.label}</option>
              {choices[field.key]?.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          ))}
          {filtering && (
            <button className="btn-ghost shrink-0 px-2 py-1 text-xs" type="button" onClick={() => setFilters({})}>
              Clear
            </button>
          )}
        </>
      )}
      <span className="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-ink/55">
        <select
          className={compact}
          aria-label="Rows per page"
          value={pageSize}
          onChange={(event) => setPageSize(Number(event.target.value))}
        >
          <option value={25}>25</option>
          <option value={50}>50</option>
        </select>
        <span>
          {filtered.length ? `${start + 1}–${end} of ${filtered.length}` : "0"}
        </span>
        <button className="btn-ghost px-2 py-1 text-xs" type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>
          Prev
        </button>
        <button className="btn-ghost px-2 py-1 text-xs" type="button" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>
          Next
        </button>
      </span>
    </div>
  );
}
