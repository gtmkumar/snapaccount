/**
 * Financial Reports List Screen — Phase 6A
 * Wired to GET /accounting/reports/{type} for the 6 accounting reports.
 * Loading / empty / error states. FY selector drives API params.
 * Matches docs/design/screens/mobile/dashboard-reports.md §Screen 9
 */

import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { ListSkeleton } from '../../components/shared/ListStates';
import { useHaptics } from '../../hooks/useHaptics';
import { getFinancialYears } from '../../lib/utils';
import type { HomeStackParamList } from '../../navigation/HomeStack';
import { getFinancialReport } from '../../api/accounting';
import { useAuthStore } from '../../store/authStore';

type NavProp = NativeStackNavigationProp<HomeStackParamList, 'FinancialReportsList'>;
interface Props { navigation: NavProp }

// Only the 6 report types backed by GET /accounting/reports/{type}
type ApiReportId = 'profit-and-loss' | 'balance-sheet' | 'trial-balance';

type ReportCard = {
  id: string;
  apiId?: ApiReportId;
  labelKey: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  badgeKey?: string;
};

const buildReportTypes = (tk: ThemeTokens): ReportCard[] => [
  { id: 'trial-balance', apiId: 'trial-balance', labelKey: 'mobile.reports.types.trialBalance', icon: 'scale-outline', color: tk.brand500 },
  { id: 'pnl', apiId: 'profit-and-loss', labelKey: 'mobile.reports.types.pnl', icon: 'trending-up-outline', color: tk.successFg },
  { id: 'balance-sheet', apiId: 'balance-sheet', labelKey: 'mobile.reports.types.balanceSheet', icon: 'business-outline', color: tk.brandCta },
  { id: 'cash-flow', labelKey: 'mobile.reports.types.cashFlow', icon: 'swap-horizontal-outline', color: tk.infoFg },
  { id: 'tax-liability', labelKey: 'mobile.reports.types.taxLiability', icon: 'calculator-outline', color: tk.gstAccent },
  { id: 'ledger', labelKey: 'mobile.reports.types.ledger', icon: 'book-outline', color: tk.textSecondary },
  { id: 'comparative', labelKey: 'mobile.reports.types.comparative', icon: 'bar-chart-outline', color: tk.loanAccent, badgeKey: 'mobile.reports.badge.new' },
  { id: 'forecast', labelKey: 'mobile.reports.types.forecast', icon: 'analytics-outline', color: tk.itrAccent, badgeKey: 'mobile.reports.badge.ai' },
];

const FY_LIST = getFinancialYears(4);

// Parse "FY 2025-26" → { fiscalYear: "2025", periodMonth: undefined }
function parseFy(fy: string): { fiscalYear: string } {
  const match = fy.match(/(\d{4})/);
  return { fiscalYear: match ? match[1] : '2025' };
}

export function FinancialReportsListScreen({ navigation }: Props) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const reportTypes = useMemo(() => buildReportTypes(tokens), [tokens]);
  const { t } = useTranslation();
  const [selectedFY, setSelectedFY] = useState(FY_LIST[0]);
  const { user } = useAuthStore();
  const organizationId = (user as { organizationId?: string } | null)?.organizationId ?? 'default';
  const { fiscalYear } = parseFy(selectedFY);

  // Pre-fetch P&L as the primary report for the selected FY
  // Individual report detail fetches happen in ReportDetailScreen
  const haptics = useHaptics();
  const { data: plReport, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['report', 'profit-and-loss', organizationId, fiscalYear],
    queryFn: () => getFinancialReport('profit-and-loss', { organizationId, fiscalYear }),
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });

  const netProfit = plReport?.netProfit;
  const lastUpdated = plReport?.generatedAt
    ? new Date(plReport.generatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.common.back')}
        >
          <Ionicons name="arrow-back" size={22} color={tokens.brand500} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('mobile.reports.title')}</Text>
        <Pressable
          onPress={() => refetch()}
          style={styles.headerBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.common.retry')}
        >
          <Ionicons name="refresh-outline" size={20} color={tokens.textSecondary} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => {
              // §3.3 haptics map: pull-to-refresh release → light impact.
              haptics.lightTap();
              void refetch();
            }}
            tintColor={tokens.brand500}
            colors={[tokens.brand500]}
          />
        }
      >
        {/* FY Selector */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.fyScrollContent}
          style={styles.fyScroll}
        >
          {FY_LIST.map((fy) => (
            <Pressable
              key={fy}
              style={[styles.fyChip, selectedFY === fy && styles.fyChipActive]}
              onPress={() => setSelectedFY(fy)}
              accessibilityRole="radio"
              accessibilityState={{ selected: selectedFY === fy }}
            >
              <Text style={[styles.fyChipText, selectedFY === fy && styles.fyChipTextActive]}>
                {fy}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* P&L summary card */}
        {isLoading ? (
          // §3.1: shaped skeleton matching the summary card silhouette
          <ListSkeleton variant="card" count={1} cardHeight={72} testID="reports-skeleton" />
        ) : isError ? (
          <View accessibilityLiveRegion="assertive" accessibilityRole="alert">
            <Card style={styles.errorCard}>
              <Text style={styles.errorText}>{t('mobile.reports.error')}</Text>
              <Button label={t('mobile.reports.retry')} size="sm" onPress={() => refetch()} />
            </Card>
          </View>
        ) : plReport ? (
          <Card shadow="md" padding="md" style={styles.summaryCard}>
            <View style={styles.summaryCardRow}>
              <View>
                <Text style={styles.summaryLabel}>{t('mobile.reports.netProfitLoss')}</Text>
                <Text
                  style={[
                    styles.summaryAmount,
                    { color: (netProfit ?? 0) >= 0 ? tokens.successFg: tokens.errorFg },
                  ]}
                >
                  {netProfit !== undefined
                    ? `₹ ${Math.abs(netProfit).toLocaleString('en-IN')}`
                    : '—'}
                </Text>
              </View>
              {lastUpdated && (
                <Text style={styles.summaryUpdated}>
                  {t('mobile.reports.updatedAt', { time: lastUpdated })}
                </Text>
              )}
            </View>
          </Card>
        ) : null}

        {/* Reports grid */}
        <FlatList
          data={reportTypes}
          numColumns={2}
          scrollEnabled={false}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable
              style={styles.reportCard}
              onPress={() =>
                navigation.navigate('ReportDetail', {
                  reportType: item.apiId ?? item.id,
                })
              }
              accessibilityRole="button"
              accessibilityLabel={t('mobile.reports.viewA11y', { report: t(item.labelKey) })}
            >
              <View style={[styles.reportIconBg, { backgroundColor: item.color + '20' }]}>
                <Ionicons name={item.icon} size={22} color={item.color} />
              </View>
              <View style={styles.reportCardContent}>
                <Text style={styles.reportLabel}>{t(item.labelKey)}</Text>
                {item.badgeKey && (
                  <View style={[styles.reportBadge, item.id === 'forecast' && styles.reportBadgeAI]}>
                    <Text style={styles.reportBadgeText}>{t(item.badgeKey)}</Text>
                  </View>
                )}
                {item.apiId ? (
                  <Text style={styles.reportUpdated}>
                    {isLoading
                      ? t('mobile.reports.loading')
                      : lastUpdated
                        ? t('mobile.reports.updatedAt', { time: lastUpdated })
                        : t('mobile.reports.tapToLoad')}
                  </Text>
                ) : (
                  <Text style={styles.reportUpdated}>{t('mobile.reports.comingSoon')}</Text>
                )}
              </View>
              {item.apiId && <Text style={styles.viewText}>{t('mobile.reports.view')} →</Text>}
            </Pressable>
          )}
          columnWrapperStyle={styles.columnWrapper}
          contentContainerStyle={styles.gridContent}
        />

        {/* Export section */}
        <Card style={styles.exportCard}>
          <Text style={styles.exportTitle}>{t('mobile.reports.export.title')}</Text>
          <View style={styles.exportButtons}>
            <Button label={t('mobile.reports.export.tally')} variant="secondary" size="sm" onPress={() => {}} />
            <Button label={t('mobile.reports.export.csv')} variant="secondary" size="sm" onPress={() => {}} />
          </View>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: tk.canvas },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: tk.raised,
    borderBottomWidth: 1, borderBottomColor: tk.border,
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '700', color: tk.textPrimary },
  headerBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { padding: 16, gap: 16 },
  fyScroll: { marginBottom: 4 },
  fyScrollContent: { gap: 8 },
  fyChip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    backgroundColor: tk.sunken,
    borderWidth: 1, borderColor: tk.border, minHeight: 44,
    alignItems: 'center', justifyContent: 'center',
  },
  fyChipActive: { backgroundColor: tk.brandCta, borderColor: tk.brandCta },
  fyChipText: { fontSize: 13, fontWeight: '500', color: tk.textSecondary },
  fyChipTextActive: { color: tk.textOnBrand },

  // P&L summary
  summaryCard: { marginBottom: 4 },
  summarySkeletonCard: { height: 72, backgroundColor: tk.sunken, borderRadius: 16, marginBottom: 4 },
  summaryCardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  summaryLabel: { fontSize: 12, color: tk.textSecondary, marginBottom: 4 },
  summaryAmount: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  summaryUpdated: { fontSize: 11, color: tk.textTertiary },

  // Error
  errorCard: { padding: 16, alignItems: 'center', gap: 8 },
  errorText: { fontSize: 14, color: tk.errorFg, textAlign: 'center' },

  // Grid
  columnWrapper: { gap: 12, marginBottom: 12 },
  gridContent: {},
  reportCard: {
    flex: 1, backgroundColor: tk.raised,
    borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: tk.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  reportIconBg: {
    width: 44, height: 44, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  reportCardContent: { flex: 1 },
  reportLabel: { fontSize: 14, fontWeight: '600', color: tk.textPrimary, marginBottom: 4 },
  reportBadge: {
    backgroundColor: tk.brandTintBorder, paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 4, alignSelf: 'flex-start', marginBottom: 4,
  },
  reportBadgeAI: { backgroundColor: tk.gstAccent + '20' },
  reportBadgeText: { fontSize: 9, fontWeight: '700', color: tk.brandCta, letterSpacing: 0.5 },
  reportUpdated: { fontSize: 11, color: tk.textTertiary },
  viewText: { fontSize: 12, color: tk.brand500, fontWeight: '600', marginTop: 8 },

  // Export
  exportCard: { marginTop: 8, padding: 16 },
  exportTitle: { fontSize: 16, fontWeight: '600', color: tk.textPrimary, marginBottom: 12 },
  exportButtons: { gap: 10 },
  }),
);
