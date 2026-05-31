/**
 * Tiny dependency-free CSV helpers used by admin export buttons (e.g. the Team
 * KPI staff table and Workload grid, design Screen 90/89).
 *
 * `toCsv` is pure and RFC-4180-ish: a field is quoted only when it contains a
 * comma, double-quote, newline or carriage return, and embedded quotes are
 * doubled. `downloadCsv` turns a string into a browser file download.
 */

export interface CsvColumn<T> {
  /** Column header text (first row of the file). */
  header: string
  /** Pulls the cell value for a row; non-string results are stringified. */
  value: (row: T) => string | number | null | undefined
}

/** Escapes a single field per CSV rules; only quotes when necessary. */
export function escapeCsvField(value: string | number | null | undefined): string {
  const s = value == null ? '' : String(value)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Serializes rows to a CSV string (header row + one line per row, CRLF-separated). */
export function toCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const header = columns.map(c => escapeCsvField(c.header)).join(',')
  const body = rows.map(row =>
    columns.map(c => escapeCsvField(c.value(row))).join(','))
  return [header, ...body].join('\r\n')
}

/** Triggers a client-side download of `csv` as `filename` (no-op outside the browser). */
export function downloadCsv(filename: string, csv: string): void {
  if (typeof document === 'undefined') return
  // Prepend a UTF-8 BOM so Excel renders non-ASCII (₹, Indian names) correctly.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Builds a date-stamped filename like `team-kpis-2026-05-31.csv`. */
export function csvFilename(prefix: string, date: Date = new Date()): string {
  return `${prefix}-${date.toISOString().slice(0, 10)}.csv`
}
