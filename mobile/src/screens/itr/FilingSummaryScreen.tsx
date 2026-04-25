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
import { Colors } from '../../constants/colors';
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
          <Ionicons name="arrow-back" size={22} color={Colors.neutral[800]} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('mobile.itr.summary.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <ActivityIndicator size="large" color={Colors.itr} style={{ marginTop: 40 }} />
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
                <Ionicons name="shield-checkmark-outline" size={16} color={Colors.success[600]} />
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.base },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: Colors.surface.default, borderBottomWidth: 1, borderBottomColor: Colors.neutral[100],
  },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.neutral[100], alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.neutral[900], letterSpacing: -0.2 },
  scrollContent: { padding: 16, gap: 14 },

  overviewCard: {
    backgroundColor: Colors.surface.default, borderRadius: 16,
    borderWidth: 1, borderColor: Colors.neutral[100], overflow: 'hidden',
  },
  overviewRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, minHeight: 52,
  },
  overviewLabel: { fontSize: 13, color: Colors.neutral[500] },
  overviewValue: { fontSize: 15, fontWeight: '700', color: Colors.neutral[900] },
  overviewDivider: { height: 1, backgroundColor: Colors.neutral[100], marginHorizontal: 16 },
  regimePill: { backgroundColor: Colors.itr + '15', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  regimePillText: { fontSize: 13, fontWeight: '700', color: Colors.itr },
  statusBadge: { backgroundColor: Colors.warning[50], borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusBadgeText: { fontSize: 12, fontWeight: '700', color: Colors.warning[700] },

  hashCard: {
    flexDirection: 'row', gap: 8, alignItems: 'center',
    backgroundColor: Colors.success[50], borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: Colors.success[200],
  },
  hashText: { flex: 1, fontSize: 12, color: Colors.success[700], fontFamily: 'monospace' },

  footer: { padding: 16, borderTopWidth: 1, borderTopColor: Colors.neutral[100], backgroundColor: Colors.surface.default },
  approveBtn: { backgroundColor: Colors.itr, borderRadius: 14, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  approveBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
});
