/**
 * Admin per-user views — backs UserDetailPage.
 *
 * Each section of the page is fetched independently so a single backing
 * service being down doesn't break the rest. The user-detail call returns
 * the primary organizationId which the GST returns call needs.
 */
import { z } from 'zod'
import api from './api'

// ─────────────────────────────────────────────────────────────────────────
// User detail (profile + business)
// ─────────────────────────────────────────────────────────────────────────

const UserBusinessProfileSchema = z.object({
  organizationId: z.string(),
  businessName: z.string(),
  gstin: z.string().nullable().optional(),
  panNumber: z.string().nullable().optional(),
  industryType: z.string().nullable().optional(),
  annualTurnoverInr: z.number().nullable().optional(),
  state: z.string().nullable().optional(),
})

const UserDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  isActive: z.boolean(),
  preferredLanguage: z.string().nullable().optional(),
  joinedAt: z.string(),
  business: UserBusinessProfileSchema.nullable().optional(),
})
export type UserDetail = z.infer<typeof UserDetailSchema>
export type UserBusinessProfile = z.infer<typeof UserBusinessProfileSchema>

export async function getAdminUserDetail(userId: string): Promise<UserDetail> {
  const res = await api.get(`/auth/admin/users/${userId}`)
  return UserDetailSchema.parse(res.data)
}

// ─────────────────────────────────────────────────────────────────────────
// User documents
// ─────────────────────────────────────────────────────────────────────────

const UserDocumentSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  status: z.string(),
  vendorName: z.string().nullable().optional(),
  amount: z.number().nullable().optional(),
  documentDate: z.string().nullable().optional(),
  uploadedAt: z.string(),
})
const UserDocumentsSchema = z.array(UserDocumentSchema)
export type UserDocument = z.infer<typeof UserDocumentSchema>

export async function getAdminUserDocuments(userId: string, limit = 20): Promise<UserDocument[]> {
  const res = await api.get(`/documents/admin/users/${userId}/documents`, { params: { limit } })
  return UserDocumentsSchema.parse(res.data)
}

// ─────────────────────────────────────────────────────────────────────────
// User GST returns (keyed by organisation, not user)
// ─────────────────────────────────────────────────────────────────────────

const UserGstReturnSchema = z.object({
  id: z.string(),
  returnType: z.string(),
  financialYear: z.string(),
  periodMonth: z.number().nullable().optional(),
  status: z.string(),
  netTaxPayable: z.number(),
  arnNumber: z.string().nullable().optional(),
  createdAt: z.string(),
})
const UserGstReturnsSchema = z.array(UserGstReturnSchema)
export type UserGstReturn = z.infer<typeof UserGstReturnSchema>

export async function getAdminOrgGstReturns(organizationId: string, limit = 20): Promise<UserGstReturn[]> {
  const res = await api.get(`/gst/admin/orgs/${organizationId}/returns`, { params: { limit } })
  return UserGstReturnsSchema.parse(res.data)
}
