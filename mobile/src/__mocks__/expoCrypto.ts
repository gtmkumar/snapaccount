/**
 * Jest mock for expo-crypto — self-contained (no node typings required).
 * randomUUID returns a well-formed RFC 4122 v4 UUID.
 */

function v4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function randomUUID(): string {
  return v4();
}

export function getRandomBytes(byteCount: number): Uint8Array {
  const bytes = new Uint8Array(byteCount);
  for (let i = 0; i < byteCount; i += 1) {
    bytes[i] = (Math.random() * 256) | 0;
  }
  return bytes;
}

export async function getRandomBytesAsync(byteCount: number): Promise<Uint8Array> {
  return getRandomBytes(byteCount);
}

export const CryptoDigestAlgorithm = { SHA256: 'SHA-256' } as const;
