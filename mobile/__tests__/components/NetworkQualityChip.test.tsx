/**
 * NetworkQualityChip — Phase 6F full test suite
 * Track F4 · 5s hysteresis · slow connection · offline · recovery
 *
 * Covers:
 *   - Returns null (chip hidden) on good connection
 *   - Returns null immediately on slow connection (hysteresis: must persist 5s)
 *   - Chip appears after SLOW_DURATION_MS (5000ms) of sustained slow speed
 *   - Chip hides on recovery (clearTimeout of pending slow timer)
 *   - Chip shows immediately on offline (isInternetReachable = false)
 *   - Chip text: 'net.quality.slow' for slow, 'net.quality.offline' for offline
 */

import React from 'react';
import { render, act, waitFor } from '@testing-library/react-native';
import NetInfo from '@react-native-community/netinfo';
import { NetworkQualityChip } from '../../src/components/shared/NetworkQualityChip';

import '../../src/i18n';

const mockNetInfo = NetInfo as jest.Mocked<typeof NetInfo>;

// ── Helpers ───────────────────────────────────────────────────────────────────

type NetInfoCallback = (state: Record<string, unknown>) => void;
let _lastCallback: NetInfoCallback | null = null;

function setupNetInfo(initialState: Record<string, unknown>) {
  mockNetInfo.addEventListener = jest.fn().mockImplementation((cb: NetInfoCallback) => {
    _lastCallback = cb;
    cb(initialState); // fire immediately
    return jest.fn(); // unsubscribe
  });
}

function fireNetInfo(state: Record<string, unknown>) {
  _lastCallback?.(state);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('NetworkQualityChip', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _lastCallback = null;
  });

  // ── good connection: chip hidden ──────────────────────────────────────────

  it('returns null when connection is good (high downlink)', () => {
    setupNetInfo({
      isInternetReachable: true,
      type: 'wifi',
      details: { downlink: 50 }, // 50 Mbps — good
    });

    const { queryByTestId } = render(<NetworkQualityChip testID="chip" />);
    expect(queryByTestId('chip')).toBeNull();
  });

  it('returns null on initial render with no state fired', () => {
    mockNetInfo.addEventListener = jest.fn().mockReturnValue(jest.fn());
    const { queryByTestId } = render(<NetworkQualityChip testID="chip" />);
    expect(queryByTestId('chip')).toBeNull();
  });

  // ── 5s hysteresis for slow connection ────────────────────────────────────

  it('chip does NOT appear immediately on slow connection (5s hysteresis)', () => {
    jest.useFakeTimers();
    setupNetInfo({
      isInternetReachable: true,
      type: 'wifi',
      details: { downlink: 0.05 }, // 50 kbps → below 100 kbps threshold → slow
    });

    const { queryByTestId } = render(<NetworkQualityChip testID="chip" />);

    // Still hidden — timer not elapsed yet
    expect(queryByTestId('chip')).toBeNull();

    jest.useRealTimers();
  });

  it('chip appears after 5s of sustained slow connection', async () => {
    jest.useFakeTimers();
    setupNetInfo({
      isInternetReachable: true,
      type: 'wifi',
      details: { downlink: 0.05 }, // slow
    });

    const { queryByTestId } = render(<NetworkQualityChip testID="chip" />);

    expect(queryByTestId('chip')).toBeNull();

    act(() => {
      jest.advanceTimersByTime(5100); // past SLOW_DURATION_MS
    });

    await waitFor(() => {
      expect(queryByTestId('chip')).not.toBeNull();
    });

    jest.useRealTimers();
  });

  // ── recovery: chip hides ──────────────────────────────────────────────────

  it('chip does not appear if connection recovers before 5s timer fires', () => {
    jest.useFakeTimers();
    setupNetInfo({
      isInternetReachable: true,
      type: 'wifi',
      details: { downlink: 0.05 }, // slow
    });

    const { queryByTestId } = render(<NetworkQualityChip testID="chip" />);

    // 2s later — connection recovers before 5s
    act(() => {
      jest.advanceTimersByTime(2000);
      fireNetInfo({
        isInternetReachable: true,
        type: 'wifi',
        details: { downlink: 50 }, // good again
      });
      jest.advanceTimersByTime(3500); // past original slow deadline, but timer cleared
    });

    expect(queryByTestId('chip')).toBeNull();

    jest.useRealTimers();
  });

  // ── offline ───────────────────────────────────────────────────────────────

  it('chip appears immediately when isInternetReachable is false', async () => {
    setupNetInfo({
      isInternetReachable: false,
      type: 'none',
      details: null,
    });

    const { queryByTestId } = render(<NetworkQualityChip testID="chip" />);

    await waitFor(() => {
      expect(queryByTestId('chip')).not.toBeNull();
    });
  });

  it('offline chip has accessibility label containing net.quality.offline', async () => {
    setupNetInfo({
      isInternetReachable: false,
      type: 'none',
      details: null,
    });

    const { queryByLabelText } = render(<NetworkQualityChip testID="chip" />);

    await waitFor(() => {
      // The Pressable accessibilityLabel references quality label
      const el = queryByLabelText(/net\.quality\.offline/);
      expect(el).not.toBeNull();
    });
  });

  // ── transition: slow → good ───────────────────────────────────────────────

  it('chip hides when connection recovers after being shown (slow → good)', async () => {
    jest.useFakeTimers();
    setupNetInfo({
      isInternetReachable: true,
      type: 'wifi',
      details: { downlink: 0.05 }, // slow
    });

    const { queryByTestId } = render(<NetworkQualityChip testID="chip" />);

    // Let slow timer fire
    act(() => { jest.advanceTimersByTime(5100); });

    await waitFor(() => {
      expect(queryByTestId('chip')).not.toBeNull();
    });

    // Connection recovers
    act(() => {
      fireNetInfo({
        isInternetReachable: true,
        type: 'wifi',
        details: { downlink: 50 },
      });
    });

    // Quality resets to 'good' → component returns null
    await waitFor(() => {
      expect(queryByTestId('chip')).toBeNull();
    });

    jest.useRealTimers();
  });
});
