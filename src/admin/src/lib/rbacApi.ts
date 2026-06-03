/**
 * RBAC / Auth API client — Module 1
 * Org roles, permission catalog, grantable-permissions,
 * org members (real endpoints — replaces teamApi stubs), invitations, platform orgs.
 *
 * All calls go through the shared axios instance in ./api.ts
 */
import { z } from 'zod'
import api from './api'

// ─────────────────────────────────────────────────────────────────────────────
// Zod schemas
// ─────────────────────────────────────────────────────────────────────────────

// ── Roles ─────────────────────────────────────────────────────────────────────

export const OrgRoleSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  displayName: z.string(),
  description: z.string().nullable().optional(),
  isSystemRole: z.boolean(),
  isActive: z.boolean(),
  memberCount: z.number(),
  permissionNames: z.array(z.string()),
})
export type OrgRoleSummary = z.infer<typeof OrgRoleSummarySchema>

export const PermissionDetailSchema = z.object({
  permissionId: z.string(),
  name: z.string(),
  resource: z.string(),
  action: z.string(),
  description: z.string().nullable().optional(),
  // Allow/Deny (gap #2). Absent on older payloads → treated as allow.
  isAllowed: z.boolean().optional().default(true),
})
export type PermissionDetail = z.infer<typeof PermissionDetailSchema>

export const OrgRoleDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  displayName: z.string(),
  description: z.string().nullable().optional(),
  isSystemRole: z.boolean(),
  organizationId: z.string().nullable().optional(),
  isActive: z.boolean(),
  permissions: z.array(PermissionDetailSchema),
})
export type OrgRoleDetail = z.infer<typeof OrgRoleDetailSchema>

export const RolePermissionsSchema = z.object({
  roleId: z.string(),
  permissions: z.array(PermissionDetailSchema),
})
export type RolePermissions = z.infer<typeof RolePermissionsSchema>

// ── Permission catalog ─────────────────────────────────────────────────────────

export const CatalogPermissionSchema = z.object({
  id: z.string(),
  name: z.string(),
  resource: z.string(),
  action: z.string(),
  description: z.string().nullable().optional(),
  // Now always present — GET /auth/permissions returns these on every response.
  // The matrix endpoint (no ?includeInactive) also returns them; inactive perms
  // never appear there because the server filters them out by default.
  isActive: z.boolean(),
  roleCount: z.number(),
})
export type CatalogPermission = z.infer<typeof CatalogPermissionSchema>

export const PermissionModuleSchema = z.object({
  module: z.string(),
  displayName: z.string(),
  permissions: z.array(CatalogPermissionSchema),
})
export type PermissionModule = z.infer<typeof PermissionModuleSchema>

export const GrantablePermissionsSchema = z.object({
  grantablePermissionIds: z.array(z.string()),
})
export type GrantablePermissions = z.infer<typeof GrantablePermissionsSchema>

// ── Organizations (platform) ──────────────────────────────────────────────────

export const OrgListItemSchema = z.object({
  id: z.string(),
  businessName: z.string(),
  gstin: z.string().nullable().optional(),
  panNumber: z.string().nullable().optional(),
  businessType: z.string().nullable().optional(),
  isGstRegistered: z.boolean().optional(),
  isActive: z.boolean(),
  memberCount: z.number(),
  createdAt: z.string(),
  // Government Verification flag — present on GET /auth/admin/organizations responses.
  // Optional so older responses without the field remain valid.
  governmentVerificationEnabled: z.boolean().optional().default(false),
})
export type OrgListItem = z.infer<typeof OrgListItemSchema>

export const OrgListResponseSchema = z.object({
  items: z.array(OrgListItemSchema),
  totalCount: z.number(),
})

// ── Invite (public validation) ────────────────────────────────────────────────

export const InviteValidationSchema = z.object({
  inviteId: z.string(),
  organizationName: z.string(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  roleName: z.string(),
  roleDisplayName: z.string(),
  expiresAt: z.string(),
  isValid: z.boolean(),
  status: z.enum(['PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED']).optional(),
  accountExists: z.boolean().optional(),
})
export type InviteValidation = z.infer<typeof InviteValidationSchema>

export const InviteAcceptResponseSchema = z.object({
  organizationId: z.string(),
  organizationName: z.string(),
  roleId: z.string(),
  roleName: z.string(),
})
export type InviteAcceptResponse = z.infer<typeof InviteAcceptResponseSchema>

// ─────────────────────────────────────────────────────────────────────────────
// API param types
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateRoleParams {
  name: string
  displayName: string
  description?: string
}

export interface UpdateRoleParams {
  displayName: string
  description?: string
}

export interface CreateOrgParams {
  businessName: string
  gstin?: string
  panNumber?: string
  businessType?: string
}

export interface InviteAcceptParams {
  displayName?: string
  password?: string
  acceptedTerms?: boolean
}

// Catalog management
export interface CreatePermissionParams {
  name: string        // full dot-notation code, e.g. "gst.returns.file"
  description?: string
}

export interface UpdatePermissionParams {
  description?: string
  isActive?: boolean
}

// Error codes the server returns in response body
export type PermissionApiErrorCode = 'Permission.Duplicate' | 'Permission.InUse'

// ─────────────────────────────────────────────────────────────────────────────
// Roles
// ─────────────────────────────────────────────────────────────────────────────

export async function listOrgRoles(): Promise<OrgRoleSummary[]> {
  const res = await api.get('/auth/org/roles')
  return z.array(OrgRoleSummarySchema).parse(res.data)
}

export async function getOrgRole(roleId: string): Promise<OrgRoleDetail> {
  const res = await api.get(`/auth/org/roles/${roleId}`)
  return OrgRoleDetailSchema.parse(res.data)
}

export async function createOrgRole(params: CreateRoleParams): Promise<{ roleId: string }> {
  const res = await api.post('/auth/org/roles', params)
  return res.data as { roleId: string }
}

export async function updateOrgRole(roleId: string, params: UpdateRoleParams): Promise<void> {
  await api.put(`/auth/org/roles/${roleId}`, params)
}

export async function deleteOrgRole(roleId: string): Promise<void> {
  await api.delete(`/auth/org/roles/${roleId}`)
}

export async function getRolePermissions(roleId: string): Promise<RolePermissions> {
  const res = await api.get(`/auth/org/roles/${roleId}/permissions`)
  return RolePermissionsSchema.parse(res.data)
}

export async function setRolePermissions(
  roleId: string,
  permissionIds: string[],
  deniedPermissionIds: string[] = [],
): Promise<void> {
  await api.put(`/auth/org/roles/${roleId}/permissions`, { permissionIds, deniedPermissionIds })
}

// ─────────────────────────────────────────────────────────────────────────────
// Permission catalog
// ─────────────────────────────────────────────────────────────────────────────

/**
 * List the permission catalog grouped by module.
 *
 * @param includeInactive  When true, passes ?includeInactive=true so the server
 *   returns active + retired permissions.  The catalog management page uses this.
 *   The role-permission matrix MUST NOT pass this flag so retired permissions
 *   vanish from it automatically (server default = active-only).
 */
export async function listPermissions(includeInactive?: boolean): Promise<PermissionModule[]> {
  const params = includeInactive ? { includeInactive: true } : undefined
  const res = await api.get('/auth/permissions', { params })
  return z.array(PermissionModuleSchema).parse(res.data)
}

// ── Permission meta: configurable Resource/Action type catalogs (gap #3) ────────

export const TypeEntrySchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
})
export type TypeEntry = z.infer<typeof TypeEntrySchema>

export const PermissionMetaSchema = z.object({
  resourceTypes: z.array(TypeEntrySchema),
  actionTypes: z.array(TypeEntrySchema),
})
export type PermissionMeta = z.infer<typeof PermissionMetaSchema>

/** Resource + action type catalogs that permissions are composed from (gap #3). */
export async function getPermissionMeta(): Promise<PermissionMeta> {
  const res = await api.get('/auth/permission-meta')
  return PermissionMetaSchema.parse(res.data)
}

export interface UpdateTypeParams { name: string; description?: string | null; isActive: boolean }

export async function updateResourceType(id: string, params: UpdateTypeParams): Promise<void> {
  await api.put(`/auth/resource-types/${id}`, params)
}

export async function updateActionType(id: string, params: UpdateTypeParams): Promise<void> {
  await api.put(`/auth/action-types/${id}`, params)
}

export async function getGrantablePermissions(): Promise<GrantablePermissions> {
  const res = await api.get('/auth/me/grantable-permissions')
  return GrantablePermissionsSchema.parse(res.data)
}

// Catalog management mutations (platform.permissions.manage)

export async function createPermission(params: CreatePermissionParams): Promise<CatalogPermission> {
  const res = await api.post('/auth/permissions', params)
  return CatalogPermissionSchema.parse(res.data)
}

export async function updatePermission(id: string, params: UpdatePermissionParams): Promise<void> {
  await api.put(`/auth/permissions/${id}`, params)
}

export async function deletePermission(id: string): Promise<void> {
  await api.delete(`/auth/permissions/${id}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Platform Organizations (SUPER_ADMIN)
// ─────────────────────────────────────────────────────────────────────────────

export async function listOrganizations(params?: {
  page?: number
  pageSize?: number
  search?: string
  isActive?: boolean
}): Promise<{ items: OrgListItem[]; totalCount: number }> {
  const res = await api.get('/auth/admin/organizations', { params })
  return OrgListResponseSchema.parse(res.data)
}

export async function createOrganization(params: CreateOrgParams): Promise<{ organizationId: string }> {
  const res = await api.post('/auth/admin/organizations', params)
  return res.data as { organizationId: string }
}

export async function suspendOrganization(orgId: string): Promise<void> {
  await api.post(`/auth/admin/organizations/${orgId}/suspend`)
}

// ── Org settings (SUPER_ADMIN / platform.orgs.write) ─────────────────────────

export const OrgSettingsResponseSchema = z.object({
  organizationId: z.string(),
  governmentVerificationEnabled: z.boolean(),
})
export type OrgSettingsResponse = z.infer<typeof OrgSettingsResponseSchema>

export interface UpdateOrgSettingsParams {
  governmentVerificationEnabled: boolean
}

/**
 * PATCH /auth/admin/organizations/{orgId}/settings
 * Updates per-org platform settings.  Gated by platform.orgs.write (SUPER_ADMIN).
 */
export async function updateOrgSettings(
  orgId: string,
  params: UpdateOrgSettingsParams,
): Promise<OrgSettingsResponse> {
  const res = await api.patch(`/auth/admin/organizations/${orgId}/settings`, params)
  return OrgSettingsResponseSchema.parse(res.data)
}

// ─────────────────────────────────────────────────────────────────────────────
// Platform Org — members + invites (SUPER_ADMIN, platform.orgs.read)
// ─────────────────────────────────────────────────────────────────────────────

// Shape matches AuthService OrgMemberDto (GET /auth/admin/organizations/{id}/members):
// role = role name, status = "active" | "suspended".
export const OrgMemberSchema = z.object({
  userId: z.string(),
  email: z.string(),
  displayName: z.string().nullable().optional(),
  role: z.string(),
  status: z.string(),
  modules: z.array(z.string()).optional(),
  joinedAt: z.string().nullable().optional(),
  lastActiveAt: z.string().nullable().optional(),
  photoUrl: z.string().nullable().optional(),
})
export type OrgMember = z.infer<typeof OrgMemberSchema>

export const OrgMembersResponseSchema = z.object({
  items: z.array(OrgMemberSchema),
  totalCount: z.number(),
})

// Shape matches AuthService OrgInviteDto (GET /auth/admin/organizations/{id}/invites):
// role = role name, status is lowercase ("pending" | "accepted" | "revoked" | "expired").
export const OrgInviteSchema = z.object({
  inviteId: z.string(),
  email: z.string().nullable().optional(),
  role: z.string(),
  invitedByUserId: z.string().nullable().optional(),
  invitedAt: z.string().nullable().optional(),
  expiresAt: z.string(),
  status: z.string(),
})
export type OrgInvite = z.infer<typeof OrgInviteSchema>

export async function listOrgMembers(
  orgId: string,
  params?: { page?: number; pageSize?: number },
): Promise<{ items: OrgMember[]; totalCount: number }> {
  const res = await api.get(`/auth/admin/organizations/${orgId}/members`, { params })
  return OrgMembersResponseSchema.parse(res.data)
}

export async function listOrgInvites(orgId: string): Promise<OrgInvite[]> {
  const res = await api.get(`/auth/admin/organizations/${orgId}/invites`)
  return z.array(OrgInviteSchema).parse(res.data)
}

// ─────────────────────────────────────────────────────────────────────────────
// Invite acceptance (public)
// ─────────────────────────────────────────────────────────────────────────────

export async function validateInviteToken(token: string): Promise<InviteValidation> {
  const res = await api.get(`/auth/invite/${token}`)
  return InviteValidationSchema.parse(res.data)
}

export async function acceptInvite(token: string, params: InviteAcceptParams): Promise<InviteAcceptResponse> {
  const res = await api.post(`/auth/invite/${token}/accept`, params)
  return InviteAcceptResponseSchema.parse(res.data)
}
