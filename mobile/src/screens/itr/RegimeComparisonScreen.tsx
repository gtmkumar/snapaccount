/**
 * RegimeComparisonScreen — Old vs New regime bar chart with recommendation and Choose CTA.
 * Tax slabs fetched from backend — never hardcoded.
 * Phase 6D — docs/design/mobile/itr/regime-comparison-screen.md
 */

import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
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
import type { RouteProp } from '@react-navigation/native';
import { RegimeBarChart } from '../../components/shared/RegimeBarChart';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { useSensitiveScreen } from '../../hooks/usePreventScreenCapture';
import { compareRegimes, getTaxSlabs } from '../../api/itr';
import type { TaxRegime } from '../../api/itr';
import type { ItrStackParamList } from '../../navigation/ItrStack';
import { formatINR } from '../../lib/utils';

type NavProp = NativeStackNavigationProp<ItrStackParamList, 'RegimeComparison'>;
type RoutePropType = RouteProp<ItrStackParamList, 'RegimeComparison'>;

interface Props {
  navigation: NavProp;
  route: RoutePropType;
}

const CURRENT_AY = 'AY2025-26';

export function RegimeComparisonScreen({ navigation, route }: Props) {
  const { tokens } = useTheme();
  const styles = useStyles();
  useSensitiveScreen();
  const { t } = useTranslation();
  const { filingId, computeData } = route.params;

  // Fetch tax slabs (both regimes) — config-driven from backend
  const { data: oldSlabs } = useQuery({
    queryKey: ['tax-slabs', CURRENT_AY, 'OLD'],
    queryFn: () => getTaxSlabs(CURRENT_AY, 'OLD'),
  });
  const { data: newSlabs } = useQuery({
    queryKey: ['tax-slabs', CURRENT_AY, 'NEW'],
    queryFn: () => getTaxSlabs(CURRENT_AY, 'NEW'),
  });

  // Compare regimes via backend engine
  const { data: comparison, isLoading, error } = useQuery({
    queryKey: ['regime-comparison', filingId],
    queryFn: () =>
      compareRegimes(filingId, computeData ?? {
        salaryIncome: 0,
        housePropertyIncome: 0,
        businessIncome: 0,
        capitalGains: 0,
        otherIncome: 0,
        section80C: 0,
        section80D: 0,
        section80E: 0,
        otherDeductions: 0,
        advanceTaxPaid: 0,
        tdsPaid: 0,
      }),
    enabled: !!filingId,
  });

  const handleChoose = (regime: TaxRegime) => {
    Alert.alert(
      t('mobile.itr.regimeComparison.confirmTitle'),
      t('mobile.itr.regimeComparison.confirmBody', { regime: regime === 'OLD' ? 'Old Regime' : 'New Regime' }),
      [
        { text: t('mobile.common.cancel'), style: 'cancel' },
        {
          text: t('mobile.itr.regimeComparison.confirmCta'),
          onPress: () => navigation.navigate('FilingSummary', { filingId, regime }),
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={8}
          accessibilityLabel={t('mobile.common.back')}>
          <Ionicons name="arrow-back" size={22} color={tokens.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('mobile.itr.regimeComparison.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={tokens.itrAccent} />
            <Text style={styles.loadingText}>{t('mobile.itr.regimeComparison.computing')}</Text>
          </View>
        ) : error ? (
          <View style={styles.errorWrap}>
            <Ionicons name="alert-circle-outline" size={40} color={tokens.errorFg} />
            <Text style={styles.errorText}>{t('mobile.itr.regimeComparison.error')}</Text>
          </View>
        ) : comparison ? (
          <>
            {/* Recommendation banner */}
            <View style={styles.recBanner}>
              <View style={styles.recIcon}>
                <Ionicons name="bulb" size={20} color={tokens.successFg} />
              </View>
              <View style={styles.recText}>
                <Text style={styles.recTitle}>
                  {t('mobile.itr.regimeComparison.recommended', {
                    regime: comparison.recommendedRegime === 'OLD' ? 'Old Regime' : 'New Regime',
                  })}
                </Text>
                <Text style={styles.recSaving}>
                  {t('mobile.itr.regimeComparison.saving', {
                    amount: formatINR(comparison.taxSaving),
                  })}
                </Text>
              </View>
            </View>

            {/* Bar chart */}
            <RegimeBarChart
              oldTax={comparison.old.totalTaxPayable}
              newTax={comparison.new.totalTaxPayable}
              recommendedRegime={comparison.recommendedRegime}
              testID="regime-bar-chart"
            />

            {/* Detail breakdown */}
            <View style={styles.detailCard}>
              <Text style={styles.detailTitle}>{t('mobile.itr.regimeComparison.breakdown')}</Text>
              {[
                {
                  label: t('mobile.itr.regimeComparison.grossIncome'),
                  old: comparison.old.grossTotalIncome,
                  new: comparison.new.grossTotalIncome,
                },
                {
                  label: t('mobile.itr.regimeComparison.taxableIncome'),
                  old: comparison.old.taxableIncome,
                  new: comparison.new.taxableIncome,
                },
                {
                  label: t('mobile.itr.regimeComparison.taxPayable'),
                  old: comparison.old.totalTaxPayable,
                  new: comparison.new.totalTaxPayable,
                },
                {
                  label: t('mobile.itr.regimeComparison.payableRefund'),
                  old: comparison.old.payableOrRefund,
                  new: comparison.new.payableOrRefund,
                },
              ].map((row) => (
                <View key={row.label} style={styles.detailRow}>
                  <Text style={styles.detailLabel}>{row.label}</Text>
                  <Text style={styles.detailOld}>{formatINR(row.old)}</Text>
                  <Text style={styles.detailNew}>{formatINR(row.new)}</Text>
                </View>
              ))}
            </View>

            {/* Tax slab info (from backend — never hardcoded) */}
            {(oldSlabs || newSlabs) && (
              <View style={styles.slabNote}>
                <Ionicons name="information-circle-outline" size={14} color={tokens.textSecondary} />
                <Text style={styles.slabNoteText}>
                  {t('mobile.itr.regimeComparison.slabVersion', {
                    version: newSlabs?.versionId ?? oldSlabs?.versionId ?? '—',
                    ay: CURRENT_AY,
                  })}
                </Text>
              </View>
            )}

            {/* Choose buttons */}
            <View style={styles.chooseRow}>
              <Pressable
                style={[
                  styles.chooseBtn,
                  styles.chooseBtnOld,
                  comparison.recommendedRegime === 'OLD' && styles.chooseBtnRecommended,
                ]}
                onPress={() => handleChoose('OLD')}
                accessibilityRole="button"
                accessibilityLabel={t('mobile.itr.regimeComparison.chooseOld')}
              >
                <Text style={[styles.chooseBtnText, styles.chooseBtnTextOld]}>
                  {t('mobile.itr.regimeComparison.chooseOld')}
                </Text>
                {comparison.recommendedRegime === 'OLD' && (
                  <View style={styles.recPill}>
                    <Text style={styles.recPillText}>Recommended</Text>
                  </View>
                )}
              </Pressable>
              <Pressable
                style={[
                  styles.chooseBtn,
                  styles.chooseBtnNew,
                  comparison.recommendedRegime === 'NEW' && styles.chooseBtnRecommended,
                ]}
                onPress={() => handleChoose('NEW')}
                accessibilityRole="button"
                accessibilityLabel={t('mobile.itr.regimeComparison.chooseNew')}
              >
                <Text style={styles.chooseBtnText}>
                  {t('mobile.itr.regimeComparison.chooseNew')}
                </Text>
                {comparison.recommendedRegime === 'NEW' && (
                  <View style={styles.recPill}>
                    <Text style={styles.recPillText}>Recommended</Text>
                  </View>
                )}
              </Pressable>
            </View>
          </>
        ) : null}
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: tk.raised,
    borderBottomWidth: 1,
    borderBottomColor: tk.border,
  },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: tk.sunken, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: tk.textPrimary, letterSpacing: -0.2 },
  scrollContent: { padding: 16, gap: 16 },

  loadingWrap: { alignItems: 'center', paddingVertical: 60, gap: 16 },
  loadingText: { fontSize: 14, color: tk.textSecondary },
  errorWrap: { alignItems: 'center', paddingVertical: 60, gap: 16 },
  errorText: { fontSize: 15, color: tk.textSecondary, textAlign: 'center' },

  recBanner: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: tk.successTint,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: tk.successTintBorder,
    alignItems: 'center',
  },
  recIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: tk.successTintBorder, alignItems: 'center', justifyContent: 'center' },
  recText: { flex: 1, gap: 2 },
  recTitle: { fontSize: 15, fontWeight: '700', color: tk.successFg },
  recSaving: { fontSize: 13, color: tk.successFg },

  detailCard: {
    backgroundColor: tk.raised,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: tk.border,
    overflow: 'hidden',
  },
  detailTitle: { fontSize: 14, fontWeight: '700', color: tk.textSecondary, padding: 14, borderBottomWidth: 1, borderBottomColor: tk.border },
  detailRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: tk.border },
  detailLabel: { flex: 2, fontSize: 13, color: tk.textSecondary },
  detailOld: { flex: 1, fontSize: 13, fontWeight: '600', color: tk.loanAccent, textAlign: 'right' },
  detailNew: { flex: 1, fontSize: 13, fontWeight: '600', color: tk.brandCta, textAlign: 'right' },

  slabNote: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  slabNoteText: { flex: 1, fontSize: 11, color: tk.textTertiary, lineHeight: 16 },

  chooseRow: { flexDirection: 'row', gap: 12 },
  chooseBtn: {
    flex: 1,
    minHeight: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  chooseBtnOld: { backgroundColor: tk.warningTint, borderWidth: 1.5, borderColor: tk.loanAccent },
  chooseBtnNew: { backgroundColor: tk.brandCta },
  chooseBtnRecommended: { borderWidth: 2, borderColor: tk.successFg },
  chooseBtnText: { fontSize: 15, fontWeight: '700', color: tk.textOnBrand },
  chooseBtnTextOld: { color: tk.loanAccent },
  recPill: { backgroundColor: tk.successFg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  recPillText: { fontSize: 10, fontWeight: '700', color: tk.textOnBrand, textTransform: 'uppercase', letterSpacing: 0.3 },
  }),
);
