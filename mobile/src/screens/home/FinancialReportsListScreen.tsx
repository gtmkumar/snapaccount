/**
 * Financial Reports List Screen — Phase 6A
 * Wired to GET /accounting/reports/{type} for the 6 accounting reports.
 * Loading / empty / error states. FY selector drives API params.
 * Matches docs/design/screens/mobile/dashboard-reports.md §Screen 9
 */

import React, { useState } from 'react';
import {
  FlatList,
  Pressable,
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
import { Colors } from '../../constants/colors';
import { getFinancialYears } from '../../lib/utils';
import type { HomeStackParamList } from '../../navigation/HomeStack';
import { getFinancialReport, type ReportType } from '../../api/accounting';
import { useAuthStore } from '../../store/authStore';

type NavProp = NativeStackNavigationProp<HomeStackParamList, 'FinancialReportsList'>;
interface Props { navigation: NavProp }

// Only the 6 report types backed by GET /accounting/reports/{type}
type ApiReportId = 'profit-and-loss' | 'balance-sheet' | 'trial-balance';

type ReportCard = {
  id: string;
  apiId?: ApiReportId;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  badge?: string;
};

const REPORT_TYPES: ReportCard[] = [
  { id: 'trial-balance', apiId: 'trial-balance', label: 'Trial Balance', icon: 'scale-outline', color: Colors.brand[500] },
  { id: 'pnl', apiId: 'profit-and-loss', label: 'Profit & Loss', icon: 'trending-up-outline', color: Colors.positive },
  { id: 'balance-sheet', apiId: 'balance-sheet', label: 'Balance Sheet', icon: 'business-outline', color: Colors.brand[600] },
  { id: 'cash-flow', label: 'Cash Flow', icon: 'swap-horizontal-outline', color: Colors.info[600] },
  { id: 'tax-liability', label: 'Tax Liability', icon: 'calculator-outline', color: Colors.gst },
  { id: 'ledger', label: 'Ledger', icon: 'book-outline', color: Colors.neutral[600] },
  { id: 'comparative', label: 'Comparative', icon: 'bar-chart-outline', color: Colors.accent[600], badge: 'NEW' },
  { id: 'forecast', label: 'Cash Flow Forecast', icon: 'analytics-outline', color: Colors.itr, badge: 'AI' },
];

const FY_LIST = getFinancialYears(4);

// Parse "FY 2025-26" → { fiscalYear: "2025", periodMonth: undefined }
function parseFy(fy: string): { fiscalYear: string } {
  const match = fy.match(/(\d{4})/);
  return { fiscalYear: match ? match[1] : '2025' };
}

export function FinancialReportsListScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const [selectedFY, setSelectedFY] = useState(FY_LIST[0]);
  const { user } = useAuthStore();
  const organizationId = (user as { organizationId?: string } | null)?.organizationId ?? 'default';
  const { fiscalYear } = parseFy(selectedFY);

  // Pre-fetch P&L as the primary report for the selected FY
  // Individual report detail fetches happen in ReportDetailScreen
  const { data: plReport, isLoading, isError, refetch } = useQuery({
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
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color={Colors.brand[500]} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('mobile.reports.title')}</Text>
        <Pressable onPress={() => refetch()} style={styles.headerBtn} hitSlop={8}>
          <Ionicons name="refresh-outline" size={20} color={Colors.neutral[600]} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
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
          <View style={styles.summarySkeletonCard} />
        ) : isError ? (
          <Card style={styles.errorCard}>
            <Text style={styles.errorText}>{t('mobile.reports.error')}</Text>
            <Button label={t('mobile.reports.retry')} size="sm" onPress={() => refetch()} />
          </Card>
        ) : plReport ? (
          <Card shadow="md" padding="md" style={styles.summaryCard}>
            <View style={styles.summaryCardRow}>
              <View>
                <Text style={styles.summaryLabel}>Net Profit / Loss</Text>
                <Text
                  style={[
                    styles.summaryAmount,
                    { color: (netProfit ?? 0) >= 0 ? Colors.positive : Colors.negative },
                  ]}
                >
                  {netProfit !== undefined
                    ? `₹ ${Math.abs(netProfit).toLocaleString('en-IN')}`
                    : '—'}
                </Text>
              </View>
              {lastUpdated && (
                <Text style={styles.summaryUpdated}>Updated {lastUpdated}</Text>
              )}
            </View>
          </Card>
        ) : null}

        {/* Reports grid */}
        <FlatList
          data={REPORT_TYPES}
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
              accessibilityLabel={`View ${item.label} report`}
            >
              <View style={[styles.reportIconBg, { backgroundColor: item.color + '20' }]}>
                <Ionicons name={item.icon} size={22} color={item.color} />
              </View>
              <View style={styles.reportCardContent}>
                <Text style={styles.reportLabel}>{item.label}</Text>
                {item.badge && (
                  <View style={[styles.reportBadge, item.badge === 'AI' && styles.reportBadgeAI]}>
                    <Text style={styles.reportBadgeText}>{item.badge}</Text>
                  </View>
                )}
                {item.apiId ? (
                  <Text style={styles.reportUpdated}>
                    {isLoading ? 'Loading…' : lastUpdated ? `Updated ${lastUpdated}` : 'Tap to load'}
                  </Text>
                ) : (
                  <Text style={styles.reportUpdated}>Coming soon</Text>
                )}
              </View>
              {item.apiId && <Text style={styles.viewText}>View →</Text>}
            </Pressable>
          )}
          columnWrapperStyle={styles.columnWrapper}
          contentContainerStyle={styles.gridContent}
        />

        {/* Export section */}
        <Card style={styles.exportCard}>
          <Text style={styles.exportTitle}>Export for CA / Auditor</Text>
          <View style={styles.exportButtons}>
            <Button label="Tally XML Export" variant="secondary" size="sm" onPress={() => {}} />
            <Button label="Standard CSV Export" variant="secondary" size="sm" onPress={() => {}} />
          </View>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.base },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: Colors.surface.default,
    borderBottomWidth: 1, borderBottomColor: Colors.neutral[200],
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '700', color: Colors.neutral[900] },
  headerBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { padding: 16, gap: 16 },
  fyScroll: { marginBottom: 4 },
  fyScrollContent: { gap: 8 },
  fyChip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    backgroundColor: Colors.neutral[100],
    borderWidth: 1, borderColor: Colors.neutral[200], minHeight: 44,
    alignItems: 'center', justifyContent: 'center',
  },
  fyChipActive: { backgroundColor: Colors.brand[500], borderColor: Colors.brand[500] },
  fyChipText: { fontSize: 13, fontWeight: '500', color: Colors.neutral[600] },
  fyChipTextActive: { color: Colors.neutral[0] },

  // P&L summary
  summaryCard: { marginBottom: 4 },
  summarySkeletonCard: { height: 72, backgroundColor: Colors.neutral[100], borderRadius: 16, marginBottom: 4 },
  summaryCardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  summaryLabel: { fontSize: 12, color: Colors.neutral[500], marginBottom: 4 },
  summaryAmount: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  summaryUpdated: { fontSize: 11, color: Colors.neutral[400] },

  // Error
  errorCard: { padding: 16, alignItems: 'center', gap: 8 },
  errorText: { fontSize: 14, color: Colors.error[600], textAlign: 'center' },

  // Grid
  columnWrapper: { gap: 12, marginBottom: 12 },
  gridContent: {},
  reportCard: {
    flex: 1, backgroundColor: Colors.surface.default,
    borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: Colors.neutral[200],
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  reportIconBg: {
    width: 44, height: 44, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  reportCardContent: { flex: 1 },
  reportLabel: { fontSize: 14, fontWeight: '600', color: Colors.neutral[800], marginBottom: 4 },
  reportBadge: {
    backgroundColor: Colors.brand[100], paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 4, alignSelf: 'flex-start', marginBottom: 4,
  },
  reportBadgeAI: { backgroundColor: Colors.gst + '20' },
  reportBadgeText: { fontSize: 9, fontWeight: '700', color: Colors.brand[600], letterSpacing: 0.5 },
  reportUpdated: { fontSize: 11, color: Colors.neutral[400] },
  viewText: { fontSize: 12, color: Colors.brand[500], fontWeight: '600', marginTop: 8 },

  // Export
  exportCard: { marginTop: 8, padding: 16 },
  exportTitle: { fontSize: 16, fontWeight: '600', color: Colors.neutral[800], marginBottom: 12 },
  exportButtons: { gap: 10 },
});
