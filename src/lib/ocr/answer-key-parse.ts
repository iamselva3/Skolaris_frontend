/**
 * Client-side FILE READERS for the answer-key importer.
 *
 * The browser no longer interprets answers — there is ONE canonical parser and
 * validator on the backend. These helpers only turn a CSV/Excel file into a
 * plain-text blob (e.g. "1 A\n2 B") that the backend grammar parses, so a key
 * parses identically regardless of upload format. TXT/Paste are sent as-is;
 * Image/PDF are uploaded and OCR'd server-side.
 */

import Papa from 'papaparse';
import * as XLSX from 'xlsx';

/**
 * Decide which columns hold the question number and the answer, and whether the
 * first row is a header. Defaults to columns 0 (question) and 1 (answer).
 */
const pickColumns = (
  rows: string[][],
): { qCol: number; aCol: number; dataRows: string[][] } => {
  const first = (rows[0] ?? []).map((c) => String(c).trim().toLowerCase());
  const qHeader = first.findIndex((c) => /quest|q\.?|no\.?|number|sl|#/.test(c));
  const aHeader = first.findIndex((c) => /ans|answer|option|key|correct/.test(c));
  const hasHeader = qHeader !== -1 || aHeader !== -1;
  const qCol = qHeader !== -1 ? qHeader : 0;
  const aCol = aHeader !== -1 ? aHeader : 1;
  return { qCol, aCol, dataRows: hasHeader ? rows.slice(1) : rows };
};

/** Emit "question answer" lines the backend grammar understands (space-separated,
 *  so no comma/format ambiguity reaches the parser). */
const rowsToText = (rows: string[][]): string => {
  const { qCol, aCol, dataRows } = pickColumns(rows);
  return dataRows
    .map((r) => `${String(r[qCol] ?? '').trim()} ${String(r[aCol] ?? '').trim()}`.trim())
    .filter((line) => line.length > 0)
    .join('\n');
};

/** CSV file/text → normalized text blob for the backend parser. */
export const csvToText = (text: string): string => {
  const out = Papa.parse<string[]>(text.trim(), { skipEmptyLines: true });
  const rows = (out.data ?? []).filter((r) => Array.isArray(r) && r.length > 0);
  return rowsToText(rows);
};

/** Human-readable option label for a 1-based index ("A", "B", … capped at Z). */
export const indexToLabel = (index: number): string =>
  index >= 1 && index <= 26 ? String.fromCharCode(64 + index) : String(index);

/** Excel (.xlsx/.xls) → normalized text blob. Reads ALL sheets (not just the first). */
export const excelToText = (data: ArrayBuffer): string => {
  const wb = XLSX.read(data, { type: 'array' });
  const parts: string[] = [];
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false });
    const stringRows = rows.map((r) =>
      Array.isArray(r) ? r.map((c) => (c == null ? '' : String(c))) : [],
    );
    const nonEmpty = stringRows.filter((r) => r.some((c) => c.trim() !== ''));
    if (nonEmpty.length > 0) parts.push(rowsToText(nonEmpty));
  }
  return parts.join('\n');
};
