/**
 * NoticeRowMobile — Swipeable notice card with archive + mark-read actions.
 * Used by GstNoticeInboxScreen and ItrNoticeInboxScreen.
 * Accessibility: full accessibilityActions for swipe gestures.
 */

import React, { useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  AccessibilityActionEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { isNoticeOverdue, isNoticeSettled } from '../../lib/noticeStatus';
import { DueDateChip } from './DueDateChip';
// Wave 7B (GAP-108): statutory taxonomy + GSTAT appeal stage
import { NoticeFormTypeBadge } from '../gst/NoticeFormTypeBadge';
import { GstatStageChip } from '../gst/GstatStageChip';
import type { GstNoticeFormType, GstatStage } from '../../api/gst';

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
  /** Wave 7B (GAP-108): statutory form-type badge (ASMT-10 / DRC-01…). */
  formType?: GstNoticeFormType;
  /** Wave 7B (GAP-108): statutory response deadline (preferred over dueDate). */
  statutoryDeadline?: string;
  /** Wave 7B (GAP-108): GSTAT appeal stage when escalated. */
  gstatStage?: GstatStage;
  testID?: string;
}

/** Localized labels for the canonical status pill (raw value = fallback). */
const STATUS_LABEL_KEYS: Record<string, string> = {
  RECEIVED: 'mobile.gst.notices.filter.received',
  UNDER_REVIEW: 'mobile.gst.notices.filter.underReview',
  RESPONDED: 'mobile.gst.notices.filter.responded',
  CLOSED: 'mobile.gst.notices.filter.closed',
};

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
  formType,
  statutoryDeadline,
  gstatStage,
  testID,
}: NoticeRowMobileProps) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const [slideAnim] = useState(() => new Animated.Value(0));

  // Canonical server statuses (RECEIVED/UNDER_REVIEW/RESPONDED/CLOSED);
  // "overdue" is derived from the deadline (never a server status).
  const isOpen = !isNoticeSettled(status);
  const isOverdue = isNoticeOverdue(status, statutoryDeadline ?? dueDate);

  const statusColor = isOverdue
    ? tokens.errorFg
    : isOpen
    ? tokens.warningFg
    : tokens.successFg;

  const statusLabelKey = STATUS_LABEL_KEYS[status];
  const statusLabel = statusLabelKey ? t(statusLabelKey) : status;

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
        accessibilityLabel={`Notice ${noticeNumber}, type ${noticeType}, status ${statusLabel}`}
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
              {/* GAP-108: statutory form-type badge takes precedence; the
                  legacy free-text type chip remains the fallback (incl. the
                  server's OTHER default, which has no statutory badge). */}
              {formType && formType !== 'OTHER' ? (
                <NoticeFormTypeBadge formType={formType} />
              ) : (
                <View style={styles.typeBadge}>
                  <Text style={styles.typeBadgeText}>{noticeType}</Text>
                </View>
              )}
              <Text style={styles.noticeNumber} numberOfLines={1}>
                {noticeNumber}
              </Text>
            </View>
            <View
              style={[styles.statusPill, { backgroundColor: statusColor + '18' }]}
            >
              <Text style={[styles.statusText, { color: statusColor }]}>
                {statusLabel}
              </Text>
            </View>
          </View>

          {/* Description */}
          {description ? (
            <Text style={styles.description} numberOfLines={2}>
              {description}
            </Text>
          ) : null}

          {/* Footer row — GAP-108: statutory deadline preferred over dueDate */}
          <View style={styles.footerRow}>
            <Text style={styles.issuedDate}>Issued {issuedDate}</Text>
            {statutoryDeadline || dueDate ? (
              <DueDateChip dueDate={(statutoryDeadline ?? dueDate) as string} />
            ) : null}
          </View>

          {/* GAP-108: GSTAT appeal-stage chip (only when escalated; NONE hides) */}
          {gstatStage && gstatStage !== 'NONE' ? (
            <GstatStageChip stage={gstatStage} testID={`gstat-chip-${noticeNumber}`} />
          ) : null}

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
                  color={tokens.textSecondary}
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
                  color={archiveGated ? tokens.textTertiary : tokens.textSecondary}
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
              color={tokens.textTertiary}
            />
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
  wrapper: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 10,
    backgroundColor: tk.raised,
    shadowColor: tk.shadowColor,
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
    backgroundColor: tk.sunken,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: tk.textSecondary,
  },
  noticeNumber: {
    fontSize: 13,
    fontWeight: '600',
    color: tk.textPrimary,
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
    color: tk.textSecondary,
    lineHeight: 18,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  issuedDate: {
    fontSize: 12,
    color: tk.textTertiary,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: tk.border,
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
    color: tk.textSecondary,
    fontWeight: '500',
  },
  actionBtnTextDisabled: {
    color: tk.textTertiary,
  },
  spacer: {
    flex: 1,
  },
  }),
);
