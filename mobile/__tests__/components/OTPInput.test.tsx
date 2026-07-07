/**
 * OTPInput — regression for BUG-MOBILE-OTP-ONCOMPLETE-NEVER-FIRES.
 *
 * The digit-typing path used to gate onComplete behind
 * `!combined.includes('')` — but every string includes the empty string, so
 * the condition was always false and onComplete NEVER fired for hand-typed
 * OTPs (auto-verify only worked for the paste / SMS auto-read paths). The
 * empty-box check must run against the ARRAY of box values.
 */

import React, { useState } from 'react';
import { render, fireEvent } from '@testing-library/react-native';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}(${JSON.stringify(opts)})` : key,
    i18n: { language: 'en' },
  }),
}));

import { OTPInput } from '../../src/components/forms/OTPInput';

/** Controlled harness mirroring real usage (OTPVerifyScreen / 2FA challenge). */
function Harness({ onComplete }: { onComplete: (v: string) => void }) {
  const [otp, setOtp] = useState('');
  return <OTPInput value={otp} onChange={setOtp} onComplete={onComplete} />;
}

const boxLabel = (i: number) => `mobile.otp.digitLabel({"index":${i}})`;

describe('OTPInput onComplete', () => {
  it('fires exactly once with the full code when the 6th digit is typed', () => {
    const onComplete = jest.fn();
    const { getByLabelText } = render(<Harness onComplete={onComplete} />);

    const digits = ['1', '2', '3', '4', '5', '6'];
    digits.forEach((d, i) => {
      fireEvent.changeText(getByLabelText(boxLabel(i + 1)), d);
    });

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith('123456');
  });

  it('does not fire while boxes are still empty', () => {
    const onComplete = jest.fn();
    const { getByLabelText } = render(<Harness onComplete={onComplete} />);

    ['1', '2', '3', '4', '5'].forEach((d, i) => {
      fireEvent.changeText(getByLabelText(boxLabel(i + 1)), d);
    });

    expect(onComplete).not.toHaveBeenCalled();
  });

  it('fires for a full-code paste into the first box', () => {
    const onComplete = jest.fn();
    const { getByLabelText } = render(<Harness onComplete={onComplete} />);

    fireEvent.changeText(getByLabelText(boxLabel(1)), '654321');

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith('654321');
  });
});
