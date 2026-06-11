/**
 * ConfirmCancelSheet — destructive confirm for cancelling a consultation.
 * Wave 7A / GAP-031 Flow C. Focus-trapped bottom sheet (accessibilityViewIsModal).
 */

import React, { useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  findNodeHandle,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  createThemedStyles,
  useTheme,
  type ThemeTokens,
} from '../../contexts/ThemeContext';

interface ConfirmCancelSheetProps {
  visible: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmCancelSheet({
  visible,
  busy = false,
  onConfirm,
  onClose,
}: ConfirmCancelSheetProps) {
  const { t } = useTranslation();
  const { tokens } = useTheme();
  const styles = useStyles();
  const titleRef = useRef<Text>(null);

  useEffect(() => {
    if (visible) {
      const timer = setTimeout(() => {
        const node = findNodeHandle(titleRef.current);
        if (node) AccessibilityInfo.setAccessibilityFocus(node);
      }, 250);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable
          style={styles.backdropTouch}
          onPress={onClose}
          accessibilityLabel={t('mobile.common.close')}
        />
        <View style={styles.sheet} accessibilityViewIsModal testID="cancel-confirm-sheet">
          <Text ref={titleRef} style={styles.title} accessibilityRole="header">
            {t('mobile.ca.appt.cancelConfirm')}
          </Text>
          <Text style={styles.body}>{t('mobile.ca.appt.cancelConsequence')}</Text>
          <Pressable
            style={[styles.confirmBtn, busy && styles.btnDisabled]}
            onPress={onConfirm}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel={t('mobile.ca.appt.cancelConfirmCta')}
            accessibilityState={{ disabled: busy }}
            testID="cancel-confirm-cta"
          >
            {busy ? (
              <ActivityIndicator size="small" color={tokens.textOnBrand} />
            ) : (
              <Text style={styles.confirmBtnText}>
                {t('mobile.ca.appt.cancelConfirmCta')}
              </Text>
            )}
          </Pressable>
          <Pressable
            style={styles.keepBtn}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('mobile.ca.appt.keep')}
            testID="cancel-keep-cta"
          >
            <Text style={styles.keepBtnText}>{t('mobile.ca.appt.keep')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.5)',
      justifyContent: 'flex-end',
    },
    backdropTouch: { flex: 1 },
    sheet: {
      backgroundColor: tk.raised,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 24,
      paddingBottom: 36,
      gap: 14,
      ...tk.elevation4,
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: tk.textPrimary,
      textAlign: 'center',
    },
    body: {
      fontSize: 14,
      color: tk.textSecondary,
      textAlign: 'center',
      lineHeight: 21,
    },
    confirmBtn: {
      backgroundColor: tk.errorCta,
      borderRadius: 14,
      minHeight: 52,
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnDisabled: { opacity: 0.4 },
    confirmBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
    keepBtn: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    keepBtnText: { fontSize: 14, fontWeight: '600', color: tk.textSecondary },
  }),
);
