/**
 * Pending org-invite token persistence — GAP-065.
 *
 * Problem: tapping `snapaccount://invite/{token}` while logged OUT lands on
 * AcceptInviteScreen in the Auth stack, but completing sign-in remounts the
 * navigation tree (RootNavigator swaps AuthNavigator → AppNavigator), dropping
 * the route param and stranding the user without the invite.
 *
 * Fix: the token is persisted here before the user is sent into the auth flow,
 * and RootNavigator resumes the AcceptInvite screen (with the token) once
 * `isAuthenticated` flips to true.
 *
 * SECURITY: an invite token is a bearer capability (it joins an org), so it is
 * held in expo-secure-store (iOS Keychain / Android Keystore), never
 * AsyncStorage. It is cleared as soon as it is consumed for resume; the
 * AcceptInvite screen also clears it on accept success / decline.
 *
 * Tokens are 32-byte url-safe values minted by the backend
 * (ResendInvitationCommand mints a FRESH token on every resend, so a stale
 * persisted token simply fails validation with a localized error).
 */

import * as SecureStore from 'expo-secure-store';

const PENDING_INVITE_KEY = 'snapaccount.pendingInviteToken';

/** Basic shape guard — backend invite tokens are url-safe, no whitespace. */
function isPlausibleToken(token: string): boolean {
  const trimmed = token.trim();
  return trimmed.length > 0 && trimmed.length <= 256 && !/\s/.test(trimmed);
}

/**
 * Persist an invite token so it survives the auth flow.
 * No-op for blank/implausible values. Failures are swallowed (non-fatal:
 * the user can always re-enter the code manually on AcceptInviteScreen).
 */
export async function storePendingInviteToken(token: string): Promise<void> {
  if (!isPlausibleToken(token)) return;
  try {
    await SecureStore.setItemAsync(PENDING_INVITE_KEY, token.trim());
  } catch {
    // Non-fatal — manual code entry remains available.
  }
}

/** Read the pending token without clearing it (returns null when absent). */
export async function peekPendingInviteToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(PENDING_INVITE_KEY);
  } catch {
    return null;
  }
}

/**
 * Read AND clear the pending token (single-shot consume).
 * Used by the post-auth resume path so a failed accept cannot loop the user
 * back into the invite screen forever.
 */
export async function consumePendingInviteToken(): Promise<string | null> {
  try {
    const token = await SecureStore.getItemAsync(PENDING_INVITE_KEY);
    if (token) await SecureStore.deleteItemAsync(PENDING_INVITE_KEY);
    return token;
  } catch {
    return null;
  }
}

/** Explicitly clear the pending token (accept success / decline / sign-out). */
export async function clearPendingInviteToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(PENDING_INVITE_KEY);
  } catch {
    // Non-fatal.
  }
}
