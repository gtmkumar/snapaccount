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
import { Colors } from '../../constants/colors';

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
          placeholderTextColor={Colors.neutral[400]}
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

const styles = StyleSheet.create({
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
    color: Colors.neutral[700],
    letterSpacing: 0.1,
  },
  required: {
    fontSize: 14,
    color: Colors.error[500],
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.neutral[0],
    borderWidth: 1.5,
    borderColor: Colors.neutral[200],
    borderRadius: 12,
  },
  focused: {
    borderColor: Colors.brand[500],
    borderWidth: 1.5,
    shadowColor: Colors.brand[500],
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 1,
  },
  errorBorder: {
    borderColor: Colors.error[500],
    borderWidth: 1.5,
    shadowColor: Colors.error[500],
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 1,
  },
  disabled: {
    backgroundColor: Colors.neutral[100],
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
    color: Colors.neutral[900],
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
    color: Colors.neutral[500],
    marginTop: 6,
    lineHeight: 16,
  },
  errorText: {
    fontSize: 12,
    color: Colors.error[600],
    marginTop: 6,
    lineHeight: 16,
  },
  toggleText: {
    fontSize: 14,
    color: Colors.brand[500],
    fontWeight: '600',
  },
});
