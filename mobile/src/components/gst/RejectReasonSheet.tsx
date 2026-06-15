/**
 * RejectReasonSheet — confirmation bottom sheet for IMS invoice rejection.
 * Spec: docs/design/ims-inbox-spec.md §6.2 (single) + §6.4 (bulk, shared reason).
 *
 * Reason is REQUIRED client-side (min 3 chars, max 250) even though the server
 * accepts null — UX decision for audit quality + GSTR-1A follow-up traceability
 * (spec §0). Quick-pick chips fill the field but stay editable.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  findNodeHandle,
  AccessibilityInfo,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  createThemedStyles,
  useTheme,
  type ThemeTokens,
} from '../../contexts/ThemeContext';
import { Button } from '../ui/Button';

export const REJECT_REASON_MIN_LENGTH = 3;
export const REJECT_REASON_MAX_LENGTH = 250;

const QUICK_REASON_KEYS = [
  'mobile.gst.ims.reject.reason.price',
  'mobile.gst.ims.reject.reason.notReceived',
  'mobile.gst.ims.reject.reason.duplicate',
  'mobile.gst.ims.reject.reason.taxRate',
  'mobile.gst.ims.reject.reason.notMine',
] as const;

interface Props {
  visible: boolean;
  /** Single-invoice mode: the invoice number being rejected. */
  invoiceNumber?: string;
  /** Bulk mode: how many eligible invoices the shared reason applies to. */
  bulkEligibleCount?: number;
  /** Bulk mode: how many selected rows are skipped (already settled). */
  bulkSkippedCount?: number;
  busy?: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}

export function RejectReasonSheet({
  visible,
  invoiceNumber,
  bulkEligibleCount,
  bulkSkippedCount = 0,
  busy = false,
  onConfirm,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const { tokens } = useTheme();
  const styles = useStyles();
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const isBulk = typeof bulkEligibleCount === 'number';
  const trimmed = reason.trim();
  const valid = trimmed.length >= REJECT_REASON_MIN_LENGTH;

  // Reset the form each time the sheet opens (adjust-state-during-render pattern).
  const [prevVisible, setPrevVisible] = useState(visible);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (visible) {
      setReason('');
      setTouched(false);
    }
  }

  // Set initial focus to the reason field (a11y CON-4 modal pattern).
  useEffect(() => {
    if (visible) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
        const node = findNodeHandle(inputRef.current);
        if (node) AccessibilityInfo.setAccessibilityFocus(node);
      }, 250);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [visible]);

  const title = isBulk
    ? t('mobile.gst.ims.bulk.rejectTitle', { count: bulkEligibleCount })
    : t('mobile.gst.ims.reject.title', { invoiceNumber: invoiceNumber ?? '' });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose} // back gesture dismiss (a11y §10.4)
    >
      <View style={styles.backdrop}>
        <Pressable
          style={styles.backdropTouch}
          onPress={onClose}
          accessibilityLabel={t('mobile.common.close')}
        />
        <View style={styles.sheet} accessibilityViewIsModal>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.title} accessibilityRole="header">
              {title}
            </Text>
            <Text style={styles.consequence}>
              {t('mobile.gst.ims.reject.consequence')}
            </Text>
            {isBulk ? (
              <Text style={styles.preflight} testID="ims-bulk-preflight">
                {t('mobile.gst.ims.bulk.preflight', {
                  change: bulkEligibleCount,
                  action: t('mobile.gst.ims.status.REJECTED'),
                  skip: bulkSkippedCount,
                })}
              </Text>
            ) : null}

            <Text style={styles.reasonLabel}>
              {t('mobile.gst.ims.reject.reasonLabel')}
            </Text>
            <TextInput
              ref={inputRef}
              style={styles.input}
              value={reason}
              onChangeText={(v) => {
                setReason(v);
                setTouched(true);
              }}
              multiline
              numberOfLines={3}
              maxLength={REJECT_REASON_MAX_LENGTH}
              placeholder={t('mobile.gst.ims.reject.reasonLabel')}
              placeholderTextColor={tokens.textTertiary}
              accessibilityLabel={t('mobile.gst.ims.reject.reasonLabel')}
              testID="ims-reject-reason-input"
            />
            {touched && !valid ? (
              <Text
                style={styles.error}
                accessibilityLiveRegion="assertive"
                testID="ims-reject-reason-error"
              >
                {t('mobile.gst.ims.reject.reasonRequired')}
              </Text>
            ) : null}

            {/* Quick-pick chips — fill the field, still editable */}
            <View style={styles.chipsWrap}>
              {QUICK_REASON_KEYS.map((key) => {
                const label = t(key);
                const active = reason === label;
                return (
                  <Pressable
                    key={key}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => {
                      setReason(label);
                      setTouched(true);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={label}
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.buttons}>
              <Button
                label={t('mobile.common.cancel')}
                variant="secondary"
                onPress={onClose}
                disabled={busy}
                style={styles.flexBtn}
              />
              <Button
                label={t('mobile.gst.ims.reject.confirm')}
                variant="danger"
                loading={busy}
                disabled={!valid || busy}
                onPress={() => {
                  setTouched(true);
                  if (valid) onConfirm(trimmed);
                }}
                style={styles.flexBtn}
                testID="ims-reject-confirm"
              />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.55)',
      justifyContent: 'flex-end',
    },
    backdropTouch: {
      flex: 1,
    },
    sheet: {
      backgroundColor: tk.raised,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 20,
      paddingBottom: 32,
      maxHeight: '85%',
      ...tk.elevation3,
    },
    title: {
      fontSize: 18,
      fontWeight: '800',
      color: tk.textPrimary,
      marginBottom: 8,
    },
    consequence: {
      fontSize: 14,
      lineHeight: 21,
      color: tk.textSecondary,
      marginBottom: 8,
    },
    preflight: {
      fontSize: 13,
      fontWeight: '600',
      color: tk.warningFg,
      backgroundColor: tk.warningTint,
      borderWidth: 1,
      borderColor: tk.warningTintBorder,
      borderRadius: 10,
      padding: 10,
      marginBottom: 8,
    },
    reasonLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: tk.textPrimary,
      marginTop: 8,
      marginBottom: 6,
    },
    input: {
      minHeight: 88,
      borderWidth: 1,
      borderColor: tk.border,
      borderRadius: 12,
      backgroundColor: tk.inputBg,
      color: tk.textPrimary,
      padding: 12,
      fontSize: 14,
      textAlignVertical: 'top',
    },
    error: {
      fontSize: 12,
      fontWeight: '600',
      color: tk.errorFg,
      marginTop: 6,
    },
    chipsWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 12,
    },
    chip: {
      minHeight: 44, // 44pt target (a11y 2.5.8)
      justifyContent: 'center',
      paddingHorizontal: 14,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: tk.border,
      backgroundColor: tk.sunken,
    },
    chipActive: {
      backgroundColor: tk.brandTint,
      borderColor: tk.brandFg,
    },
    chipText: {
      fontSize: 13,
      fontWeight: '600',
      color: tk.textSecondary,
    },
    chipTextActive: {
      color: tk.brandFg,
    },
    buttons: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 20,
    },
    flexBtn: {
      flex: 1,
    },
  }),
);
