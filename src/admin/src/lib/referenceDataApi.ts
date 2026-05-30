/**
 * Reference Data (master-data) API client — Module 1, Increment 1.4
 *
 * Manages the lookup data behind app dropdowns:
 *   LANGUAGE | USER_TYPE | GENDER | STATE | COUNTRY
 *
 * Phase B note: listReferenceData() is intentionally reusable — dropdown consumers
 * call it with activeOnly=true (the server default) to get only active entries.
 *
 * All calls go through the shared axios instance in ./api.ts.
 */
import { z } from 'zod'
import api from './api'

// ─────────────────────────────────────────────────────────────────────────────
// Category enum
// ─────────────────────────────────────────────────────────────────────────────

export const REFDATA_CATEGORIES = ['LANGUAGE', 'USER_TYPE', 'GENDER', 'STATE', 'COUNTRY'] as const
export type RefDataCategory = typeof REFDATA_CATEGORIES[number]

// ─────────────────────────────────────────────────────────────────────────────
// Zod schemas
// ─────────────────────────────────────────────────────────────────────────────

export const RefDataItemSchema = z.object({
  id: z.string(),
  category: z.enum(REFDATA_CATEGORIES),
  code: z.string(),
  name: z.string(),
  parentCode: z.string().nullable().optional(),
  isActive: z.boolean(),
  sortOrder: z.number(),
})
export type RefDataItem = z.infer<typeof RefDataItemSchema>

// ─────────────────────────────────────────────────────────────────────────────
// Param / response types
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateRefDataParams {
  category: RefDataCategory
  code: string
  name: string
  parentCode?: string
  sortOrder?: number
  isActive?: boolean
}

export interface UpdateRefDataParams {
  name?: string
  parentCode?: string
  sortOrder?: number
  isActive?: boolean
}

export type RefDataApiErrorCode =
  | 'ReferenceData.Duplicate'
  | 'ReferenceData.InUse'
  | 'ReferenceData.ParentCodeRequired'
  | 'ReferenceData.InvalidParentCode'

// ─────────────────────────────────────────────────────────────────────────────
// Client-side code validation (mirrors server rule ^[A-Za-z0-9_-]{1,20}$)
// ─────────────────────────────────────────────────────────────────────────────

export const CODE_REGEX = /^[A-Za-z0-9_-]{1,20}$/

// ─────────────────────────────────────────────────────────────────────────────
// Query keys (exported so pages can invalidate consistently)
// ─────────────────────────────────────────────────────────────────────────────

export const refDataQueryKey = (category: RefDataCategory, activeOnly?: boolean) =>
  ['refdata', category, { activeOnly: activeOnly ?? false }] as const

// ─────────────────────────────────────────────────────────────────────────────
// API functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * List reference data for a category.
 *
 * @param category  The category to fetch.
 * @param activeOnly  When true passes ?activeOnly=true — use this for dropdown consumers.
 *                    Management page passes false (server default) to see inactive entries too.
 */
export async function listReferenceData(
  category: RefDataCategory,
  activeOnly = false,
): Promise<RefDataItem[]> {
  const params: Record<string, string | boolean> = { category }
  if (activeOnly) params.activeOnly = true
  const res = await api.get('/auth/reference-data', { params })
  return z.array(RefDataItemSchema).parse(res.data)
}

export async function createRefDataEntry(params: CreateRefDataParams): Promise<RefDataItem> {
  const res = await api.post('/auth/reference-data', params)
  return RefDataItemSchema.parse(res.data)
}

export async function updateRefDataEntry(id: string, params: UpdateRefDataParams): Promise<void> {
  await api.put(`/auth/reference-data/${id}`, params)
}

export async function deleteRefDataEntry(id: string): Promise<void> {
  await api.delete(`/auth/reference-data/${id}`)
}
