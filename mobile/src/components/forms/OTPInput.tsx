/**
 * OTPInput Component
 * 6 individual digit boxes with auto-focus and SMS auto-read
 * Matches component-library.md §1.3
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  NativeSyntheticEvent,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TextInputKeyPressEventData,
  View,
} from 'react-native';
import { Colors } from '../../constants/colors';

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
  const inputRefs = useRef<(TextInput | null)[]>([]);
  const [localValues, setLocalValues] = useState<string[]>(
    Array(length).fill(''),
  );

  // Sync external value into local boxes
  useEffect(() => {
    const chars = value.split('').slice(0, length);
    const padded = [...chars, ...Array(length - chars.length).fill('')];
    setLocalValues(padded);
  }, [value, length]);

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
              accessibilityLabel={`OTP digit ${index + 1}`}
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

export function OTPResendTimer({
  initialSeconds = 60,
  onResend,
}: OTPResendTimerProps) {
  const [seconds, setSeconds] = useState(initialSeconds);
  const [canResend, setCanResend] = useState(false);

  useEffect(() => {
    if (seconds === 0) {
      setCanResend(true);
      return;
    }
    const timer = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);

  const handleResend = () => {
    if (!canResend) return;
    setSeconds(initialSeconds);
    setCanResend(false);
    onResend();
  };

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const display = `${mins}:${String(secs).padStart(2, '0')}`;

  return (
    <View style={timerStyles.container}>
      {canResend ? (
        <Text
          style={timerStyles.resendLink}
          onPress={handleResend}
          accessibilityRole="button"
          accessibilityLabel="Resend OTP"
        >
          Resend OTP
        </Text>
      ) : (
        <Text style={timerStyles.timer}>
          Resend OTP in{' '}
          <Text style={timerStyles.timerValue}>{display}</Text>
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  box: {
    width: 48,
    height: 56,
    borderWidth: 1.5,
    borderColor: Colors.neutral[300],
    borderStyle: 'dashed',
    borderRadius: 8,
    textAlign: 'center',
    fontSize: 24,
    fontWeight: '700',
    color: Colors.neutral[900],
    backgroundColor: Colors.neutral[50],
  },
  boxFilled: {
    borderStyle: 'solid',
    borderColor: Colors.neutral[400],
    backgroundColor: Colors.neutral[0],
  },
  boxError: {
    borderStyle: 'solid',
    borderColor: Colors.error[600],
  },
  boxDisabled: {
    opacity: 0.5,
    backgroundColor: Colors.neutral[100],
  },
});

const timerStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginTop: 16,
  },
  timer: {
    fontSize: 14,
    color: Colors.neutral[500],
  },
  timerValue: {
    fontWeight: '600',
    color: Colors.neutral[700],
  },
  resendLink: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.brand[500],
  },
});
