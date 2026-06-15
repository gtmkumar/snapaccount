/**
 * OTPResendTimer — A11Y OTP-1 / OTP-2 (accessibility-standard.md §2.4).
 * Covers: milestone + availability announcements via
 * AccessibilityInfo.announceForAccessibility, the always-reachable resend
 * control exposing disabled state + remaining time, and resend behaviour.
 */

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}(${JSON.stringify(opts)})` : key,
    i18n: { language: 'en' },
  }),
}));

import { OTPResendTimer } from '../../src/components/forms/OTPInput';

const announceSpy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

/** Advance second-by-second: each tick re-arms the next setTimeout after a re-render. */
function tickSeconds(n: number) {
  for (let i = 0; i < n; i++) {
    act(() => {
      jest.advanceTimersByTime(1000);
    });
  }
}

describe('OTPResendTimer (a11y)', () => {
  it('exposes the countdown control as a disabled button with remaining time in the label', () => {
    const { getByRole } = render(<OTPResendTimer initialSeconds={60} onResend={jest.fn()} />);

    const control = getByRole('button');
    expect(control.props.accessibilityState.disabled).toBe(true);
    expect(control.props.accessibilityLabel).toContain('mobile.otp.resendInLabel');
    expect(control.props.accessibilityLabel).toContain('1:00');
  });

  it('does not fire onResend while disabled', () => {
    const onResend = jest.fn();
    const { getByRole } = render(<OTPResendTimer initialSeconds={60} onResend={onResend} />);
    fireEvent.press(getByRole('button'));
    expect(onResend).not.toHaveBeenCalled();
  });

  it('announces the 30s and 10s milestones (not every tick)', () => {
    render(<OTPResendTimer initialSeconds={31} onResend={jest.fn()} />);

    tickSeconds(1); // 31 → 30
    expect(announceSpy).toHaveBeenCalledWith('mobile.otp.resendMilestone({"seconds":30})');

    announceSpy.mockClear();
    tickSeconds(5); // 30 → 25
    expect(announceSpy).not.toHaveBeenCalled(); // no per-tick spam

    tickSeconds(15); // 25 → 10
    expect(announceSpy).toHaveBeenCalledWith('mobile.otp.resendMilestone({"seconds":10})');
  });

  it('announces availability at 0 and enables the resend button', () => {
    const onResend = jest.fn();
    const { getByRole } = render(<OTPResendTimer initialSeconds={2} onResend={onResend} />);

    tickSeconds(2);

    expect(announceSpy).toHaveBeenCalledWith('mobile.otp.resendAvailable');

    const control = getByRole('button');
    expect(control.props.accessibilityState.disabled).toBe(false);
    expect(control.props.accessibilityLabel).toBe('mobile.otp.resend');

    fireEvent.press(control);
    expect(onResend).toHaveBeenCalledTimes(1);

    // Countdown restarts disabled after resend.
    expect(getByRole('button').props.accessibilityState.disabled).toBe(true);
  });
});
