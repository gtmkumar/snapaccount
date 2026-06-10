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
import { Colors } from '../../constants/colors';
import { getMyConsents, withdrawConsent, type UserConsent, type ConsentStatus } from '../../api/privacy';
import type { MoreStackParamList } from '../../navigation/MoreStack';

type NavProp = NativeStackNavigationProp<MoreStackParamList, 'MyConsents'>;
type FilterTab = 'active' | 'withdrawn' | 'all';

interface Props { navigation: NavProp }

const LOAN_LINKED_PURPOSES: string[] = ['CREDIT_BUREAU', 'DATA_SHARE_WITH_BANK', 'DISBURSEMENT_MANDATE'];

export function MyConsentsScreen({ navigation }: Props) {
  const { t } = useTranslation();
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
    onError: (_err, _purpose, ctx) => {
      // Rollback on error
      if (ctx?.previous) qc.setQueryData(['privacy-consents'], ctx.previous);
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
    withdrawMutation.mutate(confirmingPurpose.purposeCode);
    setConfirmingPurpose(null);
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={8} accessibilityLabel={t('mobile.common.back')}>
          <Ionicons name="arrow-back" size={22} color={Colors.neutral[800]} />
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
          <ActivityIndicator size="large" color={Colors.brand[600]} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={40} color={Colors.error[500]} />
          <Text style={styles.errorText}>{t('mobile.privacy.consents.error.load')}</Text>
          <Pressable style={styles.retryBtn} onPress={() => void refetch()}>
            <Text style={styles.retryBtnText}>{t('mobile.kfs.cta.retry')}</Text>
          </Pressable>
        </View>
      ) : filteredItems.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="checkmark-circle-outline" size={48} color={Colors.neutral[300]} />
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
  const isGranted = consent.status === 'GRANTED';

  return (
    <View style={styles.consentCard}>
      <View style={styles.consentHeaderRow}>
        <Text style={styles.consentPurpose}>{consent.purposeLabel}</Text>
        <View style={[styles.statusBadge, isGranted ? styles.statusBadgeGranted : styles.statusBadgeWithdrawn]}>
          {isWithdrawing ? (
            <ActivityIndicator size="small" color={Colors.neutral[500]} />
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.base },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: Colors.surface.default, borderBottomWidth: 1, borderBottomColor: Colors.neutral[100],
  },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.neutral[100], alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.neutral[900] },

  filterTabs: { flexDirection: 'row', backgroundColor: Colors.surface.default, borderBottomWidth: 1, borderBottomColor: Colors.neutral[100] },
  filterTab: { flex: 1, paddingVertical: 12, alignItems: 'center', minHeight: 44 },
  filterTabActive: { borderBottomWidth: 2, borderBottomColor: Colors.brand[600] },
  filterTabText: { fontSize: 14, fontWeight: '500', color: Colors.neutral[500] },
  filterTabTextActive: { fontWeight: '700', color: Colors.brand[600] },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  errorText: { fontSize: 14, color: Colors.error[600], textAlign: 'center' },
  emptyText: { fontSize: 14, color: Colors.neutral[500], textAlign: 'center' },
  retryBtn: { backgroundColor: Colors.brand[600], borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, minHeight: 44 },
  retryBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  list: { padding: 16, gap: 12 },

  consentCard: {
    backgroundColor: Colors.surface.default, borderRadius: 16, padding: 16, gap: 8,
    borderWidth: 1, borderColor: Colors.neutral[100],
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  consentHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  consentPurpose: { fontSize: 15, fontWeight: '700', color: Colors.neutral[900], flex: 1 },
  statusBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, minHeight: 28, alignItems: 'center', justifyContent: 'center' },
  statusBadgeGranted: { backgroundColor: Colors.success[50] },
  statusBadgeWithdrawn: { backgroundColor: Colors.neutral[100] },
  statusBadgeText: { fontSize: 12, fontWeight: '700' },
  statusBadgeTextGranted: { color: Colors.success[700] },
  statusBadgeTextWithdrawn: { color: Colors.neutral[500] },
  consentDescription: { fontSize: 13, color: Colors.neutral[600], lineHeight: 20 },
  consentMeta: { fontSize: 12, color: Colors.neutral[400] },
  consentFooter: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 },
  withdrawBtn: {
    borderRadius: 10, borderWidth: 1.5, borderColor: Colors.error[300],
    paddingHorizontal: 16, paddingVertical: 10, minHeight: 44,
    alignItems: 'center', justifyContent: 'center',
  },
  withdrawBtnText: { fontSize: 14, fontWeight: '600', color: Colors.error[600] },

  modalOverlay: { flex: 1, backgroundColor: Colors.surface.overlay, alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: Colors.surface.default, borderRadius: 20, padding: 24, width: '100%', gap: 12 },
  modalTitle: { fontSize: 17, fontWeight: '800', color: Colors.neutral[900] },
  modalBody: { fontSize: 14, color: Colors.neutral[700], lineHeight: 21 },
  modalNote: { fontSize: 12, color: Colors.neutral[500], lineHeight: 18 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  modalCancelBtn: {
    flex: 1, minHeight: 48, borderRadius: 12, borderWidth: 1.5, borderColor: Colors.neutral[200],
    alignItems: 'center', justifyContent: 'center',
  },
  modalCancelText: { fontSize: 14, fontWeight: '600', color: Colors.neutral[600] },
  modalWithdrawBtn: {
    flex: 1, minHeight: 48, borderRadius: 12, backgroundColor: Colors.error[600],
    alignItems: 'center', justifyContent: 'center',
  },
  modalWithdrawText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
