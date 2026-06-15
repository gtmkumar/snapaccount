/**
 * DocumentNumberInputs — masked + validated TextInputs for the identity documents
 * collected in the Documents flow. Mirrors PanInput (XXXXX9999X) for the other
 * three kinds so the Documents screen has a consistent input per kind.
 *
 *   - GstinInput   : 15-char GSTIN  (27AABCU9603R1ZM)
 *   - TanInput     : 10-char TAN    (AAAA99999A)
 *   - AadhaarInput : 12-digit Aadhaar (formatted XXXX XXXX XXXX for display)
 *
 * SECURITY: document numbers live only in the parent's transient state — never
 * persisted to SecureStore. Aadhaar is sent normalized (spaces stripped) by the
 * documents API client; this component only formats it for display.
 */

import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { isValidGSTIN, isValidTAN, isValidAadhaar } from '../../lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Shared field shell
// ─────────────────────────────────────────────────────────────────────────────

interface FieldProps {
  value: string;
  onChangeText: (value: string) => void;
  onBlur?: () => void;
  label?: string;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  testID?: string;
}

interface MaskedFieldProps extends FieldProps {
  /** Sanitize raw keystrokes into the canonical stored value. */
  mask: (raw: string) => string;
  /** Validate the (masked) value; return an error key/message or null. */
  validate: (value: string) => string | null;
  /** Format the stored value for display (e.g. Aadhaar spacing). */
  format?: (value: string) => string;
  /** Max length of the *displayed* value. */
  maxLength: number;
  /** Whether the value is "complete & valid" for the valid affordance. */
  isComplete: (value: string) => boolean;
  keyboardType?: 'default' | 'numeric';
  autoCapitalize?: 'none' | 'characters';
  accessibilityLabel: string;
  accessibilityHint: string;
  validText?: string;
}

function MaskedField({
  value,
  onChangeText,
  onBlur,
  label,
  placeholder,
  error,
  disabled = false,
  testID,
  mask,
  validate,
  format,
  maxLength,
  isComplete,
  keyboardType = 'default',
  autoCapitalize = 'none',
  accessibilityLabel,
  accessibilityHint,
  validText,
}: MaskedFieldProps) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const [touched, setTouched] = useState(false);
  const internalError = touched ? validate(value) : null;
  const displayError = error ?? internalError;
  const complete = isComplete(value);
  const display = format ? format(value) : value;

  const handleChange = (raw: string) => {
    onChangeText(mask(raw));
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
        value={display}
        onChangeText={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        placeholderTextColor={tokens.textTertiary}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        keyboardType={keyboardType}
        maxLength={maxLength}
        editable={!disabled}
        style={[
          styles.input,
          displayError && styles.inputError,
          disabled && styles.inputDisabled,
          complete && !displayError && styles.inputValid,
        ]}
        accessibilityLabel={label ?? accessibilityLabel}
        accessibilityHint={accessibilityHint}
      />
      {displayError ? (
        <Text style={styles.errorText}>{displayError}</Text>
      ) : complete && validText ? (
        <Text style={styles.validText}>{validText}</Text>
      ) : null}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GSTIN — 15 chars: 27AABCU9603R1ZM
// ─────────────────────────────────────────────────────────────────────────────

function maskGstin(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15);
}

export function GstinInput(props: FieldProps) {
  const { t } = useTranslation();
  return (
    <MaskedField
      {...props}
      placeholder={props.placeholder ?? '27AABCU9603R1ZM'}
      mask={maskGstin}
      maxLength={15}
      autoCapitalize="characters"
      validate={(v) =>
        !v ? null : v.length < 15
          ? t('mobile.documents.validation.gstinLength')
          : !isValidGSTIN(v)
            ? t('mobile.documents.validation.gstinFormat')
            : null
      }
      isComplete={(v) => v.length === 15 && isValidGSTIN(v)}
      validText={t('mobile.documents.validation.gstinValid')}
      accessibilityLabel="GSTIN"
      accessibilityHint={t('mobile.documents.validation.gstinHint')}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TAN — 10 chars: AAAA99999A
// ─────────────────────────────────────────────────────────────────────────────

function maskTan(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
}

export function TanInput(props: FieldProps) {
  const { t } = useTranslation();
  return (
    <MaskedField
      {...props}
      placeholder={props.placeholder ?? 'AAAA99999A'}
      mask={maskTan}
      maxLength={10}
      autoCapitalize="characters"
      validate={(v) =>
        !v ? null : v.length < 10
          ? t('mobile.documents.validation.tanLength')
          : !isValidTAN(v)
            ? t('mobile.documents.validation.tanFormat')
            : null
      }
      isComplete={(v) => v.length === 10 && isValidTAN(v)}
      validText={t('mobile.documents.validation.tanValid')}
      accessibilityLabel="TAN"
      accessibilityHint={t('mobile.documents.validation.tanHint')}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Aadhaar — 12 digits, displayed as XXXX XXXX XXXX
// ─────────────────────────────────────────────────────────────────────────────

/** Store only the 12 raw digits; strip spaces/hyphens/non-digits. */
function maskAadhaarDigits(value: string): string {
  return value.replace(/\D/g, '').slice(0, 12);
}

/** Format 12 digits into 3 groups of 4 for display. */
function formatAadhaar(value: string): string {
  return value.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}

export function AadhaarNumberInput(props: FieldProps) {
  const { t } = useTranslation();
  return (
    <MaskedField
      {...props}
      placeholder={props.placeholder ?? 'XXXX XXXX XXXX'}
      mask={maskAadhaarDigits}
      format={formatAadhaar}
      // 12 digits + 2 spaces = 14 displayed characters.
      maxLength={14}
      keyboardType="numeric"
      validate={(v) =>
        !v ? null : v.length < 12
          ? t('mobile.documents.validation.aadhaarLength')
          : !isValidAadhaar(v)
            ? t('mobile.documents.validation.aadhaarFormat')
            : null
      }
      isComplete={(v) => isValidAadhaar(v)}
      validText={t('mobile.documents.validation.aadhaarValid')}
      accessibilityLabel="Aadhaar"
      accessibilityHint={t('mobile.documents.validation.aadhaarHint')}
    />
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
    height: 48,
    borderWidth: 1.5,
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
    color: tk.successFg,
  },
  }),
);
