/**
 * NoticeRowMobile — Swipeable notice card with archive + mark-read actions.
 * Used by GstNoticeInboxScreen and ItrNoticeInboxScreen.
 * Accessibility: full accessibilityActions for swipe gestures.
 */

import React, { useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  AccessibilityActionEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { DueDateChip } from './DueDateChip';

export interface NoticeRowMobileProps {
  id: string;
  noticeNumber: string;
  noticeType: string;
  status: string;
  issuedDate: string;
  dueDate?: string;
  description?: string;
  onPress: () => void;
  onArchive?: () => void;
  onMarkRead?: () => void;
  /** When true, swipe-to-archive is disabled (e.g. awaiting response) */
  archiveGated?: boolean;
  testID?: string;
}

export function NoticeRowMobile({
  noticeNumber,
  noticeType,
  status,
  issuedDate,
  dueDate,
  description,
  onPress,
  onArchive,
  onMarkRead,
  archiveGated = false,
  testID,
}: NoticeRowMobileProps) {
  const slideAnim = useRef(new Animated.Value(0)).current;

  const isOpen = status === 'Open' || status === 'Overdue';
  const isOverdue = status === 'Overdue';

  const statusColor = isOverdue
    ? Colors.error[500]
    : isOpen
    ? Colors.warning[500]
    : Colors.success[500];

  const handleAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'archive' && onArchive && !archiveGated) {
      onArchive();
    } else if (event.nativeEvent.actionName === 'markRead' && onMarkRead) {
      onMarkRead();
    } else if (event.nativeEvent.actionName === 'activate') {
      onPress();
    }
  };

  return (
    <Animated.View
      style={[styles.wrapper, { transform: [{ translateX: slideAnim }] }]}
    >
      <Pressable
        testID={testID}
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`Notice ${noticeNumber}, type ${noticeType}, status ${status}`}
        accessibilityHint="Tap to view notice details"
        accessibilityActions={[
          { name: 'activate', label: 'View details' },
          ...(onMarkRead ? [{ name: 'markRead', label: 'Mark as read' }] : []),
          ...(!archiveGated && onArchive
            ? [{ name: 'archive', label: 'Archive notice' }]
            : []),
        ]}
        onAccessibilityAction={handleAccessibilityAction}
      >
        {/* Status stripe */}
        <View style={[styles.statusStripe, { backgroundColor: statusColor }]} />

        <View style={styles.content}>
          {/* Header row */}
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              <View style={styles.typeBadge}>
                <Text style={styles.typeBadgeText}>{noticeType}</Text>
              </View>
              <Text style={styles.noticeNumber} numberOfLines={1}>
                {noticeNumber}
              </Text>
            </View>
            <View
              style={[styles.statusPill, { backgroundColor: statusColor + '18' }]}
            >
              <Text style={[styles.statusText, { color: statusColor }]}>
                {status}
              </Text>
            </View>
          </View>

          {/* Description */}
          {description ? (
            <Text style={styles.description} numberOfLines={2}>
              {description}
            </Text>
          ) : null}

          {/* Footer row */}
          <View style={styles.footerRow}>
            <Text style={styles.issuedDate}>Issued {issuedDate}</Text>
            {dueDate ? <DueDateChip dueDate={dueDate} /> : null}
          </View>

          {/* Action buttons */}
          <View style={styles.actionRow}>
            {onMarkRead && (
              <Pressable
                style={styles.actionBtn}
                onPress={onMarkRead}
                accessibilityLabel="Mark as read"
                hitSlop={8}
              >
                <Ionicons
                  name="checkmark-circle-outline"
                  size={16}
                  color={Colors.neutral[500]}
                />
                <Text style={styles.actionBtnText}>Mark read</Text>
              </Pressable>
            )}
            {onArchive && (
              <Pressable
                style={[styles.actionBtn, archiveGated && styles.actionBtnDisabled]}
                onPress={archiveGated ? undefined : onArchive}
                accessibilityLabel={
                  archiveGated ? 'Cannot archive — response pending' : 'Archive notice'
                }
                disabled={archiveGated}
                hitSlop={8}
              >
                <Ionicons
                  name="archive-outline"
                  size={16}
                  color={archiveGated ? Colors.neutral[300] : Colors.neutral[500]}
                />
                <Text
                  style={[
                    styles.actionBtnText,
                    archiveGated && styles.actionBtnTextDisabled,
                  ]}
                >
                  Archive
                </Text>
              </Pressable>
            )}
            <View style={styles.spacer} />
            <Ionicons
              name="chevron-forward"
              size={16}
              color={Colors.neutral[400]}
            />
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 10,
    backgroundColor: Colors.surface.default,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  card: {
    flexDirection: 'row',
  },
  cardPressed: {
    opacity: 0.92,
  },
  statusStripe: {
    width: 4,
    alignSelf: 'stretch',
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
  },
  content: {
    flex: 1,
    padding: 14,
    gap: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  typeBadge: {
    backgroundColor: Colors.neutral[100],
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.neutral[600],
  },
  noticeNumber: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.neutral[800],
    flex: 1,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  description: {
    fontSize: 13,
    color: Colors.neutral[600],
    lineHeight: 18,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  issuedDate: {
    fontSize: 12,
    color: Colors.neutral[400],
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.neutral[100],
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 44,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  actionBtnDisabled: {
    opacity: 0.4,
  },
  actionBtnText: {
    fontSize: 12,
    color: Colors.neutral[500],
    fontWeight: '500',
  },
  actionBtnTextDisabled: {
    color: Colors.neutral[300],
  },
  spacer: {
    flex: 1,
  },
});
