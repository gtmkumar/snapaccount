/**
 * RequestCallbackCta — Reusable CTA component
 * Two variants: 'card' (inline) and 'bottomSheet' (modal trigger).
 * Auto-detects existing open callback and transforms to CallbackStatusChip.
 * Phase 6E — docs/design/mobile/callbacks/request-callback-cta.md
 */

import React, { useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Colors } from '../../constants/colors';
import { listCallbacks, getCallbackKpi, type CallbackCategory, type CallbackStatus } from '../../api/callbacks';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type CtaCategory = 'GST' | 'ITR' | 'LOAN' | 'DOC' | 'BILLING' | 'OTHER';

export interface LinkedEntity {
  type: string;
  id: string;
  label: string;
}

interface RequestCallbackCtaProps {
  variant?: 'card' | 'bottomSheet';
  category?: CtaCategory;
  linkedEntity?: LinkedEntity;
  prefillReason?: string;
  averageResponseMinutes?: number;
  onRequested?: (callbackId: string) => void;
  onNavigateToModal: (params: {
    category: CtaCategory;
    linkedEntity?: LinkedEntity;
    prefillReason?: string;
  }) => void;
  onNavigateToStatus: (callbackId: string) => void;
  onNavigateToChat?: () => void;
  testID?: string;
  isOnline?: boolean;
}

// Map CtaCategory to API CallbackCategory
const CATEGORY_MAP: Record<CtaCategory, CallbackCategory> = {
  GST: 'Gst',
  ITR: 'Itr',
  LOAN: 'Loan',
  DOC: 'Accounting',
  BILLING: 'Subscription',
  OTHER: 'General',
};

// Statuses that mean "open" callback
const OPEN_STATUSES: CallbackStatus[] = ['Pending', 'Assigned', 'Confirmed'];

// ─────────────────────────────────────────────────────────────────────────────
// CallbackStatusChip — shown when user has active callback
// ─────────────────────────────────────────────────────────────────────────────

function CallbackStatusChip({
  callbackId,
  scheduledAt,
  onPress,
}: {
  callbackId: string;
  scheduledAt?: string;
  onPress: () => void;
}) {
  const { t } = useTranslation();

  const timeLabel = scheduledAt
    ? new Date(scheduledAt).toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <Pressable
      style={styles.statusChip}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        timeLabel
          ? `Status: Scheduled, ${timeLabel}`
          : 'Callback pending — tap to view'
      }
    >
      <View style={styles.statusChipDot} />
      <Text style={styles.statusChipText}>
        {timeLabel
          ? t('mobile.callback.cta.pending.title', { time: timeLabel })
          : 'Callback pending'}
      </Text>
      <Pressable
        style={styles.statusChipBtn}
        onPress={onPress}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t('mobile.callback.cta.pending.viewButton')}
      >
        <Text style={styles.statusChipBtnText}>
          {t('mobile.callback.cta.pending.viewButton')}
        </Text>
      </Pressable>
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Card variant
// ─────────────────────────────────────────────────────────────────────────────

function CardVariant({
  category,
  linkedEntity,
  prefillReason,
  avgMinutes,
  hasExisting,
  existingCallbackId,
  existingScheduledAt,
  onRequest,
  onViewExisting,
  isOnline = true,
}: {
  category: CtaCategory;
  linkedEntity?: LinkedEntity;
  prefillReason?: string;
  avgMinutes?: number;
  hasExisting: boolean;
  existingCallbackId?: string;
  existingScheduledAt?: string;
  onRequest: () => void;
  onViewExisting: () => void;
  isOnline?: boolean;
}) {
  const { t } = useTranslation();

  if (hasExisting && existingCallbackId) {
    return (
      <CallbackStatusChip
        callbackId={existingCallbackId}
        scheduledAt={existingScheduledAt}
        onPress={onViewExisting}
      />
    );
  }

  const subtext = avgMinutes
    ? t('mobile.callback.cta.card.avgResponse', { minutes: avgMinutes })
    : t('mobile.callback.cta.card.avgResponseUnknown');

  return (
    <Pressable
      style={styles.card}
      onPress={isOnline ? onRequest : () => Alert.alert('Offline', t('mobile.callback.cta.offlineTooltip'))}
      accessibilityRole="button"
      accessibilityLabel={`Request a callback from SnapAccount expert${avgMinutes ? `, average response ${avgMinutes} minutes` : ''}`}
    >
      <View style={styles.cardIcon}>
        <Ionicons name="headset-outline" size={20} color={Colors.brand[600]} />
      </View>
      <View style={styles.cardContent}>
        <Text style={styles.cardTitle}>{t('mobile.callback.cta.card.title')}</Text>
        <Text style={styles.cardSub}>{subtext}</Text>
      </View>
      <Pressable
        style={[styles.cardBtn, !isOnline && styles.cardBtnDisabled]}
        onPress={isOnline ? onRequest : undefined}
        disabled={!isOnline}
        accessibilityRole="button"
        accessibilityLabel={t('mobile.callback.cta.card.requestButton')}
        hitSlop={8}
      >
        <Text style={[styles.cardBtnText, !isOnline && styles.cardBtnTextDisabled]}>
          {t('mobile.callback.cta.card.requestButton')}
        </Text>
      </Pressable>
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Bottom-sheet variant
// ─────────────────────────────────────────────────────────────────────────────

function BottomSheetVariant({
  visible,
  onClose,
  onRequest,
  onChat,
  hasExisting,
  existingCallbackId,
  onViewExisting,
  isOnline = true,
}: {
  visible: boolean;
  onClose: () => void;
  onRequest: () => void;
  onChat?: () => void;
  hasExisting: boolean;
  existingCallbackId?: string;
  onViewExisting: () => void;
  isOnline?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{t('mobile.callback.cta.sheet.title')}</Text>
          <Text style={styles.sheetBody}>{t('mobile.callback.cta.sheet.body')}</Text>

          {!isOnline && (
            <View style={styles.sheetOfflineBanner}>
              <Ionicons name="cloud-offline-outline" size={14} color={Colors.warning[700]} />
              <Text style={styles.sheetOfflineText}>{t('mobile.callback.cta.offlineTooltip')}</Text>
            </View>
          )}

          {hasExisting ? (
            <Pressable
              style={styles.sheetPrimaryBtn}
              onPress={() => { onClose(); onViewExisting(); }}
            >
              <Text style={styles.sheetPrimaryBtnText}>View your pending callback</Text>
            </Pressable>
          ) : (
            <Pressable
              style={[styles.sheetPrimaryBtn, !isOnline && styles.sheetPrimaryBtnDisabled]}
              onPress={isOnline ? () => { onClose(); onRequest(); } : undefined}
              disabled={!isOnline}
              accessibilityRole="button"
            >
              <Ionicons name="call-outline" size={18} color={Colors.neutral[0]} style={{ marginRight: 6 }} />
              <Text style={styles.sheetPrimaryBtnText}>
                {t('mobile.callback.cta.sheet.requestPrimary')}
              </Text>
            </Pressable>
          )}

          {onChat && (
            <Pressable style={styles.sheetSecondaryBtn} onPress={() => { onClose(); onChat(); }}>
              <Ionicons name="chatbubble-outline" size={18} color={Colors.brand[600]} style={{ marginRight: 6 }} />
              <Text style={styles.sheetSecondaryBtnText}>
                {t('mobile.callback.cta.sheet.chatSecondary')}
              </Text>
            </Pressable>
          )}

          <Pressable style={styles.sheetCancelBtn} onPress={onClose}>
            <Text style={styles.sheetCancelBtnText}>{t('mobile.callback.cta.sheet.cancel')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function RequestCallbackCta({
  variant = 'card',
  category = 'OTHER',
  linkedEntity,
  prefillReason,
  onRequested,
  onNavigateToModal,
  onNavigateToStatus,
  onNavigateToChat,
  testID = 'request-callback-cta',
  isOnline = true,
}: RequestCallbackCtaProps) {
  const [sheetVisible, setSheetVisible] = useState(false);

  const apiCategory = CATEGORY_MAP[category];

  // Check for existing open callback in this category (poll every 5 min)
  const { data: callbackList } = useQuery({
    queryKey: ['callbacks', 'open', apiCategory],
    queryFn: () => listCallbacks({ status: 'Pending', category: apiCategory, pageSize: 1 }),
    staleTime: 5 * 60 * 1000,
  });

  // Also check Assigned/Confirmed
  const { data: assignedList } = useQuery({
    queryKey: ['callbacks', 'assigned', apiCategory],
    queryFn: () => listCallbacks({ status: 'Assigned', category: apiCategory, pageSize: 1 }),
    staleTime: 5 * 60 * 1000,
  });

  const { data: kpi } = useQuery({
    queryKey: ['callback-kpi'],
    queryFn: getCallbackKpi,
    staleTime: 5 * 60 * 1000,
  });

  const allOpen = [
    ...(callbackList?.items ?? []),
    ...(assignedList?.items ?? []),
  ];
  const existingCallback = allOpen[0];
  const hasExisting = allOpen.length > 0;

  const handleRequest = () => {
    onNavigateToModal({ category, linkedEntity, prefillReason });
  };

  const handleViewExisting = () => {
    if (existingCallback) {
      onNavigateToStatus(existingCallback.id);
    }
  };

  if (variant === 'bottomSheet') {
    return (
      <View testID={testID}>
        <Pressable
          style={styles.fabTrigger}
          onPress={() => setSheetVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Need help? Request a callback"
        >
          <Ionicons name="headset-outline" size={22} color={Colors.neutral[0]} />
        </Pressable>
        <BottomSheetVariant
          visible={sheetVisible}
          onClose={() => setSheetVisible(false)}
          onRequest={handleRequest}
          onChat={onNavigateToChat}
          hasExisting={hasExisting}
          existingCallbackId={existingCallback?.id}
          onViewExisting={handleViewExisting}
          isOnline={isOnline}
        />
      </View>
    );
  }

  return (
    <View testID={testID}>
      <CardVariant
        category={category}
        linkedEntity={linkedEntity}
        prefillReason={prefillReason}
        avgMinutes={kpi?.averageResponseMinutes}
        hasExisting={hasExisting}
        existingCallbackId={existingCallback?.id}
        existingScheduledAt={existingCallback?.scheduledAt}
        onRequest={handleRequest}
        onViewExisting={handleViewExisting}
        isOnline={isOnline}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Card variant
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.brand[50],
    borderRadius: 16, borderWidth: 1, borderColor: Colors.brand[200],
    padding: 16, marginHorizontal: 0,
    shadowColor: Colors.brand[500],
    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 1,
  },
  cardIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.brand[100],
    alignItems: 'center', justifyContent: 'center',
  },
  cardContent: { flex: 1, gap: 2 },
  cardTitle: { fontSize: 14, fontWeight: '600', color: Colors.neutral[900] },
  cardSub: { fontSize: 12, color: Colors.neutral[600] },
  cardBtn: {
    backgroundColor: Colors.brand[500], borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 10,
    minHeight: 44, alignItems: 'center', justifyContent: 'center',
  },
  cardBtnDisabled: { backgroundColor: Colors.neutral[200] },
  cardBtnText: { fontSize: 13, fontWeight: '700', color: Colors.neutral[0] },
  cardBtnTextDisabled: { color: Colors.neutral[400] },

  // Status chip
  statusChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.warning[50],
    borderRadius: 12, borderWidth: 1, borderColor: Colors.warning[300],
    paddingHorizontal: 14, paddingVertical: 12, minHeight: 56,
  },
  statusChipDot: {
    width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.warning[500],
  },
  statusChipText: { flex: 1, fontSize: 13, fontWeight: '600', color: Colors.warning[800] },
  statusChipBtn: {
    backgroundColor: Colors.warning[100], borderRadius: 6,
    paddingHorizontal: 12, paddingVertical: 6, minHeight: 44, alignItems: 'center', justifyContent: 'center',
  },
  statusChipBtnText: { fontSize: 13, fontWeight: '700', color: Colors.warning[700] },

  // Bottom-sheet
  fabTrigger: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: Colors.brand[500],
    alignItems: 'center', justifyContent: 'center',
    shadowColor: Colors.brand[500],
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8,
  },
  sheetBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surface.default,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 24, paddingBottom: 40, paddingTop: 12, gap: 12,
    minHeight: 320,
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: Colors.neutral[300],
    alignSelf: 'center', marginBottom: 16,
  },
  sheetTitle: { fontSize: 20, fontWeight: '700', color: Colors.neutral[900] },
  sheetBody: { fontSize: 14, color: Colors.neutral[600], lineHeight: 22 },
  sheetOfflineBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.warning[50], borderRadius: 8,
    padding: 10, borderWidth: 1, borderColor: Colors.warning[200],
  },
  sheetOfflineText: { fontSize: 13, color: Colors.warning[700], flex: 1 },
  sheetPrimaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.brand[500], borderRadius: 14,
    paddingVertical: 16, minHeight: 56,
  },
  sheetPrimaryBtnDisabled: { backgroundColor: Colors.neutral[200] },
  sheetPrimaryBtnText: { fontSize: 16, fontWeight: '700', color: Colors.neutral[0] },
  sheetSecondaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 14, paddingVertical: 14, minHeight: 52,
    borderWidth: 1, borderColor: Colors.brand[200],
  },
  sheetSecondaryBtnText: { fontSize: 15, fontWeight: '600', color: Colors.brand[600] },
  sheetCancelBtn: {
    alignItems: 'center', paddingVertical: 14, minHeight: 44,
  },
  sheetCancelBtnText: { fontSize: 15, color: Colors.neutral[500] },
});
