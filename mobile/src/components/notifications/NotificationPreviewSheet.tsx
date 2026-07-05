/**
 * NotificationPreviewSheet — long-press deep-link preview bottom-sheet.
 * Phase 6E (DG-NOTIF-05) · spec notification-center-enhancements.md §4.4.
 *
 * Long-pressing an inbox row (500ms) opens this sheet showing where the
 * notification will take you BEFORE committing:
 *   - Target screen name + breadcrumb (deepLinkLabel / linkedEntityLabel).
 *   - Module icon + a short snippet of the notification body.
 *   - Primary CTA [Open] (full-width), secondary [Mark read], tertiary [Dismiss].
 * Auto-dismisses on Open or backdrop tap.
 *
 * Reuses the Modal bottom-sheet pattern from ImsEducationSheet. All text via t().
 * 44×44pt min touch targets on every action.
 */

import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import type { InboxNotification } from '../../api/notifications';

interface Props {
  /** The notification being previewed; null hides the sheet. */
  notification: InboxNotification | null;
  /** Icon + tint for the notification's category. */
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconBg: string;
  /** Breadcrumb / target label (deepLinkLabel ?? linkedEntityLabel ?? title). */
  breadcrumb?: string | null;
  onOpen: () => void;
  onMarkRead: () => void;
  onDismiss: () => void;
  onClose: () => void;
  testID?: string;
}

export function NotificationPreviewSheet({
  notification,
  icon,
  iconColor,
  iconBg,
  breadcrumb,
  onOpen,
  onMarkRead,
  onDismiss,
  onClose,
  testID = 'notif-preview-sheet',
}: Props) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();

  const visible = notification !== null;
  const isUnread = notification?.status === 'UNREAD';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable
          style={styles.backdropTouch}
          onPress={onClose}
          accessibilityLabel={t('mobile.common.close')}
          accessibilityRole="button"
        />
        <View style={styles.sheet} accessibilityViewIsModal testID={testID}>
          <View style={styles.grabber} />

          <View style={styles.headerRow}>
            <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
              <Ionicons name={icon} size={22} color={iconColor} />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.previewLabel}>
                {t('mobile.notifications.preview.breadcrumb')}
              </Text>
              <Text style={styles.breadcrumb} numberOfLines={2}>
                {breadcrumb ?? notification?.title ?? ''}
              </Text>
            </View>
          </View>

          {notification?.body ? (
            <Text style={styles.snippet} numberOfLines={4}>
              {notification.body}
            </Text>
          ) : null}

          {/* Primary CTA — full-width Open */}
          <Pressable
            style={styles.openBtn}
            onPress={onOpen}
            accessibilityRole="button"
            accessibilityLabel={t('mobile.notifications.preview.openCta')}
            testID={`${testID}-open`}
          >
            <Ionicons name="open-outline" size={18} color={tokens.raised} />
            <Text style={styles.openBtnText}>
              {notification?.deepLinkLabel ?? t('mobile.notifications.preview.openCta')}
            </Text>
          </Pressable>

          <View style={styles.secondaryRow}>
            {isUnread ? (
              <Pressable
                style={styles.secondaryBtn}
                onPress={onMarkRead}
                accessibilityRole="button"
                accessibilityLabel={t('mobile.notifications.swipe.markRead')}
                testID={`${testID}-mark-read`}
              >
                <Ionicons name="checkmark-circle-outline" size={16} color={tokens.textSecondary} />
                <Text style={styles.secondaryBtnText}>
                  {t('mobile.notifications.swipe.markRead')}
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              style={styles.secondaryBtn}
              onPress={onDismiss}
              accessibilityRole="button"
              accessibilityLabel={t('mobile.notifications.swipe.dismiss')}
              testID={`${testID}-dismiss`}
            >
              <Ionicons name="trash-outline" size={16} color={tokens.errorFg} />
              <Text style={[styles.secondaryBtnText, { color: tokens.errorFg }]}>
                {t('mobile.notifications.swipe.dismiss')}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: '#0008',
    },
    backdropTouch: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
    sheet: {
      backgroundColor: tk.raised,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 20,
      paddingTop: 10,
      paddingBottom: 28,
      gap: 14,
    },
    grabber: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: tk.border,
      marginBottom: 6,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    iconWrap: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerText: {
      flex: 1,
    },
    previewLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: tk.textTertiary,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      marginBottom: 2,
    },
    breadcrumb: {
      fontSize: 15,
      fontWeight: '700',
      color: tk.textPrimary,
    },
    snippet: {
      fontSize: 14,
      lineHeight: 20,
      color: tk.textSecondary,
    },
    openBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      minHeight: 48,
      borderRadius: 14,
      backgroundColor: tk.brand500,
    },
    openBtnText: {
      fontSize: 15,
      fontWeight: '700',
      color: tk.raised,
    },
    secondaryRow: {
      flexDirection: 'row',
      gap: 12,
    },
    secondaryBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      minHeight: 44,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: tk.border,
      backgroundColor: tk.sunken,
    },
    secondaryBtnText: {
      fontSize: 13,
      fontWeight: '600',
      color: tk.textSecondary,
    },
  }),
);
