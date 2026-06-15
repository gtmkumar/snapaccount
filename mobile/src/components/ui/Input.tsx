/**
 * Input Component — Redesign 2026
 * Clean, spacious input with refined focus states
 */

import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';

interface InputProps extends TextInputProps {
  label?: string;
  hint?: string;
  error?: string;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  required?: boolean;
  size?: 'sm' | 'md' | 'lg';
  showPasswordToggle?: boolean;
}

export function Input({
  label,
  hint,
  error,
  prefix,
  suffix,
  required,
  size = 'md',
  showPasswordToggle,
  secureTextEntry,
  style,
  ...rest
}: InputProps) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const [isFocused, setIsFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const hasError = Boolean(error);

  const isSecure = secureTextEntry && !showPassword;

  return (
    <View style={styles.container}>
      {label && (
        <View style={styles.labelRow}>
          <Text style={styles.label}>{label}</Text>
          {required && <Text style={styles.required}> *</Text>}
        </View>
      )}

      <View
        style={[
          styles.inputContainer,
          styles[`size_${size}`],
          isFocused && !hasError && styles.focused,
          hasError && styles.errorBorder,
          rest.editable === false && styles.disabled,
        ]}
      >
        {prefix && <View style={styles.prefix}>{prefix}</View>}

        <TextInput
          style={[styles.input, style]}
          placeholderTextColor={tokens.textTertiary}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          secureTextEntry={isSecure}
          accessibilityLabel={label}
          accessibilityHint={hint ?? error}
          aria-required={required}
          aria-invalid={hasError}
          {...rest}
        />

        {showPasswordToggle && secureTextEntry && (
          <TouchableOpacity
            onPress={() => setShowPassword(!showPassword)}
            style={styles.suffix}
            accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
          >
            <Text style={styles.toggleText}>{showPassword ? 'Hide' : 'Show'}</Text>
          </TouchableOpacity>
        )}

        {suffix && !showPasswordToggle && (
          <View style={styles.suffix}>{suffix}</View>
        )}
      </View>

      {error ? (
        <Text style={styles.errorText} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text style={styles.hintText}>{hint}</Text>
      ) : null}
    </View>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  labelRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: tk.textSecondary,
    letterSpacing: 0.1,
  },
  required: {
    fontSize: 14,
    color: tk.errorFg,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tk.raised,
    borderWidth: 1.5,
    borderColor: tk.border,
    borderRadius: 12,
  },
  focused: {
    borderColor: tk.brand500,
    borderWidth: 1.5,
    shadowColor: tk.brand500,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 1,
  },
  errorBorder: {
    borderColor: tk.errorCta,
    borderWidth: 1.5,
    shadowColor: tk.errorFg,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 1,
  },
  disabled: {
    backgroundColor: tk.sunken,
    opacity: 0.7,
  },
  // Sizes
  size_sm: {
    height: 40,
    paddingHorizontal: 12,
  },
  size_md: {
    height: 50,
    paddingHorizontal: 14,
  },
  size_lg: {
    height: 56,
    paddingHorizontal: 16,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: tk.textPrimary,
    paddingVertical: 0,
    letterSpacing: 0.1,
  },
  prefix: {
    marginRight: 10,
  },
  suffix: {
    marginLeft: 10,
  },
  hintText: {
    fontSize: 12,
    color: tk.textSecondary,
    marginTop: 6,
    lineHeight: 16,
  },
  errorText: {
    fontSize: 12,
    color: tk.errorFg,
    marginTop: 6,
    lineHeight: 16,
  },
  toggleText: {
    fontSize: 14,
    color: tk.brand500,
    fontWeight: '600',
  },
  }),
);
