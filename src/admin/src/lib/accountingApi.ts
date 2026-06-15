/**
 * Accounting Service API client — MCA Edit Log (GAP-100, Task #33)
 * All calls go through the shared axios instance from lib/api.ts
 * Base URL from VITE_API_BASE_URL env var (never hardcoded).
 *
 * Endpoints (AccountingService :5103):
 *   GET /accounting/edit-log?fyYear=&entityType=&page=&pageSize=
 *       → EditLogPageDto  (Permission: accounting.editlog.read)
 *   GET /accounting/edit-log/export?fyYear=2026-27
 *       → CSV download    (Permission: accounting.editlog.read)
 *
 * Valid entityType values (from backend validator):
 *   "journal_entry" | "journal_entry_line" | "ledger_entry" | "account" | "ledger"
 */
import { z } from 'zod'
import api from './api'

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const EditLogOperationSchema = z.enum(['INSERT', 'UPDATE', 'DELETE'])
export type EditLogOperation = z.infer<typeof EditLogOperationSchema>

/**
 * Valid entity types accepted by the backend.
 * Sourced from GetEditLogQueryValidator in AccountingService.
 */
export const EditLogEntityTypeSchema = z.enum([
  'journal_entry',
  'journal_entry_line',
  'ledger_entry',
  'account',
  'ledger',
])
export type EditLogEntityType = z.infer<typeof EditLogEntityTypeSchema>

export const EditLogEntrySchema = z.object({
  id: z.string().uuid(),
  entityType: z.string(),
  entityId: z.string().uuid(),
  /** INSERT | UPDATE | DELETE */
  operation: z.string(),
  changedBy: z.string().uuid().nullable(),
  /** ISO 8601 timestamp */
  changedAt: z.string(),
  /** YYYY-YY format e.g. "2026-27" */
  fyYear: z.string().nullable(),
  changeReason: z.string().nullable(),
  requestId: z.string().nullable(),
  beforeState: z.string().nullable(),
  afterState: z.string().nullable(),
  /** ISO date (YYYY-MM-DD) for statutory 7-year retention */
  retentionUntil: z.string().nullable(),
})
export type EditLogEntry = z.infer<typeof EditLogEntrySchema>

export const EditLogPageSchema = z.object({
  page: z.number(),
  pageSize: z.number(),
  totalCount: z.number(),
  items: z.array(EditLogEntrySchema),
})
export type EditLogPage = z.infer<typeof EditLogPageSchema>

// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

export interface GetEditLogParams {
  fyYear?: string
  entityType?: EditLogEntityType
  page?: number
  pageSize?: number
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/**
 * GET /accounting/edit-log
 * Paginated MCA statutory edit log.
 * Permission: accounting.editlog.read
 */
export async function getEditLog(params: GetEditLogParams = {}): Promise<EditLogPage> {
  const { fyYear, entityType, page = 1, pageSize = 50 } = params
  const res = await api.get('/accounting/edit-log', {
    params: {
      ...(fyYear ? { fyYear } : {}),
      ...(entityType ? { entityType } : {}),
      page,
      pageSize,
    },
  })
  return EditLogPageSchema.parse(res.data)
}

/**
 * GET /accounting/edit-log/export?fyYear=2026-27
 * Downloads the full MCA edit log CSV for a financial year.
 * Returns a Blob for the caller to trigger a browser download.
 * Permission: accounting.editlog.read
 */
export async function exportEditLog(fyYear: string): Promise<Blob> {
  const res = await api.get('/accounting/edit-log/export', {
    params: { fyYear },
    responseType: 'blob',
  })
  return res.data as Blob
}
