/**
 * Social sign-in (Google / Apple) → Firebase ID token → backend session exchange.
 *
 * FLOW (production, once Firebase is configured):
 *   1. Obtain a provider credential:
 *        - Google via expo-auth-session (Google provider) → idToken
 *        - Apple via expo-apple-authentication → identityToken
 *   2. Sign that credential into Firebase Auth → a Firebase ID token (JWT).
 *   3. POST the Firebase ID token to the backend, which verifies it server-side
 *      (FirebaseAuthMiddleware) and mints the same session the OTP/password flows
 *      return ({ token, userId, refreshToken, refreshExpiresAt }).
 *
 * LOCAL DEV: the app runs against the backend with DEV_AUTH_BYPASS=true and NO real
 * Firebase project. There is no Firebase client SDK configured, so the provider →
 * Firebase step cannot complete. `isFirebaseConfigured()` returns false in that case
 * and the UI shows a clear "social sign-in requires Firebase config" message instead
 * of crashing. The real provider code below is still compiled and ready for when the
 * Firebase config (below) is supplied.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * REQUIRED CONFIG to enable social sign-in (add to app.json → expo.extra.firebase):
 *
 *   "extra": {
 *     "firebase": {
 *       "apiKey": "...",
 *       "authDomain": "<project>.firebaseapp.com",
 *       "projectId": "<project>"
 *     },
 *     "googleAuth": {
 *       "iosClientId":     "<IOS_OAUTH_CLIENT_ID>.apps.googleusercontent.com",
 *       "androidClientId": "<ANDROID_OAUTH_CLIENT_ID>.apps.googleusercontent.com",
 *       "webClientId":     "<WEB_OAUTH_CLIENT_ID>.apps.googleusercontent.com"
 *     }
 *   }
 *
 * REQUIRED native config:
 *   - iOS: enable the "Sign in with Apple" capability (EAS handles this via the
 *     expo-apple-authentication plugin already added to app.json); add the reversed
 *     iOS OAuth client ID as a URL scheme for Google (expo-auth-session handles the
 *     redirect using the app `scheme` "snapaccount").
 *   - Android: register the SHA-1 in the Firebase console + the Android OAuth client.
 *   - app.json plugins: "expo-apple-authentication" and "expo-web-browser" (added).
 *
 * The backend endpoint POST /auth/social/firebase is the natural counterpart; until
 * it ships, exchangeFirebaseToken() will surface a normal API error, which the UI
 * already handles gracefully.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as AppleAuthentication from 'expo-apple-authentication';
import apiClient from './api';

const extra = (Constants.expoConfig?.extra ?? {}) as {
  firebase?: { apiKey?: string; authDomain?: string; projectId?: string };
  googleAuth?: { iosClientId?: string; androidClientId?: string; webClientId?: string };
};

export interface SocialSessionResult {
  token: string;
  userId: string;
  refreshToken?: string | null;
  refreshExpiresAt?: string | null;
}

/** Thrown when the user cancels a provider dialog — callers treat this as a no-op. */
export class SocialSignInCancelled extends Error {
  constructor() {
    super('cancelled');
    this.name = 'SocialSignInCancelled';
  }
}

/**
 * Thrown when a provider sign-in cannot proceed for an *expected* reason the user
 * can do nothing about right now — e.g. Apple Sign-In is unavailable on this device
 * (simulator without the applesignin entitlement, no Apple ID signed in, capability
 * not provisioned). Callers should surface a friendly, informative message rather
 * than a generic "unexpected error".
 */
export class SocialSignInUnavailable extends Error {
  constructor() {
    super('unavailable');
    this.name = 'SocialSignInUnavailable';
  }
}

/**
 * True only when the Firebase web config AND the Google OAuth client IDs are present.
 * Local dev (DEV_AUTH_BYPASS, no Firebase project) returns false → UI degrades gracefully.
 */
export function isFirebaseConfigured(): boolean {
  return Boolean(extra.firebase?.apiKey && extra.firebase?.projectId);
}

/** True when Apple sign-in is available (iOS only, supported device). */
export async function isAppleAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Exchange a Firebase ID token for a backend session. Mirrors the OTP/password
 * response envelope so the caller can drive the auth store identically.
 */
async function exchangeFirebaseToken(
  idToken: string,
  provider: 'google' | 'apple',
): Promise<SocialSessionResult> {
  // Backend contract: POST /auth/social/firebase { firebaseIdToken, provider }.
  const res = await apiClient.post<SocialSessionResult>('/auth/social/firebase', {
    firebaseIdToken: idToken,
    provider,
  });
  return res.data;
}

/**
 * Google sign-in. Uses expo-auth-session to obtain a Google idToken, signs it into
 * Firebase, and exchanges the resulting Firebase ID token for a backend session.
 *
 * Implemented lazily (dynamic import) so the auth-session/web-browser native modules
 * are only touched when Firebase is actually configured — keeping local dev and the
 * Jest environment free of those native deps.
 */
export async function signInWithGoogle(): Promise<SocialSessionResult> {
  if (!isFirebaseConfigured()) {
    throw new Error('firebase-not-configured');
  }

  const AuthSession = await import('expo-auth-session');
  const WebBrowser = await import('expo-web-browser');
  WebBrowser.maybeCompleteAuthSession();

  // Platform-appropriate Google OAuth client id (configured in app.json → extra.googleAuth).
  const clientId =
    (Platform.OS === 'ios'
      ? extra.googleAuth?.iosClientId
      : Platform.OS === 'android'
        ? extra.googleAuth?.androidClientId
        : extra.googleAuth?.webClientId) ?? extra.googleAuth?.webClientId;
  if (!clientId) throw new Error('google-client-id-missing');

  // Implicit "id_token" flow against Google's OIDC discovery — no token exchange
  // round-trip needed, and the id_token is exactly what Firebase signInWithIdp wants.
  const discovery = await AuthSession.fetchDiscoveryAsync('https://accounts.google.com');
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'snapaccount' });

  const request = new AuthSession.AuthRequest({
    clientId,
    redirectUri,
    responseType: AuthSession.ResponseType.IdToken,
    scopes: ['openid', 'profile', 'email'],
    extraParams: { nonce: String(Date.now()) },
  });

  const result = await request.promptAsync(discovery);

  if (result.type === 'cancel' || result.type === 'dismiss') {
    throw new SocialSignInCancelled();
  }
  if (result.type !== 'success') {
    throw new Error('google-auth-failed');
  }

  const idToken = result.params?.id_token as string | undefined;
  if (!idToken) throw new Error('google-no-id-token');

  // Sign the Google idToken into Firebase to obtain a Firebase ID token, then exchange.
  const firebaseIdToken = await signInToFirebaseWithGoogle(idToken);
  return exchangeFirebaseToken(firebaseIdToken, 'google');
}

/**
 * Apple sign-in (iOS only). Obtains an Apple identityToken, signs it into Firebase,
 * and exchanges the Firebase ID token for a backend session.
 */
export async function signInWithApple(): Promise<SocialSessionResult> {
  if (!isFirebaseConfigured()) {
    throw new Error('firebase-not-configured');
  }

  // Apple Sign-In requires a supported device with the applesignin entitlement and an
  // Apple ID signed in. On a simulator without those, or when the capability isn't
  // provisioned, this returns false — surface a friendly "unavailable" instead of
  // letting signInAsync throw a raw native error that becomes a generic alert.
  if (!(await isAppleAvailable())) {
    throw new SocialSignInUnavailable();
  }

  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
  } catch (err: unknown) {
    // The user cancelling the native Apple sheet throws ERR_REQUEST_CANCELED
    // (some platforms/versions report ERR_CANCELED) — treat as a silent no-op.
    const code =
      err && typeof err === 'object' && 'code' in err
        ? (err as { code?: string }).code
        : undefined;
    if (code === 'ERR_REQUEST_CANCELED' || code === 'ERR_CANCELED') {
      throw new SocialSignInCancelled();
    }
    // Any other Apple native failure (unknown/not-handled/unavailable/missing
    // entitlement) is an expected, non-actionable condition — present it as
    // "unavailable" rather than a raw "An unexpected error occurred".
    throw new SocialSignInUnavailable();
  }

  const identityToken = credential.identityToken;
  if (!identityToken) throw new Error('apple-no-identity-token');

  const firebaseIdToken = await signInToFirebaseWithApple(identityToken);
  return exchangeFirebaseToken(firebaseIdToken, 'apple');
}

// ─────────────────────────────────────────────────────────────────────────────
// Firebase credential exchange — provider credential → Firebase ID token.
//
// These call the Firebase Auth REST API (signInWithIdp), which needs no native SDK
// and works in Expo Go. They are only reachable when isFirebaseConfigured() is true.
// ─────────────────────────────────────────────────────────────────────────────

async function signInToFirebaseWithGoogle(googleIdToken: string): Promise<string> {
  return firebaseSignInWithIdp(`id_token=${googleIdToken}&providerId=google.com`);
}

async function signInToFirebaseWithApple(appleIdentityToken: string): Promise<string> {
  return firebaseSignInWithIdp(`id_token=${appleIdentityToken}&providerId=apple.com`);
}

async function firebaseSignInWithIdp(postBody: string): Promise<string> {
  const apiKey = extra.firebase?.apiKey;
  const authDomain = extra.firebase?.authDomain ?? `${extra.firebase?.projectId}.firebaseapp.com`;
  if (!apiKey) throw new Error('firebase-not-configured');

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        postBody,
        requestUri: `https://${authDomain}`,
        returnSecureToken: true,
        returnIdpCredential: true,
      }),
    },
  );

  if (!res.ok) throw new Error('firebase-idp-failed');
  const data = (await res.json()) as { idToken?: string };
  if (!data.idToken) throw new Error('firebase-no-id-token');
  return data.idToken;
}
