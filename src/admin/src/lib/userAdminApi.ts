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
// Paginated user list (admin Users page)
// ─────────────────────────────────────────────────────────────────────────

const UserListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  isActive: z.boolean(),
  joinedAt: z.string(),
  organizationId: z.string().nullable().optional(),
  businessName: z.string().nullable().optional(),
  gstin: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
})
const PaginatedUsersSchema = z.object({
  items: z.array(UserListItemSchema),
  totalCount: z.number().int().nonnegative(),
  page: z.number().int(),
  pageSize: z.number().int(),
  totalPages: z.number().int().nonnegative(),
  hasNextPage: z.boolean(),
  hasPreviousPage: z.boolean(),
})
export type AdminUserListItem = z.infer<typeof UserListItemSchema>
export type AdminUsersPage = z.infer<typeof PaginatedUsersSchema>

export interface ListAdminUsersParams {
  page?: number
  pageSize?: number
  search?: string
  isActive?: boolean
}

export async function listAdminUsers(params: ListAdminUsersParams = {}): Promise<AdminUsersPage> {
  const res = await api.get('/auth/admin/users', { params })
  return PaginatedUsersSchema.parse(res.data)
}

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
