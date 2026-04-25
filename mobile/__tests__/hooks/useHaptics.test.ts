/**
 * useHaptics hook — Phase 6F full test suite
 * Track F4 · all 6 haptic functions · Expo Haptics API verification
 *
 * Covers:
 *   - success / warning / error → notificationAsync with correct type
 *   - lightTap / mediumTap → impactAsync with correct style
 *   - celebrationBurst(false) → Success + 2x Light via setTimeout
 *   - celebrationBurst(true) → only Success (skipSequence path)
 *   - enabled state defaults to true
 */

import { renderHook, act } from '@testing-library/react-native';
import { useHaptics } from '../../src/hooks/useHaptics';
import * as Haptics from 'expo-haptics';

jest.mock('expo-haptics');

describe('useHaptics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── return shape ──────────────────────────────────────────────────────────

  it('returns all 6 functions and enabled flag', () => {
    const { result } = renderHook(() => useHaptics());
    expect(typeof result.current.success).toBe('function');
    expect(typeof result.current.warning).toBe('function');
    expect(typeof result.current.error).toBe('function');
    expect(typeof result.current.lightTap).toBe('function');
    expect(typeof result.current.mediumTap).toBe('function');
    expect(typeof result.current.celebrationBurst).toBe('function');
    expect(typeof result.current.enabled).toBe('boolean');
  });

  it('enabled defaults to true', () => {
    const { result } = renderHook(() => useHaptics());
    expect(result.current.enabled).toBe(true);
  });

  // ── notification feedback ─────────────────────────────────────────────────

  it('success() calls notificationAsync(Success)', () => {
    const { result } = renderHook(() => useHaptics());
    act(() => { result.current.success(); });
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(
      Haptics.NotificationFeedbackType.Success,
    );
  });

  it('warning() calls notificationAsync(Warning)', () => {
    const { result } = renderHook(() => useHaptics());
    act(() => { result.current.warning(); });
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(
      Haptics.NotificationFeedbackType.Warning,
    );
  });

  it('error() calls notificationAsync(Error)', () => {
    const { result } = renderHook(() => useHaptics());
    act(() => { result.current.error(); });
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(
      Haptics.NotificationFeedbackType.Error,
    );
  });

  // ── impact feedback ───────────────────────────────────────────────────────

  it('lightTap() calls impactAsync(Light)', () => {
    const { result } = renderHook(() => useHaptics());
    act(() => { result.current.lightTap(); });
    expect(Haptics.impactAsync).toHaveBeenCalledWith(
      Haptics.ImpactFeedbackStyle.Light,
    );
  });

  it('mediumTap() calls impactAsync(Medium)', () => {
    const { result } = renderHook(() => useHaptics());
    act(() => { result.current.mediumTap(); });
    expect(Haptics.impactAsync).toHaveBeenCalledWith(
      Haptics.ImpactFeedbackStyle.Medium,
    );
  });

  // ── celebration burst (skipSequence = true) ───────────────────────────────

  it('celebrationBurst(true) fires only notificationAsync(Success), no impactAsync', () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useHaptics());
    act(() => { result.current.celebrationBurst(true); });
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(
      Haptics.NotificationFeedbackType.Success,
    );
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  // ── celebration burst (skipSequence = false / default) ───────────────────

  it('celebrationBurst() fires Success immediately then 2x Light after 120ms/180ms', () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useHaptics());

    act(() => { result.current.celebrationBurst(); });

    // Immediate: Success notification
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(
      Haptics.NotificationFeedbackType.Success,
    );
    expect(Haptics.impactAsync).not.toHaveBeenCalled();

    // Advance 120ms: first Light impact fires
    act(() => { jest.advanceTimersByTime(120); });
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);

    // Advance another 60ms: second Light impact fires
    act(() => { jest.advanceTimersByTime(60); });
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(2);

    jest.useRealTimers();
  });

  it('celebrationBurst() default param equals skipSequence=false (fires impacts)', () => {
    jest.useFakeTimers();
    const { result } = renderHook(() => useHaptics());

    act(() => { result.current.celebrationBurst(); }); // no arg = false
    act(() => { jest.advanceTimersByTime(200); });

    // Should have called impactAsync (sequence path)
    expect(Haptics.impactAsync).toHaveBeenCalled();
    jest.useRealTimers();
  });

  // ── each function called only once ────────────────────────────────────────

  it('each tap function called independently produces exactly 1 call', () => {
    const { result } = renderHook(() => useHaptics());

    act(() => { result.current.lightTap(); });
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);

    jest.clearAllMocks();

    act(() => { result.current.mediumTap(); });
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
  });
});
