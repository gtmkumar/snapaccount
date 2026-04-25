/**
 * Team / Auth service API client — Phase 6F Track F3
 * Uses auth service endpoints for user/team management.
 */
import { z } from 'zod'
import api from './api'

// ── Schemas ──────────────────────────────────────────────────────────────────

export const TeamMemberSchema = z.object({
  userId: z.string(),
  email: z.string(),
  displayName: z.string().nullable().optional(),
  role: z.string(),
  status: z.enum(['active', 'suspended', 'invited']),
  modules: z.array(z.string()).optional(),
  joinedAt: z.string().nullable().optional(),
  lastActiveAt: z.string().nullable().optional(),
  photoURL: z.string().nullable().optional(),
})
export type TeamMember = z.infer<typeof TeamMemberSchema>

export const TeamMemberListSchema = z.object({
  items: z.array(TeamMemberSchema),
  totalCount: z.number(),
})

export const PendingInviteSchema = z.object({
  inviteId: z.string(),
  email: z.string(),
  role: z.string(),
  invitedByUserId: z.string().nullable().optional(),
  invitedAt: z.string(),
  expiresAt: z.string(),
  status: z.enum(['pending', 'accepted', 'revoked', 'expired']),
})
export type PendingInvite = z.infer<typeof PendingInviteSchema>

export const PermissionsSchema = z.object({
  userId: z.string(),
  roles: z.array(z.string()),
  permissions: z.array(z.string()),
})
export type UserPermissions = z.infer<typeof PermissionsSchema>

// ── Params ───────────────────────────────────────────────────────────────────

export interface InviteTeamMemberParams {
  name: string
  email: string
  phone?: string
  role: string
  modules?: string[]
  permissions?: string[]
  customMessage?: string
}

export interface UpdateMemberParams {
  role?: string
  modules?: string[]
  permissions?: string[]
}

// ── API functions ─────────────────────────────────────────────────────────────

export async function listTeamMembers(params?: {
  role?: string
  status?: string
  page?: number
  pageSize?: number
}): Promise<{ items: TeamMember[]; totalCount: number }> {
  const res = await api.get('/auth/team', { params })
  return TeamMemberListSchema.parse(res.data)
}

export async function getTeamMember(userId: string): Promise<TeamMember> {
  const res = await api.get(`/auth/team/${userId}`)
  return TeamMemberSchema.parse(res.data)
}

export async function inviteTeamMember(params: InviteTeamMemberParams): Promise<{ inviteId: string }> {
  const res = await api.post('/auth/team/invite', params)
  return res.data as { inviteId: string }
}

export async function updateTeamMember(userId: string, params: UpdateMemberParams): Promise<void> {
  await api.patch(`/auth/team/${userId}`, params)
}

export async function suspendTeamMember(userId: string): Promise<void> {
  await api.post(`/auth/team/${userId}/suspend`)
}

export async function reactivateTeamMember(userId: string): Promise<void> {
  await api.post(`/auth/team/${userId}/reactivate`)
}

export async function removeTeamMember(userId: string): Promise<void> {
  await api.delete(`/auth/team/${userId}`)
}

export async function listPendingInvites(): Promise<PendingInvite[]> {
  const res = await api.get('/auth/team/invites')
  return z.array(PendingInviteSchema).parse(res.data)
}

export async function resendInvite(inviteId: string): Promise<void> {
  await api.post(`/auth/team/invites/${inviteId}/resend`)
}

export async function revokeInvite(inviteId: string): Promise<void> {
  await api.delete(`/auth/team/invites/${inviteId}`)
}

export async function getMyPermissions(): Promise<UserPermissions> {
  const res = await api.get('/auth/me/permissions')
  return PermissionsSchema.parse(res.data)
}

// Search (CommandPalette global search)
export async function globalSearch(q: string, types?: string): Promise<{
  query: string
  results: Array<{ type: string; id: string; title: string; subtitle?: string; url: string }>
  totalCount: number
}> {
  const res = await api.get('/search', { params: { q, types } })
  return res.data as {
    query: string
    results: Array<{ type: string; id: string; title: string; subtitle?: string; url: string }>
    totalCount: number
  }
}
