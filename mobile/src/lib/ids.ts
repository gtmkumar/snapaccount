/**
 * Client-side ID generation.
 * NEW-D08: every chat send carries a client-generated UUID `clientMessageId`
 * so the backend can de-duplicate retries. The SAME id must be reused when a
 * failed send is retried — generate once per logical message, never per attempt.
 */

import * as Crypto from 'expo-crypto';

/** RFC 4122 v4 UUID. Prefers the native CSPRNG; falls back to Math.random. */
export function newClientMessageId(): string {
  try {
    if (typeof Crypto.randomUUID === 'function') {
      return Crypto.randomUUID();
    }
  } catch {
    // fall through to JS fallback
  }
  // Fallback v4 (non-crypto): fine for dedupe keys, never used for security.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
