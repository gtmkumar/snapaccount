/**
 * ConsentSignatureBlock — Sticky-bottom consent acceptance block.
 * Contains: disabled-until-scrolled checkbox + Decline + Sign-and-continue CTA.
 * Phase 6C — docs/design/component-library.md addendum
 *
 * scroll-to-bottom-before-enable rule: checkbox is disabled until parent sets
 * `scrolledToBottom=true`, which is triggered when contentOffset + viewHeight >= contentSize - 24.
 */

import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import {
  createThemedStyles,
  useTheme,
  type ThemeTokens,
} from '../../contexts/ThemeContext';

interface ConsentSignatureBlockProps {
  /** Text rendered next to the checkbox: "I, {name}, consent to..." */
  flagText: string;
  /** True once user has scrolled to bottom — enables checkbox */
  scrolledToBottom: boolean;
  checked: boolean;
  onToggle: () => void;
  onDecline: () => void;
  onSign: () => void;
  isSubmitting?: boolean;
  signLabel?: string;
  declineLabel?: string;
  testID?: string;
}

export function ConsentSignatureBlock({
  flagText,
  scrolledToBottom,
  checked,
  onToggle,
  onDecline,
  onSign,
  isSubmitting = false,
  signLabel,
  declineLabel,
  testID,
}: ConsentSignatureBlockProps) {
  // X-2 (a11y): gate hint + disabled AT copy were hardcoded English.
  const { t } = useTranslation();
  const { tokens } = useTheme();
  const styles = useStyles();
  const canSign = scrolledToBottom && checked && !isSubmitting;
  const resolvedSignLabel = signLabel ?? t('mobile.loan.consent.cta.signContinue');
  const resolvedDeclineLabel = declineLabel ?? t('mobile.loan.consent.cta.decline');

  return (
    <View testID={testID} style={styles.container}>
      {/* Scroll gate hint */}
      {!scrolledToBottom && (
        <View style={styles.gateHint}>
          <Ionicons name="lock-closed-outline" size={14} color={tokens.textTertiary} />
          <Text style={styles.gateHintText}>{t('mobile.a11y.scrollGateHint')}</Text>
        </View>
      )}

      {/* Checkbox row */}
      <Pressable
        style={styles.checkRow}
        onPress={scrolledToBottom ? onToggle : undefined}
        disabled={!scrolledToBottom}
        accessibilityRole="checkbox"
        accessibilityState={{ checked, disabled: !scrolledToBottom }}
        accessibilityLabel={
          scrolledToBottom
            ? flagText
            : `${t('mobile.a11y.scrollGateDisabled')} ${flagText}`
        }
        hitSlop={8}
      >
        <View
          style={[
            styles.checkbox,
            checked && styles.checkboxChecked,
            !scrolledToBottom && styles.checkboxDisabled,
          ]}
        >
          {checked && <Ionicons name="checkmark" size={14} color={tokens.textOnBrand} />}
        </View>
        <Text
          style={[styles.flagText, !scrolledToBottom && styles.flagTextDisabled]}
          numberOfLines={3}
        >
          {flagText}
        </Text>
      </Pressable>

      {/* Action buttons */}
      <View style={styles.actions}>
        <Pressable
          style={styles.declineBtn}
          onPress={onDecline}
          accessibilityRole="button"
          accessibilityLabel={resolvedDeclineLabel}
          hitSlop={8}
        >
          <Text style={styles.declineBtnText}>{resolvedDeclineLabel}</Text>
        </Pressable>

        <Pressable
          style={[styles.signBtn, !canSign && styles.signBtnDisabled]}
          onPress={canSign ? onSign : undefined}
          disabled={!canSign}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSign }}
          accessibilityLabel={resolvedSignLabel}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color={tokens.textOnBrand} />
          ) : (
            <>
              <Ionicons
                name="shield-checkmark"
                size={16}
                color={canSign ? tokens.textOnBrand : tokens.textDisabled}
              />
              <Text style={[styles.signBtnText, !canSign && styles.signBtnTextDisabled]}>
                {resolvedSignLabel}
              </Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
    container: {
      backgroundColor: tk.raised,
      borderTopWidth: 1,
      borderTopColor: tk.border,
      padding: 16,
      gap: 12,
    },
    gateHint: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: tk.sunken,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    gateHintText: {
      fontSize: 12,
      color: tk.textSecondary,
      fontWeight: '500',
    },
    checkRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: tk.border,
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
      marginTop: 1,
    },
    checkboxChecked: {
      // Loan module accent (tokens.json module.loan, themed: lifted in dark).
      backgroundColor: tk.loanAccent,
      borderColor: tk.loanAccent,
    },
    checkboxDisabled: {
      backgroundColor: tk.sunken,
      borderColor: tk.border,
    },
    flagText: {
      flex: 1,
      fontSize: 13,
      color: tk.textSecondary,
      lineHeight: 19,
      fontWeight: '500',
    },
    flagTextDisabled: {
      color: tk.textDisabled,
    },
    actions: {
      flexDirection: 'row',
      gap: 10,
    },
    declineBtn: {
      minHeight: 48,
      paddingHorizontal: 20,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: tk.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    declineBtnText: {
      fontSize: 14,
      fontWeight: '600',
      color: tk.textSecondary,
    },
    signBtn: {
      flex: 1,
      minHeight: 48,
      borderRadius: 12,
      backgroundColor: tk.loanAccent,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    signBtnDisabled: {
      opacity: 0.4,
    },
    signBtnText: {
      fontSize: 15,
      fontWeight: '700',
      color: tk.textOnBrand,
    },
    signBtnTextDisabled: {
      color: tk.textDisabled,
    },
  }),
);
