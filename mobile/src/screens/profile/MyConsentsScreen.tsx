/**
 * MyConsentsScreen — DPDP consent list + one-tap withdraw
 * Phase 7 Wave 2 | M3b (GAP-020)
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { useHaptics } from '../../hooks/useHaptics';
import { getMyConsents, withdrawConsent, type UserConsent, type ConsentStatus } from '../../api/privacy';
import type { MoreStackParamList } from '../../navigation/MoreStack';

type NavProp = NativeStackNavigationProp<MoreStackParamList, 'MyConsents'>;
type FilterTab = 'active' | 'withdrawn' | 'all';

interface Props { navigation: NavProp }

const LOAN_LINKED_PURPOSES: string[] = ['CREDIT_BUREAU', 'DATA_SHARE_WITH_BANK', 'DISBURSEMENT_MANDATE'];

export function MyConsentsScreen({ navigation }: Props) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const haptics = useHaptics();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<FilterTab>('active');
  const [confirmingPurpose, setConfirmingPurpose] = useState<UserConsent | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['privacy-consents'],
    queryFn: getMyConsents,
    staleTime: 2 * 60 * 1000,
  });

  const withdrawMutation = useMutation({
    mutationFn: (purpose: string) =>
      withdrawConsent(purpose, { noticeVersion: '1.0', locale: 'en' }),
    onMutate: async (purpose) => {
      // Optimistic update: flip to WITHDRAWN
      await qc.cancelQueries({ queryKey: ['privacy-consents'] });
      const previous = qc.getQueryData<{ items: UserConsent[] }>(['privacy-consents']);
      qc.setQueryData<{ items: UserConsent[] }>(['privacy-consents'], (old) => ({
        items: (old?.items ?? []).map((c) =>
          c.purposeCode === purpose
            ? { ...c, status: 'WITHDRAWN' as ConsentStatus, withdrawnAt: new Date().toISOString() }
            : c,
        ),
      }));
      return { previous };
    },
    onSuccess: () => {
      haptics.success(); // §3.3: consent withdrawal confirmed by server
    },
    onError: (_err, _purpose, ctx) => {
      // Rollback on error
      if (ctx?.previous) qc.setQueryData(['privacy-consents'], ctx.previous);
      haptics.error(); // §3.3: API error
      Alert.alert(t('mobile.common.error'), t('mobile.privacy.consents.error.withdraw'));
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['privacy-consents'] });
    },
  });

  const filteredItems = (data?.items ?? []).filter((c) => {
    if (filter === 'active') return c.status === 'GRANTED';
    if (filter === 'withdrawn') return c.status === 'WITHDRAWN';
    return true;
  });

  const handleWithdrawConfirm = () => {
    if (!confirmingPurpose) return;
    haptics.warning(); // §3.3: destructive confirm (withdraw consent)
    withdrawMutation.mutate(confirmingPurpose.purposeCode);
    setConfirmingPurpose(null);
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={8} accessibilityLabel={t('mobile.common.back')}>
          <Ionicons name="arrow-back" size={22} color={tokens.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('mobile.privacy.consents.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Filter tabs */}
      <View style={styles.filterTabs}>
        {(['active', 'withdrawn', 'all'] as FilterTab[]).map((tab) => (
          <Pressable
            key={tab}
            style={[styles.filterTab, filter === tab && styles.filterTabActive]}
            onPress={() => setFilter(tab)}
            accessibilityRole="tab"
            accessibilityState={{ selected: filter === tab }}
          >
            <Text style={[styles.filterTabText, filter === tab && styles.filterTabTextActive]}>
              {t(`mobile.privacy.consents.filter.${tab}`)}
            </Text>
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={tokens.brandCta} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={40} color={tokens.errorFg} />
          <Text style={styles.errorText}>{t('mobile.privacy.consents.error.load')}</Text>
          <Pressable style={styles.retryBtn} onPress={() => void refetch()}>
            <Text style={styles.retryBtnText}>{t('mobile.kfs.cta.retry')}</Text>
          </Pressable>
        </View>
      ) : filteredItems.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="checkmark-circle-outline" size={48} color={tokens.textTertiary} />
          <Text style={styles.emptyText}>{t('mobile.privacy.consents.empty')}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {filteredItems.map((consent) => (
            <ConsentCard
              key={consent.purposeCode}
              consent={consent}
              isWithdrawing={
                withdrawMutation.isPending &&
                withdrawMutation.variables === consent.purposeCode
              }
              onWithdraw={() => setConfirmingPurpose(consent)}
              t={t}
              formatDate={formatDate}
            />
          ))}
        </ScrollView>
      )}

      {/* Withdraw confirmation modal */}
      {confirmingPurpose && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setConfirmingPurpose(null)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>
                {t('mobile.privacy.consents.confirm.title', { purpose: confirmingPurpose.purposeLabel })}
              </Text>
              {LOAN_LINKED_PURPOSES.includes(confirmingPurpose.purposeCode) ? (
                <Text style={styles.modalBody}>{t('mobile.privacy.consents.confirm.loanLinkedNote')}</Text>
              ) : (
                <Text style={styles.modalBody}>
                  {confirmingPurpose.withdrawConsequence ?? t('mobile.privacy.consents.confirm.note')}
                </Text>
              )}
              <Text style={styles.modalNote}>{t('mobile.privacy.consents.confirm.note')}</Text>
              <View style={styles.modalActions}>
                <Pressable style={styles.modalCancelBtn} onPress={() => setConfirmingPurpose(null)} accessibilityRole="button">
                  <Text style={styles.modalCancelText}>{t('mobile.privacy.consents.confirm.cancel')}</Text>
                </Pressable>
                <Pressable style={styles.modalWithdrawBtn} onPress={handleWithdrawConfirm} accessibilityRole="button">
                  <Text style={styles.modalWithdrawText}>{t('mobile.privacy.consents.confirm.confirm')}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

function ConsentCard({
  consent,
  isWithdrawing,
  onWithdraw,
  t,
  formatDate,
}: {
  consent: UserConsent;
  isWithdrawing: boolean;
  onWithdraw: () => void;
  t: (k: string, opts?: Record<string, unknown>) => string;
  formatDate: (iso: string) => string;
}) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const isGranted = consent.status === 'GRANTED';

  return (
    <View style={styles.consentCard}>
      <View style={styles.consentHeaderRow}>
        <Text style={styles.consentPurpose}>{consent.purposeLabel}</Text>
        <View style={[styles.statusBadge, isGranted ? styles.statusBadgeGranted : styles.statusBadgeWithdrawn]}>
          {isWithdrawing ? (
            <ActivityIndicator size="small" color={tokens.textSecondary} />
          ) : (
            <Text style={[styles.statusBadgeText, isGranted ? styles.statusBadgeTextGranted : styles.statusBadgeTextWithdrawn]}>
              {isGranted ? t('mobile.privacy.consents.status.granted') : t('mobile.privacy.consents.status.withdrawn')}
            </Text>
          )}
        </View>
      </View>
      <Text style={styles.consentDescription}>{consent.description}</Text>
      <Text style={styles.consentMeta}>
        {isGranted
          ? t('mobile.privacy.consents.grantedOn', { date: formatDate(consent.grantedAt), version: consent.consentTextVersion })
          : consent.withdrawnAt
            ? t('mobile.privacy.consents.withdrawnOn', { date: formatDate(consent.withdrawnAt) })
            : ''}
      </Text>
      {isGranted && (
        <View style={styles.consentFooter}>
          <Pressable
            style={styles.withdrawBtn}
            onPress={onWithdraw}
            disabled={isWithdrawing}
            accessibilityRole="button"
            accessibilityLabel={`${t('mobile.privacy.consents.cta.withdraw')}, ${consent.purposeLabel}`}
          >
            <Text style={styles.withdrawBtnText}>{t('mobile.privacy.consents.cta.withdraw')}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: tk.canvas },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: tk.raised, borderBottomWidth: 1, borderBottomColor: tk.border,
  },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: tk.sunken, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: tk.textPrimary },

  filterTabs: { flexDirection: 'row', backgroundColor: tk.raised, borderBottomWidth: 1, borderBottomColor: tk.border },
  filterTab: { flex: 1, paddingVertical: 12, alignItems: 'center', minHeight: 44 },
  filterTabActive: { borderBottomWidth: 2, borderBottomColor: tk.brandCta },
  filterTabText: { fontSize: 14, fontWeight: '500', color: tk.textSecondary },
  filterTabTextActive: { fontWeight: '700', color: tk.brandCta },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  errorText: { fontSize: 14, color: tk.errorFg, textAlign: 'center' },
  emptyText: { fontSize: 14, color: tk.textSecondary, textAlign: 'center' },
  retryBtn: { backgroundColor: tk.brandCta, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, minHeight: 44 },
  retryBtnText: { fontSize: 15, fontWeight: '700', color: tk.textOnBrand },

  list: { padding: 16, gap: 12 },

  consentCard: {
    backgroundColor: tk.raised, borderRadius: 16, padding: 16, gap: 8,
    borderWidth: 1, borderColor: tk.border,
    shadowColor: tk.shadowColor, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  consentHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  consentPurpose: { fontSize: 15, fontWeight: '700', color: tk.textPrimary, flex: 1 },
  statusBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, minHeight: 28, alignItems: 'center', justifyContent: 'center' },
  statusBadgeGranted: { backgroundColor: tk.successTint },
  statusBadgeWithdrawn: { backgroundColor: tk.sunken },
  statusBadgeText: { fontSize: 12, fontWeight: '700' },
  statusBadgeTextGranted: { color: tk.successFg },
  statusBadgeTextWithdrawn: { color: tk.textSecondary },
  consentDescription: { fontSize: 13, color: tk.textSecondary, lineHeight: 20 },
  consentMeta: { fontSize: 12, color: tk.textTertiary },
  consentFooter: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 },
  withdrawBtn: {
    borderRadius: 10, borderWidth: 1.5, borderColor: tk.errorTintBorder,
    paddingHorizontal: 16, paddingVertical: 10, minHeight: 44,
    alignItems: 'center', justifyContent: 'center',
  },
  withdrawBtnText: { fontSize: 14, fontWeight: '600', color: tk.errorFg },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: tk.raised, borderRadius: 20, padding: 24, width: '100%', gap: 12 },
  modalTitle: { fontSize: 17, fontWeight: '800', color: tk.textPrimary },
  modalBody: { fontSize: 14, color: tk.textSecondary, lineHeight: 21 },
  modalNote: { fontSize: 12, color: tk.textSecondary, lineHeight: 18 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  modalCancelBtn: {
    flex: 1, minHeight: 48, borderRadius: 12, borderWidth: 1.5, borderColor: tk.border,
    alignItems: 'center', justifyContent: 'center',
  },
  modalCancelText: { fontSize: 14, fontWeight: '600', color: tk.textSecondary },
  modalWithdrawBtn: {
    flex: 1, minHeight: 48, borderRadius: 12, backgroundColor: tk.errorCta,
    alignItems: 'center', justifyContent: 'center',
  },
  modalWithdrawText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  }),
);
