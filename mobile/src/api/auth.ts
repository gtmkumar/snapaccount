/**
 * Auth Service API — typed client functions for the newly-shipped auth features.
 * Base path: /auth (routed through apiClient — see src/lib/api.ts SERVICE_PORTS).
 *
 * Covers:
 *  - User preferences (language, theme, notification channels)
 *  - Logged-in device management (list + revoke)
 *  - KYC (PAN verify, Aadhaar OTP send/verify)
 *  - 2FA challenge at login
 *
 * SECURITY:
 *  - Aadhaar is masked/never stored in full on device — only the 12-digit value is
 *    sent transiently to /auth/me/kyc/aadhaar/otp/send and is never persisted.
 *  - Session tokens returned by the 2FA challenge are handled exactly like the
 *    OTP/password flows (stored via the SecureStore-backed auth store).
 */

import { apiClient } from '../lib/api';

// ─────────────────────────────────────────────────────────────────────────────
// Preferences
// ─────────────────────────────────────────────────────────────────────────────

export type ThemePreferenceApi = 'LIGHT' | 'DARK' | 'SYSTEM';

export interface UserPreferences {
  preferredLanguage: string;
  theme: ThemePreferenceApi;
  pushNotificationsEnabled: boolean;
  smsNotificationsEnabled: boolean;
  emailNotificationsEnabled: boolean;
  whatsappNotificationsEnabled: boolean;
}

/** GET /auth/me/preferences */
export async function getPreferences(): Promise<UserPreferences> {
  const res = await apiClient.get<UserPreferences>('/auth/me/preferences');
  return res.data;
}

/** PATCH /auth/me/preferences — partial update, returns 204. */
export async function updatePreferences(
  patch: Partial<UserPreferences>,
): Promise<void> {
  await apiClient.patch('/auth/me/preferences', patch);
}

// ─────────────────────────────────────────────────────────────────────────────
// Devices
// ─────────────────────────────────────────────────────────────────────────────

export interface DeviceDto {
  id: string;
  deviceId: string;
  deviceName?: string;
  platform: string;
  osVersion?: string;
  appVersion?: string;
  isActive: boolean;
  lastActiveAt?: string;
  boundAt: string;
}

/** GET /auth/devices */
export async function getDevices(): Promise<DeviceDto[]> {
  const res = await apiClient.get<DeviceDto[]>('/auth/devices');
  return res.data ?? [];
}

/** DELETE /auth/devices/{id} — revoke a device session, returns 204. */
export async function revokeDevice(id: string): Promise<void> {
  await apiClient.delete(`/auth/devices/${id}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// KYC
// ─────────────────────────────────────────────────────────────────────────────

export type KycStatus = 'VERIFIED' | 'FAILED' | 'PENDING' | string;

export interface PanVerifyResult {
  status: KycStatus;
  verifiedAt?: string | null;
}

/** POST /auth/me/kyc/pan/verify */
export async function verifyPan(
  pan: string,
  name: string,
): Promise<PanVerifyResult> {
  const res = await apiClient.post<PanVerifyResult>('/auth/me/kyc/pan/verify', {
    pan,
    name,
  });
  return res.data;
}

export interface AadhaarOtpSendResult {
  transactionId: string;
}

/**
 * POST /auth/me/kyc/aadhaar/otp/send
 * @param aadhaar 12-digit Aadhaar — spaces/hyphens are stripped before sending.
 */
export async function sendAadhaarOtp(
  aadhaar: string,
): Promise<AadhaarOtpSendResult> {
  const normalized = aadhaar.replace(/[\s-]/g, '');
  const res = await apiClient.post<AadhaarOtpSendResult>(
    '/auth/me/kyc/aadhaar/otp/send',
    { aadhaar: normalized },
  );
  return res.data;
}

export interface AadhaarOtpVerifyResult {
  status: KycStatus;
  verifiedAt?: string | null;
}

/** POST /auth/me/kyc/aadhaar/otp/verify */
export async function verifyAadhaarOtp(
  transactionId: string,
  otp: string,
): Promise<AadhaarOtpVerifyResult> {
  const res = await apiClient.post<AadhaarOtpVerifyResult>(
    '/auth/me/kyc/aadhaar/otp/verify',
    { transactionId, otp },
  );
  return res.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2FA at login
// ─────────────────────────────────────────────────────────────────────────────

export interface TwoFactorChallengeResult {
  token: string;
  userId: string;
  refreshToken?: string | null;
  refreshExpiresAt?: string | null;
}

/** POST /auth/2fa/challenge — exchange a TOTP code + challengeToken for a session. */
export async function complete2faChallenge(
  challengeToken: string,
  code: string,
): Promise<TwoFactorChallengeResult> {
  const res = await apiClient.post<TwoFactorChallengeResult>('/auth/2fa/challenge', {
    challengeToken,
    code,
  });
  return res.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Context refresh (GAP-007 / BUG-5)
// ─────────────────────────────────────────────────────────────────────────────

export interface RefreshContextResponse {
  /** New HS256 session JWT with up-to-date RBAC + org claims. */
  accessToken: string;
  /** UTC ISO-8601 expiry of the new token (e.g. "2026-06-10T10:30:00Z"). */
  expiresAt: string;
}

/**
 * POST /auth/token/refresh-context [Authorize]
 *
 * GAP-007 / BUG-5: Re-issues the session JWT carrying the caller's current
 * RBAC + OrganizationId claims — without rotating the opaque refresh token.
 *
 * Call this immediately after:
 *   - `POST /auth/organizations` completes (business-onboarding wizard finish)
 *   - `POST /auth/invite/{token}/accept` completes (team invite accept)
 *
 * The backend re-resolves all RBAC claims from the DB, so the returned access
 * token will include the new OrganizationId that was created/joined during the
 * triggering operation. Subsequent org-scoped calls (e.g. POST /auth/team/invite)
 * will succeed without requiring a full sign-out and re-login.
 *
 * No request body. Uses the current Bearer token from the auth store interceptor.
 * Throws on HTTP error — callers should catch and treat as non-fatal.
 */
export async function refreshContext(): Promise<RefreshContextResponse> {
  const res = await apiClient.post<RefreshContextResponse>('/auth/token/refresh-context');
  return res.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// Org settings (Task #18 / GAP-060rem — Edit Business)
// ─────────────────────────────────────────────────────────────────────────────

/** Shape returned by GET /auth/org/settings (SEC-056 self-service settings). */
export interface OrgSettings {
  name: string;
  gstin?: string | null;
  phone?: string | null;
  email?: string | null;
  logoUrl?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
}

/**
 * Mutable subset accepted by PATCH /auth/org/settings.
 * NOTE (backend contract): name + GSTIN are NOT mutable through this
 * endpoint — only address/logo fields. The Edit Business screen renders
 * name/GSTIN read-only until a dedicated endpoint exists.
 */
export interface OrgSettingsPatch {
  logoUrl?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
}

/** GET /auth/org/settings — current org's self-service settings. */
export async function getOrgSettings(): Promise<OrgSettings> {
  const res = await apiClient.get<OrgSettings>('/auth/org/settings');
  return res.data;
}

/** PATCH /auth/org/settings — update mutable org settings (204 No Content). */
export async function patchOrgSettings(patch: OrgSettingsPatch): Promise<void> {
  await apiClient.patch('/auth/org/settings', patch);
}
