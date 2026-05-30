import Papa from 'papaparse';

/** One exportable column: a header label + a cell accessor. */
export interface ExportColumn<T> {
  header: string;
  value: (row: T) => string | number;
}

export interface ExportKpi {
  label: string;
  value: string | number;
}

interface PdfOptions<T> {
  title: string;
  /** e.g. active filters / date range — rendered under the title. */
  subtitle?: string;
  columns: ExportColumn<T>[];
  rows: T[];
  kpis?: ExportKpi[];
}

const stamp = (): string => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

const triggerDownload = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

export function exportCsv<T>(baseName: string, columns: ExportColumn<T>[], rows: T[]): void {
  const csv = Papa.unparse({
    fields: columns.map((c) => c.header),
    data: rows.map((r) => columns.map((c) => c.value(r))),
  });
  triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `${baseName}-${stamp()}.csv`);
}

// Flat, token-aligned PDF palette (no gradients/shadows — matches the ERP look).
const INK = '#111827';
const MUTED = '#6B7280';
const PRIMARY: [number, number, number] = [31, 78, 140]; // --primary #1F4E8C
const LINE: [number, number, number] = [229, 231, 235]; // --border #E5E7EB
const ZEBRA: [number, number, number] = [249, 250, 251]; // --bg-subtle #F9FAFB

// jsPDF + autotable are ~150KB gzip — loaded only when a PDF is actually
// requested so they never enter the initial bundle.
export async function exportPdf<T>(baseName: string, opts: PdfOptions<T>): Promise<void> {
  const [{ jsPDF }, autoTableMod] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const autoTable = autoTableMod.default;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const margin = 40;
  let y = margin;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(INK);
  doc.text('The SK Learnings', margin, y);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(opts.title, margin, (y += 18));

  doc.setFontSize(8.5);
  doc.setTextColor(MUTED);
  doc.text(`Generated ${new Date().toLocaleString()}`, margin, (y += 14));
  if (opts.subtitle) doc.text(opts.subtitle, margin, (y += 12));

  if (opts.kpis && opts.kpis.length > 0) {
    y += 16;
    const line = opts.kpis.map((k) => `${k.label}: ${k.value}`).join('     ');
    doc.setFontSize(9);
    doc.setTextColor(INK);
    doc.text(line, margin, y);
  }

  autoTable(doc, {
    startY: y + 14,
    margin: { left: margin, right: margin },
    head: [opts.columns.map((c) => c.header)],
    body: opts.rows.map((r) => opts.columns.map((c) => String(c.value(r)))),
    styles: {
      font: 'helvetica',
      fontSize: 8.5,
      cellPadding: 4,
      lineColor: LINE,
      lineWidth: 0.5,
      textColor: INK,
    },
    headStyles: { fillColor: PRIMARY, textColor: '#FFFFFF', fontStyle: 'bold', lineWidth: 0 },
    alternateRowStyles: { fillColor: ZEBRA },
    theme: 'grid',
  });

  doc.save(`${baseName}-${stamp()}.pdf`);
}
