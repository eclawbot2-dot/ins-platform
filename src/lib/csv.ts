/**
 * CSV serialize/parse — RFC 4180-ish. Used by report "Export CSV"
 * buttons and the commission-statement CSV import.
 *
 * toCsv: quotes fields containing comma/quote/newline, doubles internal
 * quotes, prepends a UTF-8 BOM so Excel opens with the right codepage.
 * fromCsv: full quoted-field parser, accepts CRLF or LF.
 */

export type CsvRow = Record<
  string,
  string | number | boolean | null | undefined | Date | { toNumber: () => number }
>;

const NEEDS_QUOTING = /[",\r\n]/;
// Spreadsheet formula-injection guard: a cell beginning with one of these is
// evaluated as a formula by Excel/Sheets. Neutralize by prefixing a single
// quote so the value renders verbatim instead of executing.
const FORMULA_LEAD = /^[=+\-@\t\r]/;

function escape(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object" && v !== null && typeof (v as { toNumber?: () => number }).toNumber === "function") {
    return String((v as { toNumber: () => number }).toNumber());
  }
  let s = String(v);
  if (FORMULA_LEAD.test(s)) s = `'${s}`;
  if (!NEEDS_QUOTING.test(s)) return s;
  return `"${s.replace(/"/g, '""')}"`;
}

export function toCsv(rows: ReadonlyArray<CsvRow>, columns?: ReadonlyArray<string>): string {
  if (rows.length === 0 && !columns) return "";
  const cols = columns ?? Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const header = cols.map((c) => escape(c)).join(",");
  const body = rows.map((r) => cols.map((c) => escape(r[c])).join(",")).join("\r\n");
  return `﻿${header}\r\n${body}\r\n`;
}

export function fromCsv(text: string): Array<Record<string, string>> {
  const t = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let cur: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inQuotes) {
      if (c === '"' && t[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cell += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      cur.push(cell);
      cell = "";
    } else if (c === "\r") {
      // swallow; \n commits
    } else if (c === "\n") {
      cur.push(cell);
      rows.push(cur);
      cur = [];
      cell = "";
    } else {
      cell += c;
    }
  }
  if (cell !== "" || cur.length > 0) {
    cur.push(cell);
    rows.push(cur);
  }
  if (rows.length === 0) return [];
  const header = rows[0]!;
  return rows
    .slice(1)
    .filter((r) => r.length > 0 && !(r.length === 1 && r[0] === ""))
    .map((r) => {
      const obj: Record<string, string> = {};
      for (let j = 0; j < header.length; j++) {
        obj[header[j]!.trim()] = r[j] ?? "";
      }
      return obj;
    });
}
