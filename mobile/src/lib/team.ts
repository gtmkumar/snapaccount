/**
 * Team / Org-Invite API client — Phase 2 "org invite/join".
 *
 * Base path: /auth (routed through apiClient — see src/lib/api.ts SERVICE_PORTS).
 *
 * Two sides:
 *   OWNER side  (require auth; caller must be an ORG_ADMIN member):
 *     - listMembers   → GET    /auth/team
 *     - inviteMember  → POST   /auth/team/invite        (returns the raw token ONCE)
 *     - listInvites   → GET    /auth/team/invites
 *     - resendInvite  → POST   /auth/team/invites/{id}/resend
 *     - revokeInvite  → DELETE /auth/team/invites/{id}
 *   INVITEE side:
 *     - validateInviteToken → GET  /auth/invite/{token}          (PUBLIC, no auth)
 *     - acceptInvite        → POST /auth/invite/{token}/accept   (requires auth)
 *
 * SECURITY:
 *   - The raw invite `token` is a one-time secret returned only at create time.
 *     It lives transiently in screen state / a Share sheet — it is NEVER written
 *     to Expo SecureStore (that store is reserved for auth tokens).
 *   - validateInviteToken treats HTTP 410 (Gone) as a *valid* "this invite is no
 *     longer usable" response and returns { isValid: false, … } instead of throwing,
 *     so the Accept screen can render a clear message rather than a crash.
 */

import axios from 'axios';
import { apiClient } from './api';

// ─────────────────────────────────────────────────────────────────────────────
// Role catalogue — the three role NAMEs an owner can assign, with friendly labels.
// The label is resolved through i18n at the call site (key: mobile.team.roles.<NAME>);
// ROLE_LABEL_KEYS keeps the canonical fallback English text colocated with the names.
// ─────────────────────────────────────────────────────────────────────────────

export type InviteRoleName = 'ORG_MEMBER' | 'CA' | 'MANAGER';

export interface InviteRoleOption {
  name: InviteRoleName;
  /** i18n key under mobile.team.roles.* */
  labelKey: string;
  /** English fallback label. */
  fallbackLabel: string;
  isDefault?: boolean;
}

export const INVITE_ROLE_OPTIONS: InviteRoleOption[] = [
  { name: 'ORG_MEMBER', labelKey: 'mobile.team.roles.ORG_MEMBER', fallbackLabel: 'Team Member', isDefault: true },
  { name: 'CA', labelKey: 'mobile.team.roles.CA', fallbackLabel: 'Chartered Accountant' },
  { name: 'MANAGER', labelKey: 'mobile.team.roles.MANAGER', fallbackLabel: 'Manager' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Types — mirror the verified backend contracts exactly.
// ─────────────────────────────────────────────────────────────────────────────

export type MemberStatus = 'active' | 'suspended';

export interface TeamMember {
  userId: string;
  email: string;
  displayName: string | null;
  role: string;
  status: MemberStatus;
  modules: string[];
  joinedAt: string | null;
  lastActiveAt: string | null;
  photoUrl: string | null;
}

export interface TeamMemberPage {
  items: TeamMember[];
  totalCount: number;
}

export interface ListMembersParams {
  role?: string;
  status?: MemberStatus;
  page?: number;
  pageSize?: number;
}

export type OrgInviteStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

export interface OrgInvite {
  inviteId: string;
  email: string;
  role: string;
  invitedByUserId: string | null;
  invitedAt: string;
  expiresAt: string;
  status: OrgInviteStatus;
}

export interface InviteMemberInput {
  /** REQUIRED by the backend. */
  email: string;
  /** Role NAME (e.g. ORG_MEMBER | CA | MANAGER). */
  role: string;
  /** Optional but STRONGLY recommended so phone-login users can accept. */
  phone?: string;
  customMessage?: string;
}

export interface InviteCreatedResult {
  inviteId: string;
  /** The raw one-time invite token — returned ONCE, at create time only. */
  token: string;
  expiresAt: string;
}

export interface ResendInviteResult {
  expiresAt: string;
}

/** Successful preview of an invite (GET /auth/invite/{token}). */
export interface InvitePreviewValid {
  isValid: true;
  inviteId: string;
  organizationName: string;
  email: string;
  roleName: string;
  roleDisplayName: string;
  expiresAt: string;
}

/** Invalid/expired/revoked preview — HTTP 410 from the backend, surfaced cleanly. */
export interface InvitePreviewInvalid {
  isValid: false;
  message?: string;
}

export type InvitePreview = InvitePreviewValid | InvitePreviewInvalid;

export interface AcceptInviteResult {
  organizationId: string;
  organizationName: string;
  roleId: string;
  roleName: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// OWNER-side endpoints
// ─────────────────────────────────────────────────────────────────────────────

/** GET /auth/team — paginated member list for the caller's org. */
export async function listMembers(params: ListMembersParams = {}): Promise<TeamMemberPage> {
  const res = await apiClient.get<TeamMemberPage>('/auth/team', { params });
  return {
    items: res.data?.items ?? [],
    totalCount: res.data?.totalCount ?? 0,
  };
}

/**
 * POST /auth/team/invite — create an invite.
 * Returns the raw one-time `token` (only available here) so the caller can build
 * and Share an invite link. `email` is required; `phone` is optional but
 * recommended so phone-login invitees can satisfy the identity-match accept rule.
 */
export async function inviteMember(input: InviteMemberInput): Promise<InviteCreatedResult> {
  const body: InviteMemberInput = {
    email: input.email.trim(),
    role: input.role,
  };
  if (input.phone?.trim()) body.phone = input.phone.trim();
  if (input.customMessage?.trim()) body.customMessage = input.customMessage.trim();

  const res = await apiClient.post<InviteCreatedResult>('/auth/team/invite', body);
  return res.data;
}

/** GET /auth/team/invites — all invites for the caller's org. */
export async function listInvites(): Promise<OrgInvite[]> {
  const res = await apiClient.get<OrgInvite[]>('/auth/team/invites');
  return res.data ?? [];
}

/**
 * POST /auth/team/invites/{id}/resend — revoke the old token + issue a new one.
 * NOTE: the new raw token is NOT returned via this route, so resend only extends
 * the validity window; a fresh share-link is only available at create time.
 */
export async function resendInvite(inviteId: string): Promise<ResendInviteResult> {
  const res = await apiClient.post<ResendInviteResult>(`/auth/team/invites/${inviteId}/resend`);
  return res.data;
}

/** DELETE /auth/team/invites/{id} — revoke a pending invite (204). */
export async function revokeInvite(inviteId: string): Promise<void> {
  await apiClient.delete(`/auth/team/invites/${inviteId}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// INVITEE-side endpoints
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /auth/invite/{token} — PUBLIC preview, no auth required.
 *
 * On success (200) returns { isValid: true, … }. The backend signals an
 * invalid/expired/revoked invite with HTTP 410 + { isValid:false, message }; this
 * helper treats 410 as a normal (valid) "invalid invite" outcome and returns
 * { isValid:false, … } rather than throwing. Any other transport error still throws.
 */
export async function validateInviteToken(token: string): Promise<InvitePreview> {
  try {
    const res = await apiClient.get<InvitePreviewValid>(
      `/auth/invite/${encodeURIComponent(token)}`,
    );
    // Backend returns isValid:true; default it defensively if absent.
    return { ...res.data, isValid: res.data?.isValid ?? true };
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 410) {
      const data = err.response.data as { message?: string; isValid?: boolean } | undefined;
      return { isValid: false, message: data?.message };
    }
    throw err;
  }
}

/**
 * POST /auth/invite/{token}/accept — REQUIRES auth.
 * The signed-in user's email OR phone must match the invitation (else 403
 * "Invitation.IdentityMismatch"). Other failures: 409 AlreadyAccepted/Revoked/
 * Expired/AlreadyMember, 404 NotFound — all surface as thrown axios errors for
 * the caller to map to localized messages via getApiError().
 */
export async function acceptInvite(token: string): Promise<AcceptInviteResult> {
  const res = await apiClient.post<AcceptInviteResult>(
    `/auth/invite/${encodeURIComponent(token)}/accept`,
  );
  return res.data;
}
