/**
 * QueueDetailSheet — bottom-sheet listing the document upload queue with bulk
 * actions, opened from the header QueueChip.
 * DG-MOBUX-09 · docs/design/mobile/ux/offline-first-photo-capture.md §6.2 / §16.
 *
 * Shows each in-flight / failed queue item with its status, plus:
 *   - "Retry all" — re-queues every retryable FAILED item.
 *   - "Delete all failed" — removes every FAILED item (confirmed).
 *
 * Implemented with a plain RN Modal + slide animation (mirrors NetworkSheet) so
 * it works under Expo Go and in jest without a native sheet dependency.
 */

import React, { useEffect, useState } from 'react';
import {
  Alert,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import type { QueueItem } from '../../hooks/useDocumentQueue';

interface Props {
  visible: boolean;
  onClose: () => void;
  items: QueueItem[];
  onRetryAll: () => void;
  onDeleteAllFailed: () => void;
  testID?: string;
}

const STATUS_ICON: Record<QueueItem['status'], React.ComponentProps<typeof Ionicons>['name']> = {
  QUEUED: 'time-outline',
  UPLOADING: 'arrow-up-circle-outline',
  PROCESSING: 'sparkles-outline',
  READY: 'checkmark-circle-outline',
  FAILED: 'alert-circle-outline',
};

export function QueueDetailSheet({
  visible,
  onClose,
  items,
  onRetryAll,
  onDeleteAllFailed,
  testID,
}: Props) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const [slide] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(slide, {
      toValue: visible ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [visible, slide]);

  const failedCount = items.filter((i) => i.status === 'FAILED').length;
  const retryableCount = items.filter(
    (i) => i.status === 'FAILED' && i.failReason !== 'UPLOAD_REJECTED',
  ).length;

  const statusLabel = (item: QueueItem): string => {
    switch (item.status) {
      case 'QUEUED':
        return t('mobile.docs.status.queued');
      case 'UPLOADING':
        return t('mobile.docs.status.uploading', { percent: item.uploadProgress });
      case 'PROCESSING':
        return t('mobile.docs.status.processing');
      case 'READY':
        return t('mobile.docs.status.ready');
      case 'FAILED':
      default:
        return t('mobile.docs.status.failed');
    }
  };

  const statusColor = (status: QueueItem['status']): string => {
    if (status === 'FAILED') return tokens.errorFg;
    if (status === 'READY') return tokens.successFg;
    if (status === 'UPLOADING' || status === 'PROCESSING') return tokens.infoFg;
    return tokens.textSecondary;
  };

  const confirmDeleteAll = () => {
    Alert.alert(
      t('mobile.queue.sheet.deleteAllConfirmTitle'),
      t('mobile.queue.sheet.deleteAllConfirmBody'),
      [
        { text: t('mobile.common.cancel'), style: 'cancel' },
        {
          text: t('mobile.queue.sheet.deleteAllFailed'),
          style: 'destructive',
          onPress: onDeleteAllFailed,
        },
      ],
    );
  };

  const translateY = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [360, 0],
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      testID={testID ?? 'queue-detail-sheet'}
    >
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityLabel={t('mobile.common.close')}
      />
      <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
        <View style={styles.grabber} />
        <View style={styles.headerRow}>
          <Text style={styles.title}>{t('mobile.queue.sheet.title')}</Text>
          <Pressable
            onPress={onClose}
            style={styles.closeBtn}
            accessibilityRole="button"
            accessibilityLabel={t('mobile.common.close')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={20} color={tokens.textSecondary} />
          </Pressable>
        </View>

        {items.length === 0 ? (
          <View style={styles.emptyRow}>
            <Ionicons name="checkmark-done-outline" size={20} color={tokens.successFg} />
            <Text style={styles.emptyText}>{t('mobile.queue.sheet.empty')}</Text>
          </View>
        ) : (
          <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
            {items.map((item) => (
              <View key={item.localId} style={styles.itemRow}>
                <Ionicons
                  name={STATUS_ICON[item.status]}
                  size={18}
                  color={statusColor(item.status)}
                />
                <Text style={styles.itemName} numberOfLines={1}>
                  {item.filename}
                </Text>
                <Text style={[styles.itemStatus, { color: statusColor(item.status) }]}>
                  {statusLabel(item)}
                </Text>
              </View>
            ))}
          </ScrollView>
        )}

        {/* Bulk actions — only meaningful when there are failed items */}
        {failedCount > 0 && (
          <View style={styles.actionsRow}>
            {retryableCount > 0 && (
              <Pressable
                style={styles.retryAllBtn}
                onPress={onRetryAll}
                accessibilityRole="button"
                accessibilityLabel={t('mobile.queue.sheet.retryAll')}
                testID="queue-sheet-retry-all"
              >
                <Ionicons name="refresh-outline" size={16} color={tokens.textOnBrand} />
                <Text style={styles.retryAllText}>{t('mobile.queue.sheet.retryAll')}</Text>
              </Pressable>
            )}
            <Pressable
              style={[styles.deleteAllBtn, retryableCount === 0 && { flex: 1 }]}
              onPress={confirmDeleteAll}
              accessibilityRole="button"
              accessibilityLabel={t('mobile.queue.sheet.deleteAllFailed')}
              testID="queue-sheet-delete-all"
            >
              <Ionicons name="trash-outline" size={16} color={tokens.errorFg} />
              <Text style={styles.deleteAllText}>
                {t('mobile.queue.sheet.deleteAllFailed')}
              </Text>
            </Pressable>
          </View>
        )}
      </Animated.View>
    </Modal>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
    backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(15,23,42,0.45)' },
    sheet: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: tk.raised,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 20,
      paddingTop: 10,
      paddingBottom: 32,
      gap: 14,
      maxHeight: '70%',
    },
    grabber: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: tk.border,
      marginBottom: 4,
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    title: { fontSize: 18, fontWeight: '800', color: tk.textPrimary, letterSpacing: -0.3 },
    closeBtn: {
      width: 32,
      height: 32,
      borderRadius: 10,
      backgroundColor: tk.sunken,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
    emptyText: { fontSize: 15, color: tk.textSecondary },
    list: { maxHeight: 320 },
    listContent: { gap: 8 },
    itemRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: tk.sunken,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      minHeight: 44,
    },
    itemName: { flex: 1, fontSize: 14, fontWeight: '600', color: tk.textPrimary },
    itemStatus: { fontSize: 12, fontWeight: '600' },
    actionsRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
    retryAllBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: tk.brand500,
      borderRadius: 12,
      minHeight: 48,
    },
    retryAllText: { fontSize: 14, fontWeight: '700', color: tk.textOnBrand },
    deleteAllBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      borderRadius: 12,
      minHeight: 48,
      borderWidth: 1,
      borderColor: tk.errorTintBorder,
    },
    deleteAllText: { fontSize: 14, fontWeight: '600', color: tk.errorFg },
  }),
);
