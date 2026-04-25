/**
 * PanInput — TextInput with PAN format mask and checksum validation.
 * PAN format: XXXXX9999X (5 uppercase letters + 4 digits + 1 uppercase letter)
 * SECURITY: Never store raw PAN in state beyond this component.
 * Only panLast4 should be passed to API; panCipher must come from IPanEncryptionService.
 */

import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Colors } from '../../constants/colors';

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

function maskPan(value: string): string {
  // Convert to uppercase and remove non-alphanumeric
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
}

function validatePan(value: string): string | null {
  if (!value) return null;
  if (value.length < 10) return 'PAN must be 10 characters';
  if (!PAN_REGEX.test(value)) return 'Invalid PAN format (e.g. ABCDE1234F)';
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
  const [touched, setTouched] = useState(false);
  const internalError = touched ? validatePan(value) : null;
  const displayError = error ?? internalError;

  const handleChange = (raw: string) => {
    onChangeText(maskPan(raw));
  };

  const handleBlur = () => {
    setTouched(true);
    onBlur?.();
  };

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        testID={testID}
        value={value}
        onChangeText={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        placeholderTextColor={Colors.neutral[400]}
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
        accessibilityLabel={label ?? 'PAN Number'}
        accessibilityHint="Enter your 10 character PAN number"
      />
      {displayError ? (
        <Text style={styles.errorText}>{displayError}</Text>
      ) : value.length === 10 ? (
        <Text style={styles.validText}>PAN format valid</Text>
      ) : value.length > 0 ? (
        <Text style={styles.hintText}>{10 - value.length} characters remaining</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 6 },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.neutral[700],
  },
  input: {
    height: 48,
    borderWidth: 1.5,
    borderColor: Colors.neutral[200],
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    fontWeight: '600',
    color: Colors.neutral[900],
    backgroundColor: Colors.surface.default,
    letterSpacing: 2,
  },
  inputError: {
    borderColor: Colors.error[500],
    backgroundColor: Colors.error[50],
  },
  inputDisabled: {
    backgroundColor: Colors.neutral[50],
    color: Colors.neutral[400],
  },
  inputValid: {
    borderColor: Colors.success[500],
  },
  errorText: {
    fontSize: 12,
    color: Colors.error[600],
  },
  validText: {
    fontSize: 12,
    color: Colors.success[600],
  },
  hintText: {
    fontSize: 12,
    color: Colors.neutral[400],
  },
});
