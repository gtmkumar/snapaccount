/**
 * Jest mock for @expo/app-integrity (GAP-064 device integrity attestation).
 *
 * Tests re-program behaviour via `const mod = require('@expo/app-integrity')`
 * and mutate `mod.isSupported` / mockImplementation the jest.fn()s. The
 * service under test reads these as properties of the exports object, so
 * external mutation is visible to it.
 */

import { jest } from '@jest/globals';

/** iOS App Attest availability flag (mutable in tests via the exports object). */
// eslint-disable-next-line prefer-const -- mutated by tests through the exports object
export let isSupported = true;

// iOS — App Attest
export const generateKeyAsync = jest.fn(() => Promise.resolve('mock-key-id'));
export const attestKeyAsync = jest.fn((_keyId: string, _challenge: string) =>
  Promise.resolve('mock-ios-attestation'),
);
export const generateAssertionAsync = jest.fn((_keyId: string, _challenge: string) =>
  Promise.resolve('mock-ios-assertion'),
);

// Android — Play Integrity
export const prepareIntegrityTokenProviderAsync = jest.fn((_cloudProjectNumber: string) =>
  Promise.resolve(),
);
export const requestIntegrityCheckAsync = jest.fn((_requestHash: string) =>
  Promise.resolve('mock-android-verdict'),
);

// Android — hardware key attestation (unused by deviceIntegrity.ts)
export const isHardwareAttestationSupportedAsync = jest.fn(() => Promise.resolve(false));
export const generateHardwareAttestedKeyAsync = jest.fn((_keyAlias: string, _challenge: string) =>
  Promise.resolve(),
);
export const getAttestationCertificateChainAsync = jest.fn((_keyAlias: string) =>
  Promise.resolve([] as string[]),
);
