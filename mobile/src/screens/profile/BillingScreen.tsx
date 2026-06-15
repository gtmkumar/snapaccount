/**
 * BillingScreen — current subscription + invoice history.
 * Task #18 (GAP-060rem): replaces the disabled "Subscription & Billing"
 * Alert stub on ProfileScreen.
 *
 * Data: GET /subscriptions/me + GET /subscriptions/invoices (src/api/subscriptions).
 * The Subscription backend is mid-fix (Razorpay Wave 2) — 4xx/5xx surface as a
 * visible error state with retry, never a blank screen.
 */

import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { getMySubscription, listInvoices, type InvoiceDto } from '../../api/subscriptions';
import type { MoreStackParamList } from '../../navigation/MoreStack';

type NavProp = NativeStackNavigationProp<MoreStackParamList, 'Billing'>;
interface Props { navigation: NavProp }

function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

export function BillingScreen({ navigation }: Props) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();

  const subscription = useQuery({
    queryKey: ['subscription-me'],
    queryFn: getMySubscription,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const invoices = useQuery({
    queryKey: ['subscription-invoices'],
    queryFn: () => listInvoices(1, 20),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const isLoading = subscription.isLoading || invoices.isLoading;
  // Subscription failure is fatal for the screen; invoice failure degrades to
  // an inline error row (the plan card can still render).
  const fatalError = subscription.isError;

  const retryAll = () => {
    void subscription.refetch();
    void invoices.refetch();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          accessibilityLabel={t('mobile.common.back')}
          hitSlop={8}
        >
          <Ionicons name="arrow-back" size={22} color={tokens.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('mobile.billing.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {isLoading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={tokens.brandCta} />
        </View>
      ) : fatalError ? (
        <View style={styles.centerBox}>
          <Ionicons name="cloud-offline-outline" size={48} color={tokens.textTertiary} />
          <Text style={styles.errorTitle}>{t('mobile.billing.error.title')}</Text>
          <Text style={styles.errorBody}>{t('mobile.billing.error.body')}</Text>
          <Pressable
            style={styles.retryBtn}
            onPress={retryAll}
            accessibilityRole="button"
            accessibilityLabel={t('mobile.common.retry')}
          >
            <Text style={styles.retryBtnText}>{t('mobile.common.retry')}</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Current plan */}
          {subscription.data ? (
            <View style={styles.planCard}>
              <Text style={styles.planCardLabel}>{t('mobile.billing.currentPlan')}</Text>
              <View style={styles.planNameRow}>
                <Text style={styles.planName}>{subscription.data.planName}</Text>
                <View style={styles.statusPill}>
                  <Text style={styles.statusPillText}>{subscription.data.status}</Text>
                </View>
              </View>
              <PlanRow label={t('mobile.billing.price')} value={formatINR(subscription.data.priceInr)} />
              <PlanRow label={t('mobile.billing.cycle')} value={subscription.data.billingCycle} />
              <PlanRow
                label={t('mobile.billing.period')}
                value={`${formatDate(subscription.data.currentPeriodStart)} – ${formatDate(subscription.data.currentPeriodEnd)}`}
              />
            </View>
          ) : (
            <View style={styles.planCard}>
              <Text style={styles.noPlanTitle}>{t('mobile.billing.noPlan.title')}</Text>
              <Text style={styles.noPlanBody}>{t('mobile.billing.noPlan.body')}</Text>
            </View>
          )}

          {/* Invoices */}
          <Text style={styles.sectionTitle}>{t('mobile.billing.invoices')}</Text>
          {invoices.isError ? (
            <View style={styles.inlineError}>
              <Ionicons name="alert-circle-outline" size={16} color={tokens.errorFg} />
              <Text style={styles.inlineErrorText}>{t('mobile.billing.error.title')}</Text>
              <Pressable
                onPress={() => void invoices.refetch()}
                accessibilityRole="button"
                accessibilityLabel={t('mobile.common.retry')}
                style={styles.inlineRetry}
                hitSlop={8}
              >
                <Text style={styles.inlineRetryText}>{t('mobile.common.retry')}</Text>
              </Pressable>
            </View>
          ) : !invoices.data || invoices.data.items.length === 0 ? (
            <Text style={styles.emptyText}>{t('mobile.billing.invoicesEmpty')}</Text>
          ) : (
            invoices.data.items.map((inv) => <InvoiceRow key={inv.invoiceId} invoice={inv} t={t} />)
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function PlanRow({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <View
      style={styles.planRow}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${label}, ${value}`}
    >
      <Text style={styles.planRowLabel} importantForAccessibility="no">{label}</Text>
      <Text style={styles.planRowValue} importantForAccessibility="no">{value}</Text>
    </View>
  );
}

function InvoiceRow({
  invoice,
  t,
}: {
  invoice: InvoiceDto;
  t: (k: string, o?: Record<string, unknown>) => string;
}) {
  const styles = useStyles();
  const period = `${formatDate(invoice.periodStart)} – ${formatDate(invoice.periodEnd)}`;
  return (
    <View
      style={styles.invoiceRow}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${invoice.invoiceNumber}, ${period}, ${t('mobile.billing.invoiceTotal')} ${formatINR(invoice.totalInr)}, ${invoice.status}`}
      testID={`invoice-${invoice.invoiceNumber}`}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.invoiceNumber}>{invoice.invoiceNumber}</Text>
        <Text style={styles.invoicePeriod}>{period}</Text>
        {invoice.paidAt ? (
          <Text style={styles.invoicePaid}>{t('mobile.billing.paidOn', { date: formatDate(invoice.paidAt) })}</Text>
        ) : null}
      </View>
      <View style={styles.invoiceAmountCol}>
        <Text style={styles.invoiceTotal}>{formatINR(invoice.totalInr)}</Text>
        <Text style={styles.invoiceStatus}>{invoice.status}</Text>
      </View>
    </View>
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

  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 },
  errorTitle: { fontSize: 16, fontWeight: '700', color: tk.textPrimary, textAlign: 'center' },
  errorBody: { fontSize: 14, color: tk.textSecondary, textAlign: 'center', lineHeight: 21 },
  retryBtn: {
    backgroundColor: tk.brandCta, borderRadius: 12,
    paddingHorizontal: 24, paddingVertical: 12, minHeight: 44,
    alignItems: 'center', justifyContent: 'center',
  },
  retryBtnText: { fontSize: 15, fontWeight: '700', color: tk.textOnBrand },

  scrollContent: { padding: 16, gap: 12, paddingBottom: 32 },

  planCard: {
    backgroundColor: tk.raised, borderRadius: 16, padding: 16, gap: 10,
    borderWidth: 1, borderColor: tk.border,
  },
  planCardLabel: { fontSize: 12, fontWeight: '600', color: tk.textSecondary, textTransform: 'uppercase', letterSpacing: 0.4 },
  planNameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  planName: { fontSize: 20, fontWeight: '800', color: tk.textPrimary, flex: 1 },
  statusPill: { backgroundColor: tk.successTint, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  statusPillText: { fontSize: 12, fontWeight: '700', color: tk.successFg },
  planRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  planRowLabel: { fontSize: 14, color: tk.textSecondary, flex: 1, paddingRight: 8 },
  planRowValue: { fontSize: 14, fontWeight: '600', color: tk.textPrimary, textAlign: 'right' },
  noPlanTitle: { fontSize: 16, fontWeight: '700', color: tk.textPrimary },
  noPlanBody: { fontSize: 13, color: tk.textSecondary, lineHeight: 20 },

  sectionTitle: { fontSize: 15, fontWeight: '700', color: tk.textPrimary, marginTop: 8 },
  emptyText: { fontSize: 13, color: tk.textSecondary },

  inlineError: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  inlineErrorText: { fontSize: 13, color: tk.errorFg, flex: 1 },
  inlineRetry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  inlineRetryText: { fontSize: 13, fontWeight: '700', color: tk.brandCta },

  invoiceRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: tk.raised, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: tk.border, minHeight: 64,
  },
  invoiceNumber: { fontSize: 14, fontWeight: '700', color: tk.textPrimary },
  invoicePeriod: { fontSize: 12, color: tk.textSecondary, marginTop: 2 },
  invoicePaid: { fontSize: 12, color: tk.successFg, marginTop: 2 },
  invoiceAmountCol: { alignItems: 'flex-end', gap: 2 },
  invoiceTotal: { fontSize: 14, fontWeight: '800', color: tk.textPrimary },
  invoiceStatus: { fontSize: 12, color: tk.textSecondary },
  }),
);
