/**
 * ComparativeReportScreen — YoY / MoM revenue · expenses · profit charts.
 * Wave 7 / GAP-044. Chart-friendly DTO from AccountingService
 * (GET /accounting/reports/comparative — CONTRACT_PENDING, see api/accounting.ts).
 * Pure-RN grouped bars (ComparativeBarChart) — house pattern (RegimeBarChart),
 * no chart-library dependency added.
 */

import React, { useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { ListSkeleton, EmptyState, ErrorState } from '../../components/shared/ListStates';
import { ComparativeBarChart } from '../../components/shared/ComparativeBarChart';
import { useHaptics } from '../../hooks/useHaptics';
import { useSensitiveScreen } from '../../hooks/usePreventScreenCapture';
import { useAuthStore } from '../../store/authStore';
import { getCurrentFinancialYear, formatINR } from '../../lib/utils';
import {
  getComparativeReport,
  type ComparativeGranularity,
} from '../../api/accounting';
import type { HomeStackParamList } from '../../navigation/HomeStack';

type NavProp = NativeStackNavigationProp<HomeStackParamList, 'ComparativeReport'>;
interface Props { navigation: NavProp }

export function ComparativeReportScreen({ navigation }: Props) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const haptics = useHaptics();
  // SEC-015: financial figures — prevent screenshots like other report screens.
  useSensitiveScreen();

  const [granularity, setGranularity] = useState<ComparativeGranularity>('month');
  const { user } = useAuthStore();
  const organizationId =
    (user as { organizationId?: string } | null)?.organizationId ?? 'default';
  const fy = getCurrentFinancialYear();

  const { data, isLoading, isRefetching, error, refetch } = useQuery({
    queryKey: ['report', 'comparative', organizationId, granularity, fy.label],
    queryFn: () =>
      getComparativeReport({
        organizationId,
        granularity,
        fiscalYear: String(fy.startYear),
      }),
    staleTime: 5 * 60 * 1000,
  });

  const periods = data?.periods ?? [];
  const latest = periods.length > 0 ? periods[periods.length - 1] : null;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.common.back')}
          hitSlop={8}
        >
          <Ionicons name="arrow-back" size={22} color={tokens.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('mobile.reports.comparative.title')}</Text>
        <View style={{ width: 44 }} />
      </View>

      {/* MoM / YoY toggle */}
      <View style={styles.segmentRow}>
        {(
          [
            { key: 'month' as ComparativeGranularity, labelKey: 'mobile.reports.comparative.mom' },
            { key: 'year' as ComparativeGranularity, labelKey: 'mobile.reports.comparative.yoy' },
          ]
        ).map((seg) => {
          const active = granularity === seg.key;
          return (
            <Pressable
              key={seg.key}
              style={[styles.segment, active && styles.segmentActive]}
              onPress={() => {
                haptics.lightTap();
                setGranularity(seg.key);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              testID={`comparative-tab-${seg.key}`}
            >
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                {t(seg.labelKey)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {isLoading ? (
        <View style={styles.body}>
          <ListSkeleton variant="card" count={2} cardHeight={180} testID="comparative-skeleton" />
        </View>
      ) : error ? (
        <ErrorState
          message={t('mobile.reports.comparative.error')}
          retryLabel={t('mobile.common.retry')}
          onRetry={() => void refetch()}
          secondaryLabel={t('mobile.common.goBack')}
          onSecondaryPress={() => navigation.goBack()}
          testID="comparative-error"
        />
      ) : periods.length === 0 ? (
        <EmptyState
          icon="bar-chart-outline"
          title={t('mobile.reports.comparative.emptyTitle')}
          body={t('mobile.reports.comparative.emptyBody')}
          testID="comparative-empty"
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.body}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => {
                haptics.lightTap();
                void refetch();
              }}
              tintColor={tokens.brand500}
              colors={[tokens.brand500]}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          <ComparativeBarChart periods={periods} testID="comparative-chart" />

          {/* Latest-period summary (amounts: Western numerals, Indian grouping) */}
          {latest ? (
            <View style={styles.summaryCard} testID="comparative-summary">
              <Text style={styles.summaryTitle}>{latest.label}</Text>
              {[
                { label: t('mobile.reports.comparative.revenue'), value: latest.revenue, color: tokens.brand500 },
                { label: t('mobile.reports.comparative.expenses'), value: latest.expenses, color: tokens.loanAccent },
                {
                  label: t('mobile.reports.comparative.profit'),
                  value: latest.netProfit,
                  color: latest.netProfit >= 0 ? tokens.successFg : tokens.errorFg,
                },
              ].map((row) => (
                <View key={row.label} style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>{row.label}</Text>
                  <Text style={[styles.summaryValue, { color: row.color }]}>
                    {formatINR(row.value)}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: tk.canvas },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: tk.raised,
      borderBottomWidth: 1,
      borderBottomColor: tk.border,
    },
    backBtn: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: tk.sunken,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: { fontSize: 18, fontWeight: '700', color: tk.textPrimary },
    segmentRow: { flexDirection: 'row', gap: 8, padding: 16, paddingBottom: 8 },
    segment: {
      flex: 1,
      minHeight: 44,
      borderRadius: 12,
      backgroundColor: tk.sunken,
      borderWidth: 1,
      borderColor: tk.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    segmentActive: { backgroundColor: tk.brandCta, borderColor: tk.brandCta },
    segmentText: { fontSize: 14, fontWeight: '600', color: tk.textSecondary },
    segmentTextActive: { color: tk.textOnBrand },
    body: { padding: 16, paddingTop: 8, gap: 14 },
    summaryCard: {
      backgroundColor: tk.raised,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: tk.border,
      padding: 16,
      gap: 10,
    },
    summaryTitle: { fontSize: 15, fontWeight: '700', color: tk.textPrimary },
    summaryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    summaryLabel: { fontSize: 13, color: tk.textSecondary },
    summaryValue: { fontSize: 14, fontWeight: '800', letterSpacing: -0.3 },
  }),
);
