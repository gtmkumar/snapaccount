/**
 * OTPInput Component
 * 6 individual digit boxes with auto-focus and SMS auto-read
 * Matches component-library.md §1.3
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputKeyPressEventData,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';

interface OTPInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  error?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
}

export function OTPInput({
  length = 6,
  value,
  onChange,
  onComplete,
  error = false,
  disabled = false,
  autoFocus = true,
}: OTPInputProps) {
  const styles = useStyles();
  const { t } = useTranslation();
  const inputRefs = useRef<(TextInput | null)[]>([]);
  const [localValues, setLocalValues] = useState<string[]>(
    Array(length).fill(''),
  );

  // Sync external value into local boxes — adjust state during render
  // (react.dev "adjusting state when a prop changes") instead of an effect,
  // so there is no extra cascading re-render.
  const [prevSync, setPrevSync] = useState({ value, length });
  if (prevSync.value !== value || prevSync.length !== length) {
    setPrevSync({ value, length });
    const chars = value.split('').slice(0, length);
    setLocalValues([...chars, ...Array(length - chars.length).fill('')]);
  }

  const handleChange = useCallback(
    (text: string, index: number) => {
      // Handle paste: if text.length > 1, distribute across boxes
      if (text.length > 1) {
        const digits = text.replace(/\D/g, '').slice(0, length);
        const newValues = [...Array(length).fill('')];
        for (let i = 0; i < digits.length; i++) {
          newValues[i] = digits[i];
        }
        setLocalValues(newValues);
        const combined = newValues.join('');
        onChange(combined);
        if (combined.length === length) {
          onComplete?.(combined);
          // Focus last box
          inputRefs.current[length - 1]?.blur();
        } else {
          inputRefs.current[Math.min(digits.length, length - 1)]?.focus();
        }
        return;
      }

      const digit = text.replace(/\D/g, '').slice(-1);
      const newValues = [...localValues];
      newValues[index] = digit;
      setLocalValues(newValues);
      const combined = newValues.join('');
      onChange(combined);

      if (digit && index < length - 1) {
        inputRefs.current[index + 1]?.focus();
      }

      if (combined.length === length && !combined.includes('')) {
        onComplete?.(combined);
        inputRefs.current[length - 1]?.blur();
      }
    },
    [localValues, length, onChange, onComplete],
  );

  const handleKeyPress = useCallback(
    (e: NativeSyntheticEvent<TextInputKeyPressEventData>, index: number) => {
      if (e.nativeEvent.key === 'Backspace') {
        if (localValues[index] === '' && index > 0) {
          // Move to previous box
          const newValues = [...localValues];
          newValues[index - 1] = '';
          setLocalValues(newValues);
          onChange(newValues.join(''));
          inputRefs.current[index - 1]?.focus();
        } else {
          const newValues = [...localValues];
          newValues[index] = '';
          setLocalValues(newValues);
          onChange(newValues.join(''));
        }
      }
    },
    [localValues, onChange],
  );

  return (
    <View style={styles.container}>
      {Array(length)
        .fill(0)
        .map((_, index) => {
          const isFilled = Boolean(localValues[index]);
          return (
            <TextInput
              key={index}
              ref={(ref) => {
                inputRefs.current[index] = ref;
              }}
              style={[
                styles.box,
                isFilled && styles.boxFilled,
                error && styles.boxError,
                disabled && styles.boxDisabled,
              ]}
              value={localValues[index]}
              onChangeText={(text) => handleChange(text, index)}
              onKeyPress={(e) => handleKeyPress(e, index)}
              keyboardType="numeric"
              maxLength={length} // Allow paste of full OTP
              autoFocus={autoFocus && index === 0}
              editable={!disabled}
              selectTextOnFocus
              textContentType={Platform.OS === 'ios' ? 'oneTimeCode' : 'none'}
              accessibilityLabel={t('mobile.otp.digitLabel', { index: index + 1 })}
              caretHidden
            />
          );
        })}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// OTP Resend Timer
// ─────────────────────────────────────────────────────────────────────────────

interface OTPResendTimerProps {
  initialSeconds?: number;
  onResend: () => void;
}

/**
 * Countdown seconds at which the remaining time is announced to screen
 * readers. Announcing every tick is spammy (OTP-1a); milestones only.
 */
const ANNOUNCE_MILESTONES = [30, 10];

export function OTPResendTimer({
  initialSeconds = 60,
  onResend,
}: OTPResendTimerProps) {
  const timerStyles = useTimerStyles();
  const { t } = useTranslation();
  const [seconds, setSeconds] = useState(initialSeconds);
  // Derived, not state — avoids a setState-in-effect cascade.
  const canResend = seconds === 0;

  useEffect(() => {
    if (seconds === 0) {
      // OTP-1: announce availability without requiring focus change (4.1.3).
      AccessibilityInfo.announceForAccessibility(t('mobile.otp.resendAvailable'));
      return;
    }
    if (ANNOUNCE_MILESTONES.includes(seconds)) {
      AccessibilityInfo.announceForAccessibility(
        t('mobile.otp.resendMilestone', { seconds }),
      );
    }
    const timer = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds, t]);

  const handleResend = () => {
    if (!canResend) return;
    setSeconds(initialSeconds);
    onResend();
  };

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const display = `${mins}:${String(secs).padStart(2, '0')}`;

  // OTP-2: the control is ALWAYS rendered and reachable by AT; while the
  // countdown runs it is exposed as disabled with the remaining time in its
  // label, instead of disappearing from the accessibility tree.
  return (
    <View style={timerStyles.container}>
      <Pressable
        onPress={handleResend}
        disabled={!canResend}
        accessibilityRole="button"
        accessibilityState={{ disabled: !canResend }}
        accessibilityLabel={
          canResend
            ? t('mobile.otp.resend')
            : t('mobile.otp.resendInLabel', { time: display })
        }
        style={timerStyles.resendControl}
        hitSlop={8}
      >
        {canResend ? (
          <Text style={timerStyles.resendLink}>{t('mobile.otp.resend')}</Text>
        ) : (
          <Text style={timerStyles.timer}>
            {t('mobile.otp.resendIn', { time: display })}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  box: {
    width: 48,
    height: 56,
    borderWidth: 1.5,
    // OTP-3: resting outline must stay ≥3:1 non-text contrast on white.
    borderColor: tk.textTertiary,
    borderStyle: 'dashed',
    borderRadius: 8,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '700',
    color: tk.textPrimary,
    backgroundColor: tk.canvas,
  },
  boxFilled: {
    borderStyle: 'solid',
    borderColor: tk.textTertiary,
    backgroundColor: tk.raised,
  },
  boxError: {
    borderStyle: 'solid',
    borderColor: tk.errorCta,
  },
  boxDisabled: {
    opacity: 0.5,
    backgroundColor: tk.sunken,
  },
  }),
);

const useTimerStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
  container: {
    alignItems: 'center',
    marginTop: 16,
  },
  // ≥44pt touch target for the always-reachable resend control.
  resendControl: {
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  timer: {
    fontSize: 14,
    color: tk.textSecondary,
  },
  resendLink: {
    fontSize: 14,
    fontWeight: '600',
    color: tk.brand500,
  },
  }),
);
