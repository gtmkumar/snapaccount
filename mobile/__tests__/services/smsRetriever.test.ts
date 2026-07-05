/**
 * smsRetriever service tests — DG-AUTH-03 Android SMS Retriever OTP auto-read.
 *
 * Soft-fail contract under test:
 *   - startOtpListener() NEVER throws and returns a no-op unsubscribe on
 *     iOS/web, without the native module, or on any runtime error.
 *   - Android: forwards the parsed 6-digit OTP from the SMS body to onOtp.
 *   - parseOtp extracts the first standalone 6-digit run from the MSG91 body.
 *   - __DEV__ simulation hook drives the flow without real telephony.
 *
 * The native package `@pushpendersingh/react-native-otp-verify` is mocked
 * virtually in src/__mocks__/setup.js; tests re-program it via require().
 */

// react-native mocked minimally: the service only reads Platform.OS.
jest.mock('react-native', () => ({
  Platform: { OS: 'android' },
}));

import {
  startOtpListener,
  parseOtp,
  getAppHash,
  __testing,
} from '../../src/services/smsRetriever';

/* eslint-disable @typescript-eslint/no-var-requires */
const { Platform } = require('react-native') as { Platform: { OS: string } };
const OtpVerify = require('@pushpendersingh/react-native-otp-verify') as {
  getHash: jest.Mock;
  startOtpListener: jest.Mock;
  removeListener: jest.Mock;
};
/* eslint-enable @typescript-eslint/no-var-requires */

beforeEach(() => {
  jest.clearAllMocks();
  __testing.reset();
  __testing.setDevMode(false);
  Platform.OS = 'android';
  OtpVerify.getHash.mockResolvedValue(['mockAppHash1']);
  OtpVerify.startOtpListener.mockReset();
  OtpVerify.removeListener.mockReset();
});

// ── parseOtp ────────────────────────────────────────────────────────────────

describe('parseOtp', () => {
  it('extracts a 6-digit code from a typical MSG91 OTP body', () => {
    const body = '123456 is your SnapAccount OTP. Valid for 5 min. <#> aB1cD2eF3gh';
    expect(parseOtp(body)).toBe('123456');
  });

  it('returns null when no 6-digit code is present', () => {
    expect(parseOtp('Your code is 123. Thanks.')).toBeNull();
  });

  it('does not match a longer digit run as the OTP', () => {
    // 1234567 is 7 digits — not a valid 6-digit OTP token.
    expect(parseOtp('Ref 1234567 noted')).toBeNull();
  });

  it('returns null for null / empty input', () => {
    expect(parseOtp(null)).toBeNull();
    expect(parseOtp('')).toBeNull();
  });

  it('honours a custom length', () => {
    expect(parseOtp('Code 4321 expires soon', 4)).toBe('4321');
  });
});

// ── Android native path ───────────────────────────────────────────────────────

describe('startOtpListener — Android native', () => {
  it('starts the native Retriever and forwards the parsed OTP', () => {
    const onOtp = jest.fn();
    startOtpListener(onOtp);

    expect(OtpVerify.startOtpListener).toHaveBeenCalledTimes(1);
    // Drive the native handler the module would have invoked.
    const handler = OtpVerify.startOtpListener.mock.calls[0][0] as (m: string | null) => void;
    handler('654321 is your SnapAccount OTP. <#> aB1cD2eF3gh');

    expect(onOtp).toHaveBeenCalledWith('654321');
  });

  it('ignores messages without a 6-digit code', () => {
    const onOtp = jest.fn();
    startOtpListener(onOtp);
    const handler = OtpVerify.startOtpListener.mock.calls[0][0] as (m: string | null) => void;
    handler(null);
    handler('no code here');
    expect(onOtp).not.toHaveBeenCalled();
  });

  it('removes the native listener on unsubscribe and stops delivering', () => {
    const onOtp = jest.fn();
    const stop = startOtpListener(onOtp);
    const handler = OtpVerify.startOtpListener.mock.calls[0][0] as (m: string | null) => void;
    stop();
    expect(OtpVerify.removeListener).toHaveBeenCalledTimes(1);
    handler('111111 is your OTP');
    expect(onOtp).not.toHaveBeenCalled();
  });

  it('never throws when the native start call fails', () => {
    OtpVerify.startOtpListener.mockImplementation(() => {
      throw new Error('PLAY_SERVICES_NOT_FOUND');
    });
    const onOtp = jest.fn();
    expect(() => {
      const stop = startOtpListener(onOtp);
      stop();
    }).not.toThrow();
    expect(onOtp).not.toHaveBeenCalled();
  });
});

// ── iOS / web no-op ───────────────────────────────────────────────────────────

describe('startOtpListener — non-Android', () => {
  it('is a no-op on iOS (QuickType handles auto-fill)', () => {
    Platform.OS = 'ios';
    const onOtp = jest.fn();
    const stop = startOtpListener(onOtp);
    expect(OtpVerify.startOtpListener).not.toHaveBeenCalled();
    expect(() => stop()).not.toThrow();
  });
});

// ── Dev simulation ────────────────────────────────────────────────────────────

describe('dev simulation hook', () => {
  it('delivers a simulated SMS via __testing.simulateMessage in dev mode', () => {
    __testing.setDevMode(true);
    Platform.OS = 'ios'; // simulate on a non-Android dev device too
    const onOtp = jest.fn();
    startOtpListener(onOtp);
    __testing.simulateMessage('Your OTP is 909090');
    expect(onOtp).toHaveBeenCalledWith('909090');
  });

  it('installs and tears down the global dev hook', () => {
    __testing.setDevMode(true);
    const g = globalThis as { __SNAP_SIMULATE_OTP_SMS__?: (m: string) => void };
    const onOtp = jest.fn();
    const stop = startOtpListener(onOtp);
    expect(typeof g.__SNAP_SIMULATE_OTP_SMS__).toBe('function');
    g.__SNAP_SIMULATE_OTP_SMS__?.('Code: 246810');
    expect(onOtp).toHaveBeenCalledWith('246810');
    stop();
  });
});

// ── getAppHash ────────────────────────────────────────────────────────────────

describe('getAppHash', () => {
  it('returns the first native app hash on Android', async () => {
    await expect(getAppHash()).resolves.toBe('mockAppHash1');
  });

  it('returns null on iOS', async () => {
    Platform.OS = 'ios';
    await expect(getAppHash()).resolves.toBeNull();
  });

  it('returns null (never throws) when the native call rejects', async () => {
    OtpVerify.getHash.mockRejectedValue(new Error('no module'));
    await expect(getAppHash()).resolves.toBeNull();
  });
});
