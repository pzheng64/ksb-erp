"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Download, FileSpreadsheet, FileText, Printer } from "lucide-react";
import { downloadCsv, downloadElementPdf, downloadPdf, downloadXlsx, printTable, type ExportColumn } from "@/lib/export";
import { useText } from "@/lib/i18n";
import { PageHeader } from "./ui";

type ExportKind = "csv" | "xlsx" | "pdf" | "print";

export function ExportButtons<T>({
  filename,
  title,
  subtitle,
  columns,
  rows,
}: {
  filename: string;
  title: string;
  subtitle?: string;
  columns: ExportColumn<T>[];
  rows: T[];
}) {
  const { t, text } = useText();
  const [busy, setBusy] = useState<ExportKind | null>(null);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const empty = !rows.length || !columns.length;

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function run(kind: ExportKind) {
    setOpen(false);
    setBusy(kind);
    const heading = text(title);
    const note = subtitle ? text(subtitle) : undefined;
    try {
      if (kind === "csv") downloadCsv(filename, columns, rows);
      else if (kind === "xlsx") await downloadXlsx(filename, columns, rows);
      else if (kind === "pdf") await downloadPdf(filename, heading, columns, rows, note);
      else await printTable(heading, columns, rows, note);
    } finally {
      setBusy(null);
    }
  }

  const items: { kind: ExportKind; label: string; icon: typeof Download }[] = [
    { kind: "csv", label: t("reports.exportCsv"), icon: Download },
    { kind: "xlsx", label: t("reports.exportExcel"), icon: FileSpreadsheet },
    { kind: "pdf", label: t("reports.exportPdf"), icon: FileText },
    { kind: "print", label: t("reports.print"), icon: Printer },
  ];

  return (
    <div className="relative" ref={root}>
      <button
        className="btn-ghost"
        type="button"
        disabled={busy !== null || empty}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
      >
        <Download size={16} />
        {busy ? t("reports.exporting") : t("reports.export")}
        <ChevronDown size={14} className={open ? "rotate-180" : undefined} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-1 min-w-[11rem] overflow-hidden rounded-md border border-line bg-paper py-1 shadow-lg">
          {items.map((item) => (
            <button
              key={item.kind}
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-bone"
              type="button"
              onClick={() => run(item.kind)}
            >
              <item.icon size={15} />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function AnalyticsLayout({
  title,
  eyebrow,
  filename,
  children,
}: {
  title: string;
  eyebrow: string;
  filename: string;
  children: React.ReactNode;
}) {
  const { t } = useText();
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  async function exportPdf() {
    if (!ref.current) return;
    setBusy(true);
    try {
      await downloadElementPdf(filename, ref.current, true);
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
          <button className="btn-ghost" type="button" disabled={busy} onClick={exportPdf}>
            <FileText size={16} />
            {busy ? t("reports.exporting") : t("reports.exportPdf")}
          </button>
        }
      />
      <div ref={ref}>{children}</div>
    </div>
  );
}
