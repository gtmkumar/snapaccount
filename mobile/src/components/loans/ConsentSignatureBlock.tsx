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
import { Colors } from '../../constants/colors';

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
  signLabel = 'Sign & continue',
  declineLabel = 'Decline',
  testID,
}: ConsentSignatureBlockProps) {
  const canSign = scrolledToBottom && checked && !isSubmitting;

  return (
    <View testID={testID} style={styles.container}>
      {/* Scroll gate hint */}
      {!scrolledToBottom && (
        <View style={styles.gateHint}>
          <Ionicons name="lock-closed-outline" size={14} color={Colors.neutral[400]} />
          <Text style={styles.gateHintText}>Scroll to the end to enable acceptance</Text>
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
            : `Disabled. Scroll to the end of the document to enable. ${flagText}`
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
          {checked && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
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
          accessibilityLabel={declineLabel}
          hitSlop={8}
        >
          <Text style={styles.declineBtnText}>{declineLabel}</Text>
        </Pressable>

        <Pressable
          style={[styles.signBtn, !canSign && styles.signBtnDisabled]}
          onPress={canSign ? onSign : undefined}
          disabled={!canSign}
          accessibilityRole="button"
          accessibilityLabel={signLabel}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Ionicons
                name="shield-checkmark"
                size={16}
                color={canSign ? '#FFFFFF' : Colors.neutral[400]}
              />
              <Text style={[styles.signBtnText, !canSign && styles.signBtnTextDisabled]}>
                {signLabel}
              </Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface.default,
    borderTopWidth: 1,
    borderTopColor: Colors.neutral[100],
    padding: 16,
    gap: 12,
  },
  gateHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.neutral[50],
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  gateHintText: {
    fontSize: 12,
    color: Colors.neutral[500],
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
    borderColor: Colors.neutral[300],
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: Colors.loan,
    borderColor: Colors.loan,
  },
  checkboxDisabled: {
    backgroundColor: Colors.neutral[100],
    borderColor: Colors.neutral[200],
  },
  flagText: {
    flex: 1,
    fontSize: 13,
    color: Colors.neutral[700],
    lineHeight: 19,
    fontWeight: '500',
  },
  flagTextDisabled: {
    color: Colors.neutral[400],
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
    borderColor: Colors.neutral[200],
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.neutral[600],
  },
  signBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: Colors.loan,
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
    color: '#FFFFFF',
  },
  signBtnTextDisabled: {
    color: Colors.neutral[400],
  },
});
