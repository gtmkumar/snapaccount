/**
 * MyCorrectionsScreen — DPDP correction request list
 * Phase 7 Wave 2 | M3b (GAP-020)
 */

import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors } from '../../constants/colors';
import { listMyDataCorrections, type DataCorrectionRequest, type CorrectionStatus } from '../../api/privacy';
import type { MoreStackParamList } from '../../navigation/MoreStack';

type NavProp = NativeStackNavigationProp<MoreStackParamList, 'MyCorrections'>;
interface Props { navigation: NavProp }

function statusColor(status: CorrectionStatus): { bg: string; text: string } {
  switch (status) {
    case 'SUBMITTED': return { bg: Colors.brand[50], text: Colors.brand[700] };
    case 'UNDER_REVIEW': return { bg: Colors.warning[50], text: Colors.warning[700] };
    case 'APPROVED': return { bg: Colors.success[50], text: Colors.success[700] };
    case 'REJECTED': return { bg: Colors.error[50], text: Colors.error[700] };
    default: return { bg: Colors.neutral[100], text: Colors.neutral[600] };
  }
}

export function MyCorrectionsScreen({ navigation }: Props) {
  const { t } = useTranslation();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['privacy-corrections'],
    queryFn: listMyDataCorrections,
    staleTime: 2 * 60 * 1000,
  });

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={8} accessibilityLabel={t('mobile.common.back')}>
          <Ionicons name="arrow-back" size={22} color={Colors.neutral[800]} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('mobile.privacy.correction.list.title')}</Text>
        <Pressable
          style={styles.newBtn}
          onPress={() => (navigation.navigate as (s: string) => void)('CorrectionRequest')}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.privacy.correction.list.newCta')}
        >
          <Ionicons name="add" size={20} color={Colors.brand[700]} />
          <Text style={styles.newBtnText}>{t('mobile.privacy.correction.list.newCta')}</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.brand[600]} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{t('mobile.privacy.correction.error.load')}</Text>
          <Pressable style={styles.retryBtn} onPress={() => void refetch()}>
            <Text style={styles.retryBtnText}>{t('mobile.kfs.cta.retry')}</Text>
          </Pressable>
        </View>
      ) : !data?.items.length ? (
        <View style={styles.center}>
          <Ionicons name="document-outline" size={48} color={Colors.neutral[300]} />
          <Text style={styles.emptyText}>{t('mobile.privacy.correction.empty')}</Text>
          <Pressable
            style={styles.retryBtn}
            onPress={() => (navigation.navigate as (s: string) => void)('CorrectionRequest')}
          >
            <Text style={styles.retryBtnText}>{t('mobile.privacy.correction.list.newCta')}</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {data.items.map((req) => (
            <CorrectionRow key={req.requestId} req={req} t={t} formatDate={formatDate} />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function CorrectionRow({
  req,
  t,
  formatDate,
}: {
  req: DataCorrectionRequest;
  t: (k: string, opts?: Record<string, unknown>) => string;
  formatDate: (iso: string) => string;
}) {
  const colors = statusColor(req.status);

  return (
    <View style={styles.row} accessibilityRole="text">
      <View style={styles.rowHeader}>
        <Text style={styles.rowCategory}>{req.dataCategory}</Text>
        <View style={[styles.statusBadge, { backgroundColor: colors.bg }]}>
          <Text style={[styles.statusBadgeText, { color: colors.text }]}>
            {t(`mobile.privacy.correction.status.${req.status.toLowerCase().replace('_', '')}`)}
          </Text>
        </View>
      </View>
      <Text style={styles.rowDescription} numberOfLines={3}>{req.description}</Text>
      <Text style={styles.rowMeta}>Submitted {formatDate(req.submittedAt)}</Text>
      {req.status === 'REJECTED' && req.rejectionReason && (
        <Text style={styles.rowRejectedReason}>
          {t('mobile.privacy.correction.rejectedReason', { reason: req.rejectionReason })}
        </Text>
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
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.neutral[900], flex: 1, textAlign: 'center' },
  newBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.brand[50], borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8, minHeight: 40,
  },
  newBtnText: { fontSize: 14, fontWeight: '600', color: Colors.brand[700] },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  errorText: { fontSize: 14, color: Colors.error[600], textAlign: 'center' },
  emptyText: { fontSize: 14, color: Colors.neutral[500], textAlign: 'center' },
  retryBtn: { backgroundColor: Colors.brand[600], borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, minHeight: 44 },
  retryBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  list: { padding: 16, gap: 12 },
  row: {
    backgroundColor: Colors.surface.default, borderRadius: 16, padding: 16, gap: 8,
    borderWidth: 1, borderColor: Colors.neutral[100],
  },
  rowHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  rowCategory: { fontSize: 15, fontWeight: '700', color: Colors.neutral[900], flex: 1 },
  statusBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, minHeight: 28, alignItems: 'center', justifyContent: 'center' },
  statusBadgeText: { fontSize: 12, fontWeight: '700' },
  rowDescription: { fontSize: 13, color: Colors.neutral[700], lineHeight: 20 },
  rowMeta: { fontSize: 12, color: Colors.neutral[400] },
  rowRejectedReason: { fontSize: 13, color: Colors.error[600], fontStyle: 'italic' },
});
