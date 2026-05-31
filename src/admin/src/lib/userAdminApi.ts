/**
 * Admin per-user views — backs UserDetailPage + AddUserDialog (Increment 1.3).
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
  userType: z.string().nullable().optional(),
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
  /** Customer user-type filter (BUSINESS_OWNER | EMPLOYEE); omit for all customers. */
  userType?: 'BUSINESS_OWNER' | 'EMPLOYEE'
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

/** Personal KYC profile (PAN is masked, never the full value). */
const UserProfileSchema = z.object({
  panMasked: z.string().nullable().optional(),
  aadhaarLast4: z.string().nullable().optional(),
  dateOfBirth: z.string().nullable().optional(),
  gender: z.string().nullable().optional(),
  addressLine1: z.string().nullable().optional(),
  addressLine2: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  pincode: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
})

const UserDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  isActive: z.boolean(),
  preferredLanguage: z.string().nullable().optional(),
  userType: z.string().nullable().optional(),
  joinedAt: z.string(),
  // Role assignment (edit prefill)
  roleId: z.string().nullable().optional(),
  roleScope: z.enum(['platform', 'org']).nullable().optional(),
  roleOrganizationId: z.string().nullable().optional(),
  overridePermissionIds: z.array(z.string()).default([]),
  deniedOverridePermissionIds: z.array(z.string()).default([]),
  profile: UserProfileSchema.nullable().optional(),
  business: UserBusinessProfileSchema.nullable().optional(),
})
export type UserDetail = z.infer<typeof UserDetailSchema>
export type UserBusinessProfile = z.infer<typeof UserBusinessProfileSchema>
export type UserProfileDetail = z.infer<typeof UserProfileSchema>

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

// ─────────────────────────────────────────────────────────────────────────
// Increment 1.3 — Add User (admin platform user creation)
// ─────────────────────────────────────────────────────────────────────────

export const AssignableRoleSchema = z.object({
  id: z.string(),
  name: z.string(),
  displayName: z.string(),
  isSystemRole: z.boolean(),
  permissionCount: z.number(),
  // Full permission list included so the dialog can show the inherited-perms preview.
  permissions: z.array(z.object({
    permissionId: z.string(),
    name: z.string(),
  })).optional(),
})
export type AssignableRole = z.infer<typeof AssignableRoleSchema>

export const CreateAdminUserResponseSchema = z.object({
  userId: z.string(),
  email: z.string().nullable().optional(),
  scope: z.enum(['platform', 'org']),
  roleId: z.string(),
  grantedPermissions: z.array(z.string()),
})
export type CreateAdminUserResponse = z.infer<typeof CreateAdminUserResponseSchema>

/** Optional KYC/profile fields captured at create/edit. PAN is sent only when (re)entered. */
export interface AdminUserProfileInput {
  panNumber?: string
  aadhaarLast4?: string
  dateOfBirth?: string   // ISO date (yyyy-mm-dd)
  gender?: string
  addressLine1?: string
  addressLine2?: string
  city?: string
  state?: string
  pincode?: string
  country?: string
}

export interface CreateAdminUserParams {
  fullName: string
  email?: string
  phoneNumber?: string
  scope: 'platform' | 'org'
  roleId: string
  organizationId?: string
  permissionIds?: string[]
  initialPassword?: string
  preferredLanguage?: string
  userType?: string
  isActive?: boolean
  profile?: AdminUserProfileInput
}

/** PUT body — email/phone/scope/org are immutable and not sent. */
export interface UpdateAdminUserParams {
  fullName: string
  roleId: string
  permissionIds?: string[]
  /** Per-user deny overrides (is_allowed=false) — subtract a role-granted perm (gap #2). */
  deniedPermissionIds?: string[]
  preferredLanguage?: string
  userType?: string
  isActive?: boolean
  profile?: AdminUserProfileInput
}

export interface UpdateAdminUserResponse {
  userId: string
  scope: 'platform' | 'org'
  roleId: string
  grantedPermissions: string[]
}

export type AdminUserApiErrorCode =
  | 'User.EmailConflict'
  | 'User.PhoneConflict'
  | 'Role.PrivilegeEscalation'
  | 'User.PrivilegeEscalation'
  | 'User.OrgMismatch'
  | 'User.OrgRequired'
  | 'User.InvalidPermissions'
  | 'Role.PlatformScopeRestricted'
  | 'User.NoRoleAssignment'
  | 'User.SelfDelete'
  | 'User.LastAdmin'
  | 'User.NotFound'

export async function listAssignableRoles(scope: 'platform' | 'org'): Promise<AssignableRole[]> {
  const res = await api.get('/auth/admin/assignable-roles', { params: { scope } })
  return z.array(AssignableRoleSchema).parse(res.data)
}

export async function createAdminUser(params: CreateAdminUserParams): Promise<CreateAdminUserResponse> {
  const res = await api.post('/auth/admin/users', params)
  return CreateAdminUserResponseSchema.parse(res.data)
}

export async function updateAdminUser(
  userId: string,
  params: UpdateAdminUserParams,
): Promise<UpdateAdminUserResponse> {
  const res = await api.put(`/auth/admin/users/${userId}`, params)
  return res.data as UpdateAdminUserResponse
}

export async function deleteAdminUser(userId: string): Promise<void> {
  await api.delete(`/auth/admin/users/${userId}`)
}

/**
 * Toggles a platform user's active state (reversible access lock — roles and
 * permission overrides are preserved). Used by the Team › Staff row actions.
 * Server guards: self-deactivation (User.SelfDelete) and last super-admin
 * (User.LastAdmin) both return 409.
 */
export async function setAdminUserActive(userId: string, isActive: boolean): Promise<void> {
  await api.post(`/auth/admin/users/${userId}/${isActive ? 'activate' : 'deactivate'}`)
}
