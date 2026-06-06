/**
 * Onboarding / persona helpers — shared by every auth entry point (OTP, social,
 * password, 2FA) so the "which persona is this user, and do they still need to
 * onboard?" decision is made in exactly one place.
 *
 * The backend persona lives on auth.user_profile.user_type as UPPER_SNAKE
 * (BUSINESS_OWNER | EMPLOYEE | STAFF); the mobile app models it as the lowercase
 * `UserType` union. A user with no profile yet returns null → they have not
 * picked a persona and must go through PersonaSelection.
 */
import apiClient from './api';
import type { UserType } from '../store/authStore';

/** Map a backend UPPER_SNAKE user_type to the mobile lowercase UserType union. */
export function mapServerUserType(server?: string | null): UserType {
  switch (server) {
    case 'EMPLOYEE':
      return 'employee';
    case 'BUSINESS_OWNER':
      return 'business_owner';
    default:
      // STAFF (never a mobile customer) or absent → no customer persona yet.
      return null;
  }
}

/** Map the mobile UserType back to the backend UPPER_SNAKE value for writes. */
export function toServerUserType(t: UserType): 'BUSINESS_OWNER' | 'EMPLOYEE' | undefined {
  if (t === 'employee') return 'EMPLOYEE';
  if (t === 'business_owner') return 'BUSINESS_OWNER';
  return undefined;
}

/**
 * Fetch the authenticated user's persona from the backend (GET /auth/me).
 * Requires a session token to already be in the auth store. Returns null on any
 * failure so callers can fall back to their existing new/returning hint.
 */
export async function fetchServerUserType(): Promise<UserType | undefined> {
  try {
    const res = await apiClient.get<{ userType?: string | null }>('/auth/me');
    return mapServerUserType(res.data?.userType);
  } catch {
    return undefined; // network/parse failure — let the caller decide
  }
}
