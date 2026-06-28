/**
 * NotificationRow — one swipeable inbox notification row.
 * Phase 6E (DG-NOTIF-05) · spec notification-center-enhancements.md §4.2.
 *
 * Behaviour:
 *   - Right-swipe reveals [Dismiss] (error color) and commits to dismiss.
 *   - Left-swipe reveals [Mark read] (info color).
 *   - Tap → navigate to the notification's deep-link target (Pressable only when
 *     a deep-link exists; otherwise the row is a static View).
 *   - Long-press (500ms) → opens the deep-link preview sheet.
 *   - Unread rows carry a tinted background + a leading unread dot.
 *
 * Touch targets: each revealed swipe action ≥ 44×44pt. All labels via t().
 */

import React, { useRef } from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { timeAgo } from '../../lib/utils';
import { hasInboxDeepLink } from '../../notifications/inboxDeepLink';
import type { InboxNotification } from '../../api/notifications';

export interface NotifTypeStyle {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
}

interface Props {
  item: InboxNotification;
  style: NotifTypeStyle;
  onPress: () => void;
  onLongPress: () => void;
  onMarkRead: () => void;
  onDismiss: () => void;
  testID?: string;
}

export function NotificationRow({
  item,
  style: typeStyle,
  onPress,
  onLongPress,
  onMarkRead,
  onDismiss,
  testID,
}: Props) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const swipeRef = useRef<Swipeable>(null);

  const isUnread = item.status === 'UNREAD';
  const navigable = hasInboxDeepLink(item);

  // Right-swipe (content moves left) → Dismiss action.
  const renderRightActions = () => (
    <Pressable
      style={[styles.swipeAction, { backgroundColor: tokens.errorFg }]}
      onPress={() => {
        swipeRef.current?.close();
        onDismiss();
      }}
      accessibilityRole="button"
      accessibilityLabel={t('mobile.notifications.swipe.dismiss')}
      testID={testID ? `${testID}-dismiss` : undefined}
    >
      <Ionicons name="trash-outline" size={20} color={tokens.raised} />
      <Text style={styles.swipeActionText}>{t('mobile.notifications.swipe.dismiss')}</Text>
    </Pressable>
  );

  // Left-swipe (content moves right) → Mark read action (only when unread).
  const renderLeftActions = () =>
    isUnread ? (
      <Pressable
        style={[styles.swipeAction, { backgroundColor: tokens.infoFg }]}
        onPress={() => {
          swipeRef.current?.close();
          onMarkRead();
        }}
        accessibilityRole="button"
        accessibilityLabel={t('mobile.notifications.swipe.markRead')}
        testID={testID ? `${testID}-mark-read` : undefined}
      >
        <Ionicons name="checkmark-done-outline" size={20} color={tokens.raised} />
        <Text style={styles.swipeActionText}>{t('mobile.notifications.swipe.markRead')}</Text>
      </Pressable>
    ) : null;

  const body = (
    <View style={[styles.row, isUnread && styles.rowUnread]}>
      <View style={[styles.iconWrap, { backgroundColor: typeStyle.bg }]}>
        <Ionicons name={typeStyle.icon} size={20} color={typeStyle.color} />
        {isUnread ? <View style={styles.unreadDot} /> : null}
      </View>
      <View style={styles.content}>
        <Text style={[styles.title, isUnread && styles.titleUnread]} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.body} numberOfLines={2}>
          {item.body}
        </Text>
        <Text style={styles.time}>{timeAgo(item.sentAt)}</Text>
      </View>
      {navigable ? (
        <Ionicons name="chevron-forward" size={16} color={tokens.textTertiary} />
      ) : null}
    </View>
  );

  return (
    <Swipeable
      ref={swipeRef}
      renderRightActions={renderRightActions}
      renderLeftActions={renderLeftActions}
      rightThreshold={40}
      leftThreshold={40}
      friction={2}
      overshootRight={false}
      overshootLeft={false}
    >
      {navigable ? (
        <Pressable
          onPress={onPress}
          onLongPress={onLongPress}
          delayLongPress={500}
          accessibilityRole="button"
          accessibilityLabel={`${item.title}. ${item.body}`}
          accessibilityHint={t('mobile.notifications.preview.openCta')}
          accessibilityActions={[
            { name: 'activate', label: t('mobile.notifications.preview.openCta') },
            ...(isUnread
              ? [{ name: 'markRead', label: t('mobile.notifications.swipe.markRead') }]
              : []),
            { name: 'dismiss', label: t('mobile.notifications.swipe.dismiss') },
          ]}
          onAccessibilityAction={(e) => {
            const name = e.nativeEvent.actionName;
            if (name === 'markRead' && isUnread) onMarkRead();
            else if (name === 'dismiss') onDismiss();
            else onPress();
          }}
          testID={testID}
        >
          {body}
        </Pressable>
      ) : (
        <Pressable
          onLongPress={onLongPress}
          delayLongPress={500}
          accessibilityLabel={`${item.title}. ${item.body}`}
          accessibilityActions={[
            ...(isUnread
              ? [{ name: 'markRead', label: t('mobile.notifications.swipe.markRead') }]
              : []),
            { name: 'dismiss', label: t('mobile.notifications.swipe.dismiss') },
          ]}
          onAccessibilityAction={(e) => {
            const name = e.nativeEvent.actionName;
            if (name === 'markRead' && isUnread) onMarkRead();
            else if (name === 'dismiss') onDismiss();
          }}
          testID={testID}
        >
          {body}
        </Pressable>
      )}
    </Swipeable>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      padding: 16,
      gap: 12,
      backgroundColor: tk.canvas,
      borderBottomWidth: 1,
      borderBottomColor: tk.border,
    },
    rowUnread: {
      backgroundColor: tk.brandTint + '40',
    },
    iconWrap: {
      position: 'relative',
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    unreadDot: {
      position: 'absolute',
      top: 0,
      right: 0,
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: tk.brand500,
      borderWidth: 2,
      borderColor: tk.raised,
    },
    content: {
      flex: 1,
    },
    title: {
      fontSize: 14,
      fontWeight: '600',
      color: tk.textPrimary,
      marginBottom: 4,
    },
    titleUnread: {
      fontWeight: '700',
    },
    body: {
      fontSize: 13,
      color: tk.textSecondary,
      lineHeight: 18,
    },
    time: {
      fontSize: 11,
      color: tk.textTertiary,
      marginTop: 6,
    },
    swipeAction: {
      width: 96,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
    },
    swipeActionText: {
      fontSize: 12,
      fontWeight: '700',
      color: tk.raised,
    },
  }),
);
