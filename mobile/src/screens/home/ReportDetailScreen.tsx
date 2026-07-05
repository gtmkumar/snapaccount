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
import { useTranslation } from 'react-i18next';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { AmountDisplay } from '../../components/ui/AmountDisplay';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { getCurrentFinancialYear } from '../../lib/utils';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { getReportRows, normalizeReportSlug } from '../../api/accounting';
import { reportTypeForSlug } from '../../api/reports';
import type { HomeStackParamList } from '../../navigation/HomeStack';
import { useSensitiveScreen } from '../../hooks/usePreventScreenCapture';

type NavProp = NativeStackNavigationProp<HomeStackParamList, 'ReportDetail'>;
type RoutePropType = RouteProp<HomeStackParamList, 'ReportDetail'>;

interface Props { navigation: NavProp; route: RoutePropType }

// i18n title key per incoming slug (UI aliases included: pnl, cash-flow, …).
const REPORT_TITLE_KEYS: Record<string, string> = {
  'trial-balance': 'mobile.reports.types.trialBalance',
  'pnl': 'mobile.reports.types.pnl',
  'profit-and-loss': 'mobile.reports.types.pnl',
  'balance-sheet': 'mobile.reports.types.balanceSheet',
  'cash-flow': 'mobile.reports.types.cashFlow',
  'tax-liability': 'mobile.reports.types.taxLiability',
  'ledger': 'mobile.reports.types.ledger',
  'comparative': 'mobile.reports.types.comparative',
  'forecast': 'mobile.reports.types.forecast',
};

export function ReportDetailScreen({ navigation, route }: Props) {
  const styles = useStyles();
  const { tokens } = useTheme();
  const { t } = useTranslation();
  // SEC-015: Prevent screenshots on financial report detail screen (shows balance sheet, P&L, tax liability)
  useSensitiveScreen();

  const { reportType } = route.params;
  const fy = getCurrentFinancialYear();
  // Normalise the FinancialReportsList card slug to a backend-canonical report
  // type ('pnl' → 'profit-and-loss'); unsupported slugs (cash-flow / ledger /
  // forecast) resolve to null → "not available" state, no API call.
  const apiType = normalizeReportSlug(reportType);
  const titleKey = REPORT_TITLE_KEYS[reportType];
  const title = titleKey ? t(titleKey) : t('mobile.reports.detail.fallbackTitle');

  // DG-DASH-05: only slugs with a backend PDF generator can be exported/previewed.
  const canExportPdf = reportTypeForSlug(reportType) !== null;
  const openPdfPreview = () =>
    navigation.navigate('ReportPdfPreview', { reportType, title });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['report-rows', apiType, fy.startYear],
    queryFn: () => getReportRows(apiType!, { fyYear: fy.startYear }),
    enabled: apiType !== null,
  });

  const rows = data?.rows ?? [];

  const handleShare = async () => {
    await Share.share({
      title: `${title} - ${fy.label}`,
      message: t('mobile.reports.detail.shareMessage', { report: title, fy: fy.label }),
    });
  };

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
          <Text style={styles.backText}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        <View style={styles.headerActions}>
          {canExportPdf && (
            <Pressable
              onPress={openPdfPreview}
              style={styles.headerIconBtn}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('mobile.reports.detail.downloadPdf')}
            >
              <Ionicons name="download-outline" size={20} color={tokens.brand500} />
            </Pressable>
          )}
          <Pressable
            onPress={handleShare}
            style={styles.headerIconBtn}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('mobile.reports.detail.share')}
          >
            <Ionicons name="share-outline" size={20} color={tokens.brand500} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Report header card */}
        <Card style={styles.reportHeaderCard}>
          <Text style={styles.reportTitle}>{title}</Text>
          <Text style={styles.reportPeriod}>
            {t('mobile.reports.detail.periodLine', {
              fy: fy.label,
              startYear: fy.startYear,
              endYear: fy.endYear,
            })}
          </Text>
          <Text style={styles.reportGenerated}>
            {t('mobile.reports.detail.generated', {
              date: new Date().toLocaleDateString('en-IN'),
            })}
          </Text>
        </Card>

        {/* Report rows */}
        <Card style={styles.reportContent}>
          {apiType === null ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>
                {t('mobile.reports.detail.notAvailable')}
              </Text>
            </View>
          ) : isLoading ? (
            <View style={styles.loadingRows}>
              {[1, 2, 3, 4, 5].map((i) => (
                <View key={i} style={styles.skeletonRow} />
              ))}
            </View>
          ) : isError ? (
            <View
              style={styles.emptyState}
              accessibilityLiveRegion="assertive"
              accessibilityRole="alert"
            >
              <Text style={styles.emptyStateText}>{t('mobile.reports.error')}</Text>
              <View style={styles.errorRetry}>
                <Button label={t('mobile.reports.retry')} size="sm" onPress={() => refetch()} />
              </View>
            </View>
          ) : rows.length > 0 ? (
            rows.map((row, index) => (
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
                {t('mobile.reports.detail.empty', { fy: fy.label })}
              </Text>
            </View>
          )}
        </Card>

        {/* Action bar */}
        <View style={styles.actionBar}>
          {canExportPdf && (
            <Button
              label={t('mobile.reports.detail.downloadPdf')}
              onPress={openPdfPreview}
              disabled={rows.length === 0}
              fullWidth
            />
          )}
          <Button
            label={t('mobile.reports.detail.share')}
            variant={canExportPdf ? 'secondary' : 'primary'}
            onPress={handleShare}
            disabled={rows.length === 0}
            fullWidth
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: tk.canvas },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: tk.raised,
    borderBottomWidth: 1,
    borderBottomColor: tk.border,
  },
  backBtn: { padding: 4, marginRight: 8 },
  backText: { fontSize: 20, color: tk.brand500 },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: tk.textPrimary },
  headerActions: { flexDirection: 'row', gap: 4 },
  headerIconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: { padding: 16, gap: 16 },
  reportHeaderCard: { padding: 16 },
  reportTitle: { fontSize: 20, fontWeight: '700', color: tk.textPrimary },
  reportPeriod: { fontSize: 14, color: tk.textSecondary, marginTop: 4 },
  reportGenerated: { fontSize: 12, color: tk.textTertiary, marginTop: 2 },
  reportContent: { padding: 0, overflow: 'hidden' },
  reportRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: tk.border,
  },
  reportRowTotal: {
    backgroundColor: tk.canvas,
    borderTopWidth: 2,
    borderTopColor: tk.border,
  },
  reportRowHighlighted: {
    backgroundColor: tk.brandTint,
  },
  rowLabel: { fontSize: 14, color: tk.textSecondary, flex: 1 },
  rowLabelTotal: { fontWeight: '700', color: tk.textPrimary },
  loadingRows: { padding: 16, gap: 12 },
  skeletonRow: {
    height: 20,
    backgroundColor: tk.border,
    borderRadius: 4,
  },
  emptyState: { padding: 32, alignItems: 'center', gap: 12 },
  emptyStateText: {
    fontSize: 14,
    color: tk.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  errorRetry: { marginTop: 4 },
  actionBar: { gap: 10 },
  }),
);
