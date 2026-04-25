/**
 * Jest mock for expo-local-authentication
 * SEC-048: Real biometric support; tests use this mock to exercise
 * both success and failure paths without native hardware.
 */

export const hasHardwareAsync = jest.fn(() => Promise.resolve(true));
export const isEnrolledAsync = jest.fn(() => Promise.resolve(true));
export const authenticateAsync = jest.fn(() =>
  Promise.resolve({ success: true }),
);
export const supportedAuthenticationTypesAsync = jest.fn(() =>
  Promise.resolve([1, 2]), // FINGERPRINT=1, FACIAL_RECOGNITION=2
);
export const cancelAuthenticate = jest.fn();

export enum AuthenticationType {
  FINGERPRINT = 1,
  FACIAL_RECOGNITION = 2,
  IRIS = 3,
}
