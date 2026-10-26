export type ExportColumn<T = Record<string, unknown>> = {
  key: string;
  label: string;
  value?: (row: T) => string | number | null | undefined;
};

function cellValue<T>(row: T, column: ExportColumn<T>): string {
  const raw = column.value ? column.value(row) : (row as Record<string, unknown>)[column.key];
  if (raw == null || raw === "") return "";
  if (typeof raw === "object") {
    const named = raw as { name?: string; full_name?: string };
    if (named.name) return String(named.name);
    if (named.full_name) return String(named.full_name);
    return JSON.stringify(raw);
  }
  return String(raw);
}

function escapeCsv(value: string) {
  if (/[",\n\r]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

function stamp() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function canvasToPdf(filename: string, canvas: HTMLCanvasElement, landscape = false) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: landscape ? "landscape" : "portrait", unit: "pt", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 28;
  const usableW = pageW - margin * 2;
  const usableH = pageH - margin * 2;
  const imgW = usableW;
  const pageCanvasHeight = Math.max(1, Math.floor((usableH * canvas.width) / imgW));

  let sourceY = 0;
  let page = 0;
  while (sourceY < canvas.height) {
    const sliceHeight = Math.min(pageCanvasHeight, canvas.height - sourceY);
    const slice = document.createElement("canvas");
    slice.width = canvas.width;
    slice.height = sliceHeight;
    const ctx = slice.getContext("2d");
    if (!ctx) throw new Error("Could not build PDF page");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(canvas, 0, sourceY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

    const sliceH = (sliceHeight * imgW) / canvas.width;
    if (page > 0) pdf.addPage();
    pdf.addImage(slice.toDataURL("image/jpeg", 0.95), "JPEG", margin, margin, imgW, sliceH);
    sourceY += sliceHeight;
    page += 1;
    if (page > 80) break;
  }

  pdf.save(`${filename}-${stamp()}.pdf`);
}

function saveBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadCsv<T>(filename: string, columns: ExportColumn<T>[], rows: T[]) {
  const header = columns.map((column) => escapeCsv(column.label)).join(",");
  const lines = rows.map((row) => columns.map((column) => escapeCsv(cellValue(row, column))).join(","));
  const csv = "\uFEFF" + [header, ...lines].join("\r\n");
  saveBlob(`${filename}-${stamp()}.csv`, new Blob([csv], { type: "text/csv;charset=utf-8" }));
}

/** Downloads a real .xlsx workbook. Numbers stay text so formatted amounts match the CSV. */
export async function downloadXlsx<T>(filename: string, columns: ExportColumn<T>[], rows: T[]) {
  const XLSX = await import("xlsx");
  const data = rows.map((row) => {
    const record: Record<string, string> = {};
    for (const column of columns) record[column.label] = cellValue(row, column);
    return record;
  });
  const sheet = XLSX.utils.json_to_sheet(data, { header: columns.map((column) => column.label) });
  const book = XLSX.utils.book_new();
  const name = filename.replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 31) || "Export";
  XLSX.utils.book_append_sheet(book, sheet, name);
  const buffer = XLSX.write(book, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  saveBlob(
    `${filename}-${stamp()}.xlsx`,
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
  );
}

function printDocument<T>(title: string, columns: ExportColumn<T>[], rows: T[], subtitle?: string) {
  const head = columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("");
  const body =
    rows
      .map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(cellValue(row, column) || "–")}</td>`).join("")}</tr>`)
      .join("") || `<tr><td colspan="${columns.length}">No rows</td></tr>`;
  const generated = new Date().toLocaleString();
  const meta = [subtitle, `${rows.length} rows`, generated].filter(Boolean).join(" · ");
  const landscape = columns.length > 7;
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4 ${landscape ? "landscape" : "portrait"}; margin: 12mm; }
    body { margin: 0; color: #17191e; font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; }
    h1 { font-size: 20px; font-weight: 600; margin: 0 0 6px; }
    .meta { color: #6b655c; font-size: 12px; margin-bottom: 14px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { border-bottom: 1px solid #e4ddd2; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; color: #6b655c; }
  </style>
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <div class="meta">${escapeHtml(meta)}</div>
  <table>
    <thead><tr>${head}</tr></thead>
    <tbody>${body}</tbody>
  </table>
</body>
</html>`;
}

/** Opens the browser print dialog for the current rows. */
export function printTable<T>(title: string, columns: ExportColumn<T>[], rows: T[], subtitle?: string) {
  return new Promise<void>((resolve, reject) => {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    const win = frame.contentWindow;
    if (!doc || !win) {
      frame.remove();
      reject(new Error("Could not open print view"));
      return;
    }
    doc.open();
    doc.write(printDocument(title, columns, rows, subtitle));
    doc.close();

    let removed = false;
    const cleanup = () => {
      if (removed) return;
      removed = true;
      frame.remove();
    };
    win.addEventListener("afterprint", cleanup, { once: true });
    window.setTimeout(cleanup, 180000);
    window.setTimeout(() => {
      try {
        win.focus();
        win.print();
        resolve();
      } catch (error) {
        cleanup();
        reject(error);
      }
    }, 50);
  });
}

/** Builds a table PDF and triggers a direct file download. */
export async function downloadPdf<T>(
  filename: string,
  title: string,
  columns: ExportColumn<T>[],
  rows: T[],
  subtitle?: string,
) {
  const { default: html2canvas } = await import("html2canvas");

  const head = columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("");
  const body = rows
    .map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(cellValue(row, column) || "–")}</td>`).join("")}</tr>`)
    .join("");
  const generated = new Date().toLocaleString();
  const meta = [subtitle, `${rows.length} rows`, generated].filter(Boolean).join(" · ");

  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText =
    "position:fixed;left:-12000px;top:0;width:1100px;padding:28px;background:#ffffff;color:#17191e;" +
    'font-family:"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;box-sizing:border-box;';
  host.innerHTML = `
    <h1 style="font-size:22px;margin:0 0 6px;font-weight:600;">${escapeHtml(title)}</h1>
    <div style="color:#6b655c;font-size:12px;margin-bottom:16px;">${escapeHtml(meta)}</div>
    <table style="width:100%;border-collapse:collapse;font-size:11px;">
      <thead>
        <tr>${head.replaceAll("<th>", '<th style="border-bottom:1px solid #e4ddd2;padding:7px 8px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.06em;color:#6b655c;">')}</tr>
      </thead>
      <tbody>
        ${
          body
            .replaceAll("<td>", '<td style="border-bottom:1px solid #e4ddd2;padding:7px 8px;text-align:left;vertical-align:top;">')
            .replaceAll("<tr>", '<tr style="background:#fff;">') || `<tr><td colspan="${columns.length}">No rows</td></tr>`
        }
      </tbody>
    </table>
  `;
  document.body.appendChild(host);

  try {
    const canvas = await html2canvas(host, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
    } as never);
    await canvasToPdf(filename, canvas, columns.length > 7);
  } finally {
    host.remove();
  }
}

/** Captures a page element (e.g. analytics) and downloads it as PDF. */
export async function downloadElementPdf(filename: string, element: HTMLElement, landscape = false) {
  const { default: html2canvas } = await import("html2canvas");
  const canvas = await html2canvas(element, {
    scale: 2,
    backgroundColor: "#f7f3eb",
    useCORS: true,
    logging: false,
    windowWidth: Math.max(element.scrollWidth, 1100),
  } as never);
  await canvasToPdf(filename, canvas, landscape);
}
