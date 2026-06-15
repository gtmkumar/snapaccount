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
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { listCallbacks, getCallbackKpi, type CallbackCategory } from '../../api/callbacks';

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

// ─────────────────────────────────────────────────────────────────────────────
// CallbackStatusChip — shown when user has active callback
// ─────────────────────────────────────────────────────────────────────────────

function CallbackStatusChip({
  scheduledAt,
  onPress,
}: {
  callbackId: string;
  scheduledAt?: string;
  onPress: () => void;
}) {
  const styles = useStyles();
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
  const { tokens } = useTheme();
  const styles = useStyles();
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
        <Ionicons name="headset-outline" size={20} color={tokens.brandCta} />
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
  const { tokens } = useTheme();
  const styles = useStyles();
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
              <Ionicons name="cloud-offline-outline" size={14} color={tokens.warningFg} />
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
              <Ionicons name="call-outline" size={18} color={tokens.textOnBrand} style={{ marginRight: 6 }} />
              <Text style={styles.sheetPrimaryBtnText}>
                {t('mobile.callback.cta.sheet.requestPrimary')}
              </Text>
            </Pressable>
          )}

          {onChat && (
            <Pressable style={styles.sheetSecondaryBtn} onPress={() => { onClose(); onChat(); }}>
              <Ionicons name="chatbubble-outline" size={18} color={tokens.brandCta} style={{ marginRight: 6 }} />
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
  onNavigateToModal,
  onNavigateToStatus,
  onNavigateToChat,
  testID = 'request-callback-cta',
  isOnline = true,
}: RequestCallbackCtaProps) {
  const { tokens } = useTheme();
  const styles = useStyles();
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
          <Ionicons name="headset-outline" size={22} color={tokens.textOnBrand} />
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

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
  // Card variant
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: tk.brandTint,
    borderRadius: 16, borderWidth: 1, borderColor: tk.brandTintBorder,
    padding: 16, marginHorizontal: 0,
    shadowColor: tk.brand500,
    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 1,
  },
  cardIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: tk.brandTintBorder,
    alignItems: 'center', justifyContent: 'center',
  },
  cardContent: { flex: 1, gap: 2 },
  cardTitle: { fontSize: 14, fontWeight: '600', color: tk.textPrimary },
  cardSub: { fontSize: 12, color: tk.textSecondary },
  cardBtn: {
    backgroundColor: tk.brand500, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 10,
    minHeight: 44, alignItems: 'center', justifyContent: 'center',
  },
  cardBtnDisabled: { backgroundColor: tk.border },
  cardBtnText: { fontSize: 13, fontWeight: '700', color: tk.textOnBrand },
  cardBtnTextDisabled: { color: tk.textTertiary },

  // Status chip
  statusChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: tk.warningTint,
    borderRadius: 12, borderWidth: 1, borderColor: tk.warningTintBorder,
    paddingHorizontal: 14, paddingVertical: 12, minHeight: 56,
  },
  statusChipDot: {
    width: 10, height: 10, borderRadius: 5, backgroundColor: tk.warningFg,
  },
  statusChipText: { flex: 1, fontSize: 13, fontWeight: '600', color: tk.warningFg },
  statusChipBtn: {
    backgroundColor: tk.warningTintBorder, borderRadius: 6,
    paddingHorizontal: 12, paddingVertical: 6, minHeight: 44, alignItems: 'center', justifyContent: 'center',
  },
  statusChipBtnText: { fontSize: 13, fontWeight: '700', color: tk.warningFg },

  // Bottom-sheet
  fabTrigger: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: tk.brand500,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: tk.brand500,
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8,
  },
  sheetBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: tk.raised,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 24, paddingBottom: 40, paddingTop: 12, gap: 12,
    minHeight: 320,
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: tk.border,
    alignSelf: 'center', marginBottom: 16,
  },
  sheetTitle: { fontSize: 20, fontWeight: '700', color: tk.textPrimary },
  sheetBody: { fontSize: 14, color: tk.textSecondary, lineHeight: 22 },
  sheetOfflineBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: tk.warningTint, borderRadius: 8,
    padding: 10, borderWidth: 1, borderColor: tk.warningTintBorder,
  },
  sheetOfflineText: { fontSize: 13, color: tk.warningFg, flex: 1 },
  sheetPrimaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: tk.brand500, borderRadius: 14,
    paddingVertical: 16, minHeight: 56,
  },
  sheetPrimaryBtnDisabled: { backgroundColor: tk.border },
  sheetPrimaryBtnText: { fontSize: 16, fontWeight: '700', color: tk.textOnBrand },
  sheetSecondaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: 14, paddingVertical: 14, minHeight: 52,
    borderWidth: 1, borderColor: tk.brandTintBorder,
  },
  sheetSecondaryBtnText: { fontSize: 15, fontWeight: '600', color: tk.brandCta },
  sheetCancelBtn: {
    alignItems: 'center', paddingVertical: 14, minHeight: 44,
  },
  sheetCancelBtnText: { fontSize: 15, color: tk.textSecondary },
  }),
);
