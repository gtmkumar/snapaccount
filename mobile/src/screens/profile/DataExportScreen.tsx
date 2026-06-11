/**
 * DataExportScreen — DPDP Right to Access / Data Portability
 * Phase 7 Wave 2 | M3b (GAP-020)
 */

import React from 'react';
import {
  ActivityIndicator,
  Linking,
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
import { getDataExportStatus, requestDataExport, type DataExportJob } from '../../api/privacy';
import type { MoreStackParamList } from '../../navigation/MoreStack';

type NavProp = NativeStackNavigationProp<MoreStackParamList, 'DataExport'>;
interface Props { navigation: NavProp }

const POLL_INTERVAL_MS = 10_000;

export function DataExportScreen({ navigation }: Props) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const qc = useQueryClient();

  const { data: job, isLoading, error, refetch } = useQuery<DataExportJob | null>({
    queryKey: ['data-export-status'],
    queryFn: getDataExportStatus,
    staleTime: 30_000,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'REQUESTED' || status === 'PROCESSING' ? POLL_INTERVAL_MS : false;
    },
  });

  const requestMutation = useMutation({
    mutationFn: requestDataExport,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['data-export-status'] });
    },
  });

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={8} accessibilityLabel={t('mobile.common.back')}>
          <Ionicons name="arrow-back" size={22} color={tokens.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('mobile.privacy.export.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Explainer */}
        <View style={styles.explainer}>
          <Text style={styles.explainerTitle}>{t('mobile.privacy.export.explainer.title')}</Text>
          <Text style={styles.explainerBody}>{t('mobile.privacy.export.explainer.body')}</Text>
        </View>

        {/* Job status card */}
        {isLoading ? (
          <View style={styles.jobCard}>
            <ActivityIndicator size="large" color={tokens.brandCta} />
          </View>
        ) : error ? (
          <View style={styles.jobCard}>
            <Text style={styles.errorText}>{t('mobile.privacy.export.error.generic')}</Text>
            <Pressable style={styles.primaryBtn} onPress={() => void refetch()}>
              <Text style={styles.primaryBtnText}>{t('mobile.privacy.export.cta.retry')}</Text>
            </Pressable>
          </View>
        ) : !job ? (
          <View style={styles.jobCard}>
            <Ionicons name="cloud-download-outline" size={40} color={tokens.brand400} />
            <Text style={styles.jobMessage}>
              {t('mobile.privacy.export.explainer.title')}
            </Text>
            <Pressable
              style={styles.primaryBtn}
              onPress={() => requestMutation.mutate()}
              disabled={requestMutation.isPending}
              accessibilityRole="button"
              accessibilityLabel={t('mobile.privacy.export.cta.request')}
            >
              {requestMutation.isPending ? (
                <ActivityIndicator size="small" color={tokens.textOnBrand} />
              ) : (
                <Text style={styles.primaryBtnText}>{t('mobile.privacy.export.cta.request')}</Text>
              )}
            </Pressable>
          </View>
        ) : job.status === 'REQUESTED' || job.status === 'PROCESSING' ? (
          <View style={styles.jobCard}>
            <ActivityIndicator size="large" color={tokens.brandCta} />
            <Text style={styles.jobMessage} accessibilityLiveRegion="polite">
              {t('mobile.privacy.export.status.processing')}
            </Text>
          </View>
        ) : job.status === 'READY' ? (
          <View style={[styles.jobCard, styles.jobCardReady]}>
            <Ionicons name="checkmark-circle" size={40} color={tokens.successFg} />
            <Text style={styles.jobMessageReady} accessibilityLiveRegion="polite">
              {t('mobile.privacy.export.status.ready')}
            </Text>
            {job.expiresAt && (
              <Text style={styles.expiryText}>
                {t('mobile.privacy.export.availableUntil', { date: formatDate(job.expiresAt) })}
              </Text>
            )}
            {job.downloadUrl && (
              <Pressable
                style={styles.primaryBtn}
                onPress={() => { if (job.downloadUrl) void Linking.openURL(job.downloadUrl); }}
                accessibilityRole="button"
                accessibilityLabel={t('mobile.privacy.export.cta.download')}
              >
                <Ionicons name="download-outline" size={16} color={tokens.textOnBrand} />
                <Text style={styles.primaryBtnText}>{t('mobile.privacy.export.cta.download')}</Text>
              </Pressable>
            )}
          </View>
        ) : job.status === 'EXPIRED' ? (
          <View style={styles.jobCard}>
            <Ionicons name="time-outline" size={40} color={tokens.textTertiary} />
            <Text style={styles.jobMessage}>{t('mobile.privacy.export.status.expired')}</Text>
            <Pressable
              style={styles.primaryBtn}
              onPress={() => requestMutation.mutate()}
              disabled={requestMutation.isPending}
              accessibilityRole="button"
            >
              <Text style={styles.primaryBtnText}>{t('mobile.privacy.export.cta.requestAgain')}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={[styles.jobCard, styles.jobCardError]}>
            <Ionicons name="alert-circle-outline" size={40} color={tokens.errorFg} />
            <Text style={[styles.jobMessage, { color: tokens.errorFg }]}>
              {t('mobile.privacy.export.status.failed')}
            </Text>
            <Pressable
              style={styles.primaryBtn}
              onPress={() => requestMutation.mutate()}
              disabled={requestMutation.isPending}
              accessibilityRole="button"
            >
              <Text style={styles.primaryBtnText}>{t('mobile.privacy.export.cta.retry')}</Text>
            </Pressable>
          </View>
        )}

        <Text style={styles.transparencyNote}>
          This is a copy for your records. It does not change or delete anything.
        </Text>
      </ScrollView>
    </SafeAreaView>
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

  scrollContent: { padding: 16, gap: 16, paddingBottom: 32 },

  explainer: {
    backgroundColor: tk.brandTint, borderRadius: 16, padding: 16, gap: 8,
    borderWidth: 1, borderColor: tk.brandTintBorder,
  },
  explainerTitle: { fontSize: 15, fontWeight: '700', color: tk.brandFg },
  explainerBody: { fontSize: 13, color: tk.brandFg, lineHeight: 20 },

  jobCard: {
    backgroundColor: tk.raised, borderRadius: 16, padding: 24,
    alignItems: 'center', gap: 14, minHeight: 160, justifyContent: 'center',
    borderWidth: 1, borderColor: tk.border,
  },
  jobCardReady: { borderColor: tk.successTintBorder },
  jobCardError: { borderColor: tk.errorTintBorder },
  jobMessage: { fontSize: 15, color: tk.textSecondary, textAlign: 'center', lineHeight: 22 },
  jobMessageReady: { fontSize: 15, fontWeight: '700', color: tk.successFg, textAlign: 'center' },
  expiryText: { fontSize: 13, color: tk.textSecondary },
  errorText: { fontSize: 14, color: tk.errorFg, textAlign: 'center' },

  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: tk.brandCta, borderRadius: 12,
    paddingHorizontal: 24, paddingVertical: 13, minHeight: 48, minWidth: 180,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: tk.textOnBrand },

  transparencyNote: { fontSize: 12, color: tk.textTertiary, textAlign: 'center', lineHeight: 18 },
  }),
);
