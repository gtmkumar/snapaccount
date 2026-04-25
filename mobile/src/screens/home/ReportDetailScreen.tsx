/**
 * Report Detail Screen
 * Displays a specific financial report
 * Matches docs/design/screens/mobile/dashboard-reports.md §Screen 10
 */

import React from 'react';
import {
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { AmountDisplay } from '../../components/ui/AmountDisplay';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Colors } from '../../constants/colors';
import { getCurrentFinancialYear } from '../../lib/utils';
import apiClient from '../../lib/api';
import type { HomeStackParamList } from '../../navigation/HomeStack';
import { useSensitiveScreen } from '../../hooks/usePreventScreenCapture';

type NavProp = NativeStackNavigationProp<HomeStackParamList, 'ReportDetail'>;
type RoutePropType = RouteProp<HomeStackParamList, 'ReportDetail'>;

interface Props { navigation: NavProp; route: RoutePropType }

const REPORT_TITLES: Record<string, string> = {
  'trial-balance': 'Trial Balance',
  'pnl': 'Profit & Loss',
  'balance-sheet': 'Balance Sheet',
  'cash-flow': 'Cash Flow Statement',
  'tax-liability': 'Tax Liability',
  'ledger': 'Ledger',
  'comparative': 'Comparative Analysis',
  'forecast': 'Cash Flow Forecast',
};

interface ReportRow {
  label: string;
  amount: number;
  isTotal?: boolean;
  isHighlighted?: boolean;
}

export function ReportDetailScreen({ navigation, route }: Props) {
  // SEC-015: Prevent screenshots on financial report detail screen (shows balance sheet, P&L, tax liability)
  useSensitiveScreen();

  const { reportType } = route.params;
  const fy = getCurrentFinancialYear();
  const title = REPORT_TITLES[reportType] ?? 'Report';

  const { data: reportData, isLoading } = useQuery({
    queryKey: ['report', reportType, fy.label],
    queryFn: async () => {
      const res = await apiClient.get<{ rows: ReportRow[]; period: string }>(`/reports/${reportType}`);
      return res.data;
    },
    placeholderData: { rows: [], period: fy.label },
  });

  const handleShare = async () => {
    await Share.share({
      title: `${title} - ${fy.label}`,
      message: `SnapAccount ${title} report for ${fy.label}`,
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        <View style={styles.headerActions}>
          <Pressable onPress={handleShare} style={styles.headerActionBtn} accessibilityLabel="Share">
            <Text style={styles.headerActionText}>⬆️</Text>
          </Pressable>
          <Pressable style={styles.headerActionBtn} accessibilityLabel="Download">
            <Text style={styles.headerActionText}>⬇️</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Report header card */}
        <Card style={styles.reportHeaderCard}>
          <Text style={styles.reportTitle}>{title}</Text>
          <Text style={styles.reportPeriod}>
            Period: {fy.label} (April {fy.startYear} – March {fy.endYear})
          </Text>
          <Text style={styles.reportGenerated}>Generated: {new Date().toLocaleDateString('en-IN')}</Text>
        </Card>

        {/* Report rows */}
        <Card style={styles.reportContent}>
          {isLoading ? (
            <View style={styles.loadingRows}>
              {[1, 2, 3, 4, 5].map((i) => (
                <View key={i} style={styles.skeletonRow} />
              ))}
            </View>
          ) : reportData?.rows && reportData.rows.length > 0 ? (
            reportData.rows.map((row, index) => (
              <View
                key={index}
                style={[
                  styles.reportRow,
                  row.isTotal && styles.reportRowTotal,
                  row.isHighlighted && styles.reportRowHighlighted,
                ]}
              >
                <Text
                  style={[
                    styles.rowLabel,
                    row.isTotal && styles.rowLabelTotal,
                  ]}
                >
                  {row.label}
                </Text>
                <AmountDisplay
                  amount={row.amount}
                  size={row.isTotal ? 'lg' : 'md'}
                  colorCode={row.isHighlighted}
                  sign={row.isHighlighted ? 'auto' : 'none'}
                />
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>
                No data available for {fy.label}.{'\n'}Upload documents to generate this report.
              </Text>
            </View>
          )}
        </Card>

        {/* Action bar */}
        <View style={styles.actionBar}>
          <Button
            label="Download PDF"
            variant="secondary"
            onPress={() => {}}
            fullWidth
          />
          <Button
            label="Share"
            onPress={handleShare}
            fullWidth
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.base },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.surface.default,
    borderBottomWidth: 1,
    borderBottomColor: Colors.neutral[200],
  },
  backBtn: { padding: 4, marginRight: 8 },
  backText: { fontSize: 20, color: Colors.brand[500] },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: Colors.neutral[900] },
  headerActions: { flexDirection: 'row', gap: 8 },
  headerActionBtn: { padding: 8 },
  headerActionText: { fontSize: 18 },
  scrollContent: { padding: 16, gap: 16 },
  reportHeaderCard: { padding: 16 },
  reportTitle: { fontSize: 20, fontWeight: '700', color: Colors.neutral[900] },
  reportPeriod: { fontSize: 14, color: Colors.neutral[600], marginTop: 4 },
  reportGenerated: { fontSize: 12, color: Colors.neutral[400], marginTop: 2 },
  reportContent: { padding: 0, overflow: 'hidden' },
  reportRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.neutral[100],
  },
  reportRowTotal: {
    backgroundColor: Colors.neutral[50],
    borderTopWidth: 2,
    borderTopColor: Colors.neutral[300],
  },
  reportRowHighlighted: {
    backgroundColor: Colors.brand[50],
  },
  rowLabel: { fontSize: 14, color: Colors.neutral[700], flex: 1 },
  rowLabelTotal: { fontWeight: '700', color: Colors.neutral[900] },
  loadingRows: { padding: 16, gap: 12 },
  skeletonRow: {
    height: 20,
    backgroundColor: Colors.neutral[200],
    borderRadius: 4,
  },
  emptyState: { padding: 32, alignItems: 'center' },
  emptyStateText: {
    fontSize: 14,
    color: Colors.neutral[500],
    textAlign: 'center',
    lineHeight: 20,
  },
  actionBar: { gap: 10 },
});
