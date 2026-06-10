/**
 * Client-side answer-key parsing for the OCR review importer.
 *
 * Teachers import a key in any of several formats (paste / TXT / CSV / Excel) and
 * we parse it IN THE BROWSER into normalized question→option pairs so we can show
 * a preview + validation before applying. The normalized result is then sent to
 * the existing backend endpoint as canonical text ("1-1\n2-3\n…"), which the
 * backend already understands — so no backend change is required.
 *
 * Image/PDF keys can't be parsed here; those go straight to the backend's OCR
 * path (storageKey) and surface their exceptions in the import summary instead.
 *
 * Format auto-detect:
 *   Format A (numeric) — "1-1" means Q1 → Option 1.
 *   Format B (letter)  — "1-A" means Q1 → Option A → Option 1 (A=1, B=2, …).
 */

import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export type KeyFormat = 'NUMERIC' | 'LETTER' | 'MIXED' | 'EMPTY';

export interface KeyEntry {
  /** Question number from the key. */
  num: number;
  /** Original answer token as written ("A", "3"). */
  raw: string;
  /** 1-based option position (A→1, "3"→3). */
  index: number;
}

export interface InvalidEntry {
  num: number | null;
  raw: string;
  reason: string;
}

export interface ParsedKey {
  /** Valid, de-duplicated entries, sorted by question number. */
  entries: KeyEntry[];
  format: KeyFormat;
  /** Question numbers that appeared more than once with DIFFERENT answers. */
  duplicates: number[];
  /** Rows whose answer (or number) could not be understood. */
  invalid: InvalidEntry[];
  /** Gaps in the 1..max question-number range (missing numbers). */
  missingNumbers: number[];
}

const MAX_OPTION_INDEX = 8; // options A..H / 1..8 — more than this system ever shows

/** Letter A–H → 1-based index; null if out of range. */
const letterToIndex = (ch: string): number | null => {
  const i = ch.toUpperCase().charCodeAt(0) - 64; // 'A' → 1
  return i >= 1 && i <= MAX_OPTION_INDEX ? i : null;
};

/** Interpret a raw answer cell/token → { index, isLetter } or null if invalid. */
const interpretAnswer = (raw: string): { index: number; isLetter: boolean } | null => {
  const t = raw.trim();
  // First letter A–H wins, else first single digit 1–9.
  const letter = t.match(/[A-Ha-h]/);
  if (letter && /^[\s]*[A-Ha-h][\s.)]*$/.test(t)) {
    const idx = letterToIndex(letter[0]);
    return idx ? { index: idx, isLetter: true } : null;
  }
  const digit = t.match(/[1-9]/);
  if (digit && /^[\s]*[1-9][\s.)]*$/.test(t)) {
    const idx = Number(digit[0]);
    return idx <= MAX_OPTION_INDEX ? { index: idx, isLetter: false } : null;
  }
  // Fallback: a messier cell like "Option B" or "(3)" — take the first marker.
  if (letter) {
    const idx = letterToIndex(letter[0]);
    if (idx) return { index: idx, isLetter: true };
  }
  if (digit) {
    const idx = Number(digit[0]);
    if (idx <= MAX_OPTION_INDEX) return { index: idx, isLetter: false };
  }
  return null;
};

/** Build a ParsedKey from raw (questionToken, answerToken) pairs. */
export const buildParsedKey = (rawPairs: Array<{ q: string; a: string }>): ParsedKey => {
  const byNum = new Map<number, KeyEntry>();
  const duplicates = new Set<number>();
  const invalid: InvalidEntry[] = [];
  let letters = 0;
  let digits = 0;

  for (const { q, a } of rawPairs) {
    const qMatch = q.match(/\d{1,4}/);
    if (!qMatch) {
      if (q.trim() || a.trim()) invalid.push({ num: null, raw: `${q} → ${a}`, reason: 'No question number' });
      continue;
    }
    const num = Number(qMatch[0]);
    const ans = interpretAnswer(a);
    if (!ans) {
      invalid.push({ num, raw: a, reason: 'Invalid answer value' });
      continue;
    }
    if (ans.isLetter) letters += 1;
    else digits += 1;

    const existing = byNum.get(num);
    if (existing) {
      if (existing.index !== ans.index) {
        duplicates.add(num);
        byNum.delete(num);
      }
      continue; // identical duplicate → ignore silently
    }
    if (!duplicates.has(num)) {
      byNum.set(num, { num, raw: a.trim(), index: ans.index });
    }
  }

  const entries = [...byNum.values()].sort((x, y) => x.num - y.num);
  const format: KeyFormat =
    entries.length === 0 ? 'EMPTY' : letters && digits ? 'MIXED' : letters ? 'LETTER' : 'NUMERIC';

  // Missing numbers: gaps within 1..max.
  const missingNumbers: number[] = [];
  if (entries.length > 0) {
    const present = new Set(entries.map((e) => e.num));
    const max = entries[entries.length - 1].num;
    for (let n = 1; n <= max; n += 1) if (!present.has(n)) missingNumbers.push(n);
  }

  return {
    entries,
    format,
    duplicates: [...duplicates].sort((a, b) => a - b),
    invalid,
    missingNumbers,
  };
};

/* ─────────────────────────────────────────────── Source-specific parsers */

// "1-1" "1. A" "1) B" "1 3" "1,2" "7 → D" — number, separator(s), single answer.
const PAIR_RE = /(\d{1,4})[\s\-.):=>,→]+([A-Ha-h]|[1-9])(?![0-9A-Za-z])/g;

/** Parse pasted text or a .txt file body. Scans the whole blob, so multi-column
 *  and multi-per-line layouts work. */
export const parseTextKey = (text: string): ParsedKey => {
  const pairs: Array<{ q: string; a: string }> = [];
  PAIR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = PAIR_RE.exec(text))) pairs.push({ q: m[1], a: m[2] });
  return buildParsedKey(pairs);
};

/** Parse CSV text. Accepts a "Question,Answer" header or a bare two-column file. */
export const parseCsvKey = (text: string): ParsedKey => {
  const out = Papa.parse<string[]>(text.trim(), { skipEmptyLines: true });
  const rows = (out.data ?? []).filter((r) => Array.isArray(r) && r.length > 0);
  if (rows.length === 0) return buildParsedKey([]);

  const { qCol, aCol, dataRows } = pickColumns(rows);
  const pairs = dataRows.map((r) => ({ q: String(r[qCol] ?? ''), a: String(r[aCol] ?? '') }));
  return buildParsedKey(pairs);
};

/** Parse an Excel (.xlsx/.xls) file's first sheet. */
export const parseExcelKey = (data: ArrayBuffer): ParsedKey => {
  const wb = XLSX.read(data, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return buildParsedKey([]);
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false });
  const stringRows = rows.map((r) => (Array.isArray(r) ? r.map((c) => (c == null ? '' : String(c))) : []));
  const nonEmpty = stringRows.filter((r) => r.some((c) => c.trim() !== ''));
  if (nonEmpty.length === 0) return buildParsedKey([]);

  const { qCol, aCol, dataRows } = pickColumns(nonEmpty);
  const pairs = dataRows.map((r) => ({ q: r[qCol] ?? '', a: r[aCol] ?? '' }));
  return buildParsedKey(pairs);
};

/**
 * Decide which columns hold the question number and the answer, and whether the
 * first row is a header. Defaults to columns 0 (question) and 1 (answer).
 */
const pickColumns = (
  rows: string[][],
): { qCol: number; aCol: number; dataRows: string[][] } => {
  const first = rows[0].map((c) => String(c).trim().toLowerCase());
  const qHeader = first.findIndex((c) => /quest|q\.?|no\.?|number|sl|#/.test(c));
  const aHeader = first.findIndex((c) => /ans|answer|option|key|correct/.test(c));
  const hasHeader = qHeader !== -1 || aHeader !== -1;
  const qCol = qHeader !== -1 ? qHeader : 0;
  const aCol = aHeader !== -1 ? aHeader : 1;
  return { qCol, aCol, dataRows: hasHeader ? rows.slice(1) : rows };
};

/* ─────────────────────────────────────────────── Output normalization */

/**
 * Canonical "1-1\n2-3\n…" text the backend parser ingests unambiguously — always
 * the numeric option index, so letter keys (A/B/C) are converted before sending.
 */
export const normalizeToText = (parsed: ParsedKey): string =>
  parsed.entries.map((e) => `${e.num}-${e.index}`).join('\n');

/** Human-readable option label for a 1-based index ("A", "B", … capped at H). */
export const indexToLabel = (index: number): string =>
  index >= 1 && index <= 26 ? String.fromCharCode(64 + index) : String(index);
