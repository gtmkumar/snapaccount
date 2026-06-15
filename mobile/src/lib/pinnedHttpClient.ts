/**
 * pinnedHttpClient.ts
 * TLS certificate-pinned HTTP client for SnapAccount API calls.
 *
 * SEC-014 — Certificate Pinning
 * Prevents MITM attacks via rogue CA certificates on both Android and iOS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HOW TO UPDATE CERTIFICATE HASHES (when the API certificate rotates):
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 1. Obtain the new certificate's SHA-256 public-key hash from the DevOps
 *    engineer who renewed the certificate. They can extract it with:
 *      openssl x509 -in cert.pem -pubkey -noout \
 *        | openssl pkey -pubin -outform DER \
 *        | openssl dgst -sha256 -binary \
 *        | base64
 *
 * 2. Before the old certificate expires, add the new hash to PINNED_CERTS
 *    alongside the existing one (keep both during the transition window).
 *    This ensures users on the old app version are not locked out before
 *    the Play Store / App Store update is widely adopted.
 *
 * 3. Ship a new app version with both hashes. Ensure the new version has
 *    reached sufficient adoption (~90% of active users) before the old
 *    certificate expires.
 *
 * 4. After the old certificate has expired and adoption is sufficient,
 *    remove the old hash in a follow-up release.
 *
 * 5. Never ship an app with only a single hash if a rotation is imminent —
 *    always carry at least a current + backup hash.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// SEC-014 scaffolding: the native package is only added in production
// dev-client builds (not Expo Go); ambient types live in src/types/modules.d.ts.
// eslint-disable-next-line import/no-unresolved
import SslPinning from 'react-native-ssl-pinning';

const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://api.snapaccount.in';

/**
 * SHA-256 public-key hashes of the API server certificate.
 *
 * IMPORTANT: Replace these placeholders with real hashes before shipping
 * to production. See the update procedure in the file header above.
 *
 * Format: 'sha256/<base64-encoded-hash>=='
 */
const PINNED_CERTS: string[] = [
  'sha256/PLACEHOLDER_HASH_1==', // Current certificate — replace before production
  'sha256/PLACEHOLDER_HASH_2==', // Backup certificate — replace before production
];

/**
 * Makes an HTTP request to the SnapAccount API with TLS certificate pinning.
 *
 * Mirrors the signature of the native `fetch` API so it can be used as a
 * drop-in replacement in API client modules. All network errors (including
 * certificate mismatch) surface as thrown exceptions.
 *
 * @param path  - API path relative to API_BASE (e.g. '/auth/otp/send')
 * @param options - Standard RequestInit options (method, headers, body)
 */
export async function pinnedFetch(
  path: string,
  options: RequestInit = {},
): Promise<{ status: number; bodyString: string; headers: Record<string, string> }> {
  return SslPinning.fetch(`${API_BASE}${path}`, {
    method: options.method ?? 'GET',
    headers: options.headers as Record<string, string>,
    body: options.body as string,
    sslPinning: {
      certs: PINNED_CERTS,
    },
    timeoutInterval: 30,
  });
}
