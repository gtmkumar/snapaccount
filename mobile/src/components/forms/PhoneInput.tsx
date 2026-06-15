/**
 * PhoneInput Component
 * Indian phone number entry with +91 prefix
 * Matches component-library.md §1.2
 */

import React from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { sanitizePhone } from '../../lib/utils';

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}

export function PhoneInput({
  value,
  onChange,
  error,
  disabled = false,
  autoFocus = false,
}: PhoneInputProps) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const hasError = Boolean(error);

  const handleChange = (text: string) => {
    // Sanitize: strip +91, leading 0, non-digits, limit to 10
    const sanitized = sanitizePhone(text);
    onChange(sanitized);
  };

  return (
    <View style={styles.wrapper}>
      <View
        style={[
          styles.container,
          hasError && styles.errorBorder,
          disabled && styles.disabled,
        ]}
      >
        {/* +91 prefix badge */}
        <View style={styles.prefix}>
          <Text style={styles.prefixText}>+91</Text>
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Phone number input */}
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={handleChange}
          keyboardType="numeric"
          maxLength={10}
          placeholder="XXXXX XXXXX"
          placeholderTextColor={tokens.textTertiary}
          editable={!disabled}
          autoFocus={autoFocus}
          textContentType="telephoneNumber"
          importantForAutofill="yes"
          accessibilityLabel="Mobile number"
          accessibilityHint="Enter 10-digit Indian mobile number"
        />
      </View>

      {hasError && (
        <Text style={styles.errorText} accessibilityLiveRegion="polite">
          {error}
        </Text>
      )}
    </View>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
  wrapper: {
    marginBottom: 16,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tk.sunken,
    borderWidth: 1,
    borderColor: tk.border,
    borderRadius: 8,
    height: 56,
    overflow: 'hidden',
  },
  errorBorder: {
    borderColor: tk.errorCta,
    borderWidth: 2,
  },
  disabled: {
    opacity: 0.6,
  },
  prefix: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: tk.sunken,
  },
  prefixText: {
    fontSize: 18,
    fontWeight: '600',
    color: tk.textSecondary,
    letterSpacing: 0.5,
  },
  divider: {
    width: 1,
    height: 32,
    backgroundColor: tk.border,
  },
  input: {
    flex: 1,
    paddingHorizontal: 16,
    fontSize: 22,
    fontWeight: '600',
    color: tk.textPrimary,
    letterSpacing: 1,
  },
  errorText: {
    fontSize: 12,
    color: tk.errorFg,
    marginTop: 4,
  },
  }),
);
