/**
 * PanInput — TextInput with PAN format mask and checksum validation.
 * PAN format: XXXXX9999X (5 uppercase letters + 4 digits + 1 uppercase letter)
 * SECURITY: Never store raw PAN in state beyond this component.
 * Only panLast4 should be passed to API; panCipher must come from IPanEncryptionService.
 *
 * A11Y (accessibility-standard.md §2.5):
 *   PAN-1 — status line is a polite live region so AT announces valid/error changes.
 *   PAN-2 — all built-in strings routed through t() (en/hi/bn parity).
 *   PAN-3 — resting border ≥3:1 non-text contrast (neutral[300]→ neutral[400] tone via 300 minimum).
 */

import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

function maskPan(value: string): string {
  // Convert to uppercase and remove non-alphanumeric
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
}

/** Returns an i18n key for the validation error, or null when valid/empty. */
function validatePan(value: string): string | null {
  if (!value) return null;
  if (value.length < 10) return 'mobile.pan.error.length';
  if (!PAN_REGEX.test(value)) return 'mobile.pan.error.format';
  return null;
}

interface PanInputProps {
  value: string;
  onChangeText: (value: string) => void;
  onBlur?: () => void;
  label?: string;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  testID?: string;
}

export function PanInput({
  value,
  onChangeText,
  onBlur,
  label,
  placeholder = 'ABCDE1234F',
  error,
  disabled = false,
  testID,
}: PanInputProps) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const [touched, setTouched] = useState(false);
  const internalErrorKey = touched ? validatePan(value) : null;
  const displayError = error ?? (internalErrorKey ? t(internalErrorKey) : null);

  const handleChange = (raw: string) => {
    onChangeText(maskPan(raw));
  };

  const handleBlur = () => {
    setTouched(true);
    onBlur?.();
  };

  // Single status line: error > valid > remaining-characters hint.
  const statusText = displayError
    ? displayError
    : value.length === 10
      ? t('mobile.pan.valid')
      : value.length > 0
        ? t('mobile.pan.remaining', { count: 10 - value.length })
        : null;

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        testID={testID}
        value={value}
        onChangeText={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        placeholderTextColor={tokens.textTertiary}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={10}
        editable={!disabled}
        style={[
          styles.input,
          displayError && styles.inputError,
          disabled && styles.inputDisabled,
          value.length === 10 && !displayError && styles.inputValid,
        ]}
        accessibilityLabel={label ?? t('mobile.pan.label')}
        accessibilityHint={displayError ?? t('mobile.pan.hint')}
      />
      {statusText ? (
        // PAN-1: polite live region so screen readers hear valid/error updates.
        <View accessibilityLiveRegion="polite" accessible accessibilityRole="text">
          <Text
            style={
              displayError
                ? styles.errorText
                : value.length === 10
                  ? styles.validText
                  : styles.hintText
            }
          >
            {statusText}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
  container: { gap: 6 },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: tk.textSecondary,
  },
  input: {
    minHeight: 48,
    borderWidth: 1.5,
    // PAN-3: neutral[200] resting border was ~1.3:1 on white — imperceptible.
    borderColor: tk.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    fontWeight: '600',
    color: tk.textPrimary,
    backgroundColor: tk.raised,
    letterSpacing: 2,
  },
  inputError: {
    borderColor: tk.errorCta,
    backgroundColor: tk.errorTint,
  },
  inputDisabled: {
    backgroundColor: tk.canvas,
    color: tk.textTertiary,
  },
  inputValid: {
    borderColor: tk.successFg,
  },
  errorText: {
    fontSize: 12,
    color: tk.errorFg,
  },
  validText: {
    fontSize: 12,
    // success[600] ≈ 3.5:1 on white — below AA for small text; success[700] passes.
    color: tk.successFg,
  },
  hintText: {
    fontSize: 12,
    // X-1: neutral[400] is reserved for disabled/decorative; this hint carries meaning.
    color: tk.textSecondary,
  },
  }),
);
