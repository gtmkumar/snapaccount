/**
 * FilingSummaryScreen — Pre-approval full summary with AccordionSection groups.
 * Phase 6D — docs/design/mobile/itr/filing-summary-screen.md
 */

import React from 'react';
import {
  ActivityIndicator,
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
import { AccordionSection } from '../../components/shared/AccordionSection';
import { SummaryList } from '../../components/shared/SummaryList';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { useSensitiveScreen } from '../../hooks/usePreventScreenCapture';
import { getItrFiling } from '../../api/itr';
import type { ItrStackParamList } from '../../navigation/ItrStack';

type NavProp = NativeStackNavigationProp<ItrStackParamList, 'FilingSummary'>;
type RoutePropType = RouteProp<ItrStackParamList, 'FilingSummary'>;

interface Props {
  navigation: NavProp;
  route: RoutePropType;
}

export function FilingSummaryScreen({ navigation, route }: Props) {
  const { tokens } = useTheme();
  const styles = useStyles();
  useSensitiveScreen();
  const { t } = useTranslation();
  const { filingId, regime } = route.params;

  const { data: filing, isLoading } = useQuery({
    queryKey: ['itr-filing', filingId],
    queryFn: () => getItrFiling(filingId),
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={8}
          accessibilityLabel={t('mobile.common.back')}>
          <Ionicons name="arrow-back" size={22} color={tokens.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('mobile.itr.summary.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <ActivityIndicator size="large" color={tokens.itrAccent} style={{ marginTop: 40 }} />
        ) : filing ? (
          <>
            {/* Filing overview card */}
            <View style={styles.overviewCard}>
              <View style={styles.overviewRow}>
                <View>
                  <Text style={styles.overviewLabel}>{t('mobile.itr.summary.assessmentYear')}</Text>
                  <Text style={styles.overviewValue}>{filing.assessmentYear}</Text>
                </View>
                <View style={styles.regimePill}>
                  <Text style={styles.regimePillText}>
                    {(regime ?? filing.regime) === 'OLD' ? 'Old Regime' : 'New Regime'}
                  </Text>
                </View>
              </View>
              <View style={styles.overviewDivider} />
              <View style={styles.overviewRow}>
                <Text style={styles.overviewLabel}>{t('mobile.itr.summary.form')}</Text>
                <Text style={styles.overviewValue}>{filing.itrFormType}</Text>
              </View>
              <View style={styles.overviewDivider} />
              <View style={styles.overviewRow}>
                <Text style={styles.overviewLabel}>{t('mobile.itr.summary.status')}</Text>
                <View style={styles.statusBadge}>
                  <Text style={styles.statusBadgeText}>{filing.status}</Text>
                </View>
              </View>
            </View>

            {/* Accordions — group data into collapsible sections */}
            <AccordionSection
              title={t('mobile.itr.summary.incomeSection')}
              defaultOpen
              testID="income-section"
            >
              <SummaryList
                items={[
                  { label: t('mobile.itr.summary.grossIncome'), value: '— ' },
                  { label: t('mobile.itr.summary.taxableIncome'), value: '—' },
                  { label: t('mobile.itr.summary.standardDeduction'), value: '—' },
                ]}
              />
            </AccordionSection>

            <AccordionSection
              title={t('mobile.itr.summary.deductionsSection')}
              testID="deductions-section"
            >
              <SummaryList
                items={[
                  { label: 'Section 80C', value: '—' },
                  { label: 'Section 80D', value: '—' },
                  { label: 'Section 80E', value: '—' },
                ]}
              />
            </AccordionSection>

            <AccordionSection
              title={t('mobile.itr.summary.taxSection')}
              testID="tax-section"
            >
              <SummaryList
                items={[
                  { label: t('mobile.itr.summary.taxPayable'), value: '—' },
                  { label: t('mobile.itr.summary.tdsPaid'), value: '—' },
                  { label: t('mobile.itr.summary.payableRefund'), value: '—' },
                ]}
              />
            </AccordionSection>

            <AccordionSection
              title={t('mobile.itr.summary.personalSection')}
              testID="personal-section"
            >
              <SummaryList
                items={[
                  { label: t('mobile.itr.summary.name'), value: '—' },
                  { label: t('mobile.itr.summary.pan'), value: '****' },
                  { label: t('mobile.itr.summary.email'), value: '—' },
                ]}
              />
            </AccordionSection>

            {filing.computationHash && (
              <View style={styles.hashCard}>
                <Ionicons name="shield-checkmark-outline" size={16} color={tokens.successFg} />
                <Text style={styles.hashText} numberOfLines={1}>
                  {t('mobile.itr.summary.hash')}: {filing.computationHash.slice(0, 16)}…
                </Text>
              </View>
            )}
          </>
        ) : null}
      </ScrollView>

      {/* Proceed to approval */}
      {filing && (
        <View style={styles.footer}>
          <Pressable
            style={styles.approveBtn}
            onPress={() => navigation.navigate('UserApproval', { filingId })}
            accessibilityRole="button"
            accessibilityLabel={t('mobile.itr.summary.proceedToApproval')}
          >
            <Text style={styles.approveBtnText}>{t('mobile.itr.summary.proceedToApproval')}</Text>
          </Pressable>
        </View>
      )}
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
  headerTitle: { fontSize: 18, fontWeight: '700', color: tk.textPrimary, letterSpacing: -0.2 },
  scrollContent: { padding: 16, gap: 14 },

  overviewCard: {
    backgroundColor: tk.raised, borderRadius: 16,
    borderWidth: 1, borderColor: tk.border, overflow: 'hidden',
  },
  overviewRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, minHeight: 52,
  },
  overviewLabel: { fontSize: 13, color: tk.textSecondary },
  overviewValue: { fontSize: 15, fontWeight: '700', color: tk.textPrimary },
  overviewDivider: { height: 1, backgroundColor: tk.sunken, marginHorizontal: 16 },
  regimePill: { backgroundColor: tk.itrAccent + '15', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  regimePillText: { fontSize: 13, fontWeight: '700', color: tk.itrAccent },
  statusBadge: { backgroundColor: tk.warningTint, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusBadgeText: { fontSize: 12, fontWeight: '700', color: tk.warningFg },

  hashCard: {
    flexDirection: 'row', gap: 8, alignItems: 'center',
    backgroundColor: tk.successTint, borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: tk.successTintBorder,
  },
  hashText: { flex: 1, fontSize: 12, color: tk.successFg, fontFamily: 'monospace' },

  footer: { padding: 16, borderTopWidth: 1, borderTopColor: tk.border, backgroundColor: tk.raised },
  approveBtn: { backgroundColor: tk.itrAccent, borderRadius: 14, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  approveBtnText: { fontSize: 16, fontWeight: '700', color: tk.textOnBrand },
  }),
);
