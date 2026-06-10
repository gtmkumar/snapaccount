/**
 * KeyFactsStatementScreen — RBI-mandated Key Facts Statement (KFS)
 * Phase 7 Wave 2 | M3a (GAP-021)
 * spec: docs/design/mobile/loans/key-facts-statement-screen.md
 *
 * Positioned BEFORE LoanConsentScreen in the loan journey.
 * Borrower must scroll to bottom AND check the acknowledgement checkbox
 * before Continue enables. The kfsId is forwarded to LoanConsentScreen
 * so every consent record is tied to the acknowledged KFS.
 *
 * No biometric gate on this screen (it's a read-receipt, not authorization).
 * Biometric re-auth happens per-consent in LoanConsentScreen.
 */

import React, { useRef, useState, useCallback } from 'react';
import {
  Alert,
  FlatList,
  Linking,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

import { Colors } from '../../constants/colors';
import { getKfs, generateKfs } from '../../api/loans';
import type { KfsParsed, KfsInstalment, KfsFee } from '../../api/loans';
import { ScrollHintBanner } from '../../components/loans/ScrollHintBanner';
import { useSensitiveScreen } from '../../hooks/usePreventScreenCapture';
import type { LoanStackParamList } from '../../navigation/LoanStack';

type NavProp = NativeStackNavigationProp<LoanStackParamList, 'KeyFactsStatement'>;
type RoutePropType = RouteProp<LoanStackParamList, 'KeyFactsStatement'>;
interface Props { navigation: NavProp; route: RoutePropType }

/** Format decimal rupees as Indian currency string. */
function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Format a date string as DD MMM YYYY. */
function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch {
    return iso;
  }
}

/** Format a datetime string as "DD MMM YYYY, HH:MM IST". */
function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
    }) + ' IST';
  } catch {
    return iso;
  }
}

/** Extract a phone number from a grievance contact string (rough heuristic). */
function extractPhone(contact: string): string | null {
  const match = contact.match(/(\+91[\s-]?\d{10}|\d{10})/);
  return match ? match[0].replace(/\s/g, '') : null;
}

/** Extract an email from a grievance contact string. */
function extractEmail(contact: string): string | null {
  const match = contact.match(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
  return match ? match[0] : null;
}

export function KeyFactsStatementScreen({ navigation, route }: Props) {
  useSensitiveScreen();
  const { t } = useTranslation();
  const { applicationId } = route.params;

  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [checked, setChecked] = useState(false);
  const [scheduleExpanded, setScheduleExpanded] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Fetch KFS
  const {
    data: kfs,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useQuery<KfsParsed | null>({
    queryKey: ['kfs', applicationId],
    queryFn: () => getKfs(applicationId),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  // Generate KFS (used when 404 — no KFS yet)
  const generateMutation = useMutation({
    mutationFn: () => generateKfs(applicationId),
    onSuccess: () => { void refetch(); },
    onError: () => {
      Alert.alert(t('mobile.common.error'), t('mobile.kfs.error.offline'));
    },
  });

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const atBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 24;
    if (atBottom && !hasScrolledToBottom) {
      setHasScrolledToBottom(true);
      void Haptics.selectionAsync();
    }
  };

  const handleContinue = useCallback(() => {
    if (!kfs || !checked || !hasScrolledToBottom) return;
    navigation.navigate('LoanConsent', {
      applicationId,
      kfsId: kfs.kfsId,
      kfsVersion: 1,
    });
  }, [kfs, checked, hasScrolledToBottom, applicationId, navigation]);

  const canContinue = hasScrolledToBottom && checked && !!kfs && kfs.verified;

  // ── Loading state ─────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <KfsHeader navigation={navigation} verified={false} t={t} kfs={null} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.brand[600]} />
          <Text style={styles.loadingText}>{t('mobile.kfs.state.preparing.body')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (error && !kfs) {
    return (
      <SafeAreaView style={styles.container}>
        <KfsHeader navigation={navigation} verified={false} t={t} kfs={null} />
        <View style={styles.errorContainer}>
          <Ionicons name="wifi-outline" size={48} color={Colors.neutral[400]} />
          <Text style={styles.errorTitle}>{t('mobile.kfs.error.offline')}</Text>
          <Pressable style={styles.retryBtn} onPress={() => void refetch()}>
            <Text style={styles.retryBtnText}>{t('mobile.kfs.cta.retry')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ── 404 state — KFS not yet generated ─────────────────────────────────────
  if (!kfs) {
    return (
      <SafeAreaView style={styles.container}>
        <KfsHeader navigation={navigation} verified={false} t={t} kfs={null} />
        <View style={styles.errorContainer}>
          <ActivityIndicator size="large" color={Colors.brand[500]} />
          <Text style={styles.preparingTitle}>{t('mobile.kfs.state.preparing.title')}</Text>
          <Text style={styles.preparingBody}>{t('mobile.kfs.state.preparing.body')}</Text>
          <Pressable
            style={styles.retryBtn}
            onPress={() => generateMutation.mutate()}
            disabled={generateMutation.isPending || isRefetching}
          >
            <Text style={styles.retryBtnText}>{t('mobile.kfs.cta.retry')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ── Integrity error state ─────────────────────────────────────────────────
  if (!kfs.verified) {
    return (
      <SafeAreaView style={styles.container}>
        <KfsHeader navigation={navigation} verified={false} t={t} kfs={null} />
        <View style={styles.errorContainer}>
          <Ionicons name="shield-checkmark-outline" size={48} color={Colors.error[500]} />
          <Text style={[styles.errorTitle, { color: Colors.error[700] }]}>
            {t('mobile.kfs.error.integrity.title')}
          </Text>
          <Text style={styles.errorBody}>{t('mobile.kfs.error.integrity.body')}</Text>
          <Pressable style={styles.retryBtn} onPress={() => void refetch()}>
            <Text style={styles.retryBtnText}>{t('mobile.kfs.cta.retry')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ── Malformed payload check ───────────────────────────────────────────────
  if (!kfs.annualPercentageRate || !kfs.loanAmount || !kfs.monthlyEmi) {
    return (
      <SafeAreaView style={styles.container}>
        <KfsHeader navigation={navigation} verified={false} t={t} kfs={null} />
        <View style={styles.errorContainer}>
          <Ionicons name="warning-outline" size={48} color={Colors.warning[500]} />
          <Text style={styles.errorTitle}>{t('mobile.kfs.error.malformed')}</Text>
          <Pressable style={styles.retryBtn} onPress={() => void refetch()}>
            <Text style={styles.retryBtnText}>{t('mobile.kfs.cta.retry')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const grievancePhone = extractPhone(kfs.grievanceOfficerContact);
  const grievanceEmail = extractEmail(kfs.grievanceOfficerContact);

  const totalFees = kfs.fees.reduce((sum, f) => sum + f.amount, 0);
  const netDisbursal = kfs.loanAmount - totalFees;
  const totalInterest = kfs.monthlyEmi * kfs.tenureMonths - kfs.loanAmount;
  const totalPayable = kfs.loanAmount + totalInterest + totalFees;

  return (
    <SafeAreaView style={styles.container}>
      <KfsHeader navigation={navigation} verified={kfs.verified} t={t} kfs={kfs} />

      {/* Trust banner */}
      <View style={styles.trustBanner}>
        <Ionicons name="lock-closed" size={14} color={Colors.brand[700]} />
        <Text style={styles.trustBannerText}>{t('mobile.kfs.trust.banner')}</Text>
      </View>

      {/* Scrollable body */}
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator
      >
        {/* APR Hero */}
        <View style={styles.aprHero}>
          <Text style={styles.aprLabel} accessibilityRole="text">
            {t('mobile.kfs.apr.label')}
          </Text>
          <Text
            style={styles.aprValue}
            accessibilityLabel={t('mobile.kfs.apr.label') + ', ' + kfs.annualPercentageRate + '%, ' + t('mobile.kfs.apr.caption')}
            accessibilityRole="text"
          >
            {kfs.annualPercentageRate.toFixed(2)}%{' '}
            <Text style={styles.aprSuffix}>{t('mobile.kfs.apr.suffix')}</Text>
          </Text>
          <Text style={styles.aprCaption}>{t('mobile.kfs.apr.caption')}</Text>
        </View>

        {/* Snapshot grid */}
        <View style={styles.section}>
          <SnapshotRow label={t('mobile.kfs.snapshot.sanctioned')} value={formatINR(kfs.loanAmount)} />
          <SnapshotRow label={t('mobile.kfs.snapshot.tenure')} value={`${kfs.tenureMonths} months`} />
          <SnapshotRow label={t('mobile.kfs.snapshot.emi')} value={`${formatINR(kfs.monthlyEmi)} / month`} />
          <SnapshotRow label={t('mobile.kfs.snapshot.totalInterest')} value={formatINR(totalInterest)} />
          <SnapshotRow label={t('mobile.kfs.snapshot.totalFees')} value={formatINR(totalFees)} />
          <SnapshotRow label={t('mobile.kfs.snapshot.totalPayable')} value={formatINR(totalPayable)} bold />
        </View>

        {/* Fee itemization */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('mobile.kfs.fees.title')}</Text>
          {kfs.fees.map((fee, idx) => (
            <FeeRow key={idx} fee={fee} />
          ))}
          <View style={[styles.feeRow, styles.feeTotalRow]}>
            <Text style={styles.feeTotalLabel}>{t('mobile.kfs.fees.total')}</Text>
            <Text style={styles.feeTotalValue}>{formatINR(totalFees)}</Text>
          </View>
        </View>

        {/* Net disbursal */}
        <View style={styles.netCard}>
          <Text style={styles.netLabel}>{t('mobile.kfs.net.label')}</Text>
          <Text style={styles.netAmount} accessibilityRole="text">
            {formatINR(netDisbursal)}
          </Text>
          <Text style={styles.netDerivation}>
            = {formatINR(kfs.loanAmount)} − {formatINR(totalFees)} (deducted upfront)
          </Text>
        </View>

        {/* Repayment schedule accordion */}
        <Pressable
          style={styles.accordionToggle}
          onPress={() => setScheduleExpanded((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.kfs.schedule.toggle', { count: kfs.tenureMonths })}
          hitSlop={8}
        >
          <Text style={styles.accordionLabel}>
            {t('mobile.kfs.schedule.toggle', { count: kfs.tenureMonths })}
          </Text>
          <Ionicons
            name={scheduleExpanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={Colors.brand[600]}
          />
        </Pressable>
        {scheduleExpanded && (
          <ScheduleTable schedule={kfs.repaymentSchedule} t={t} />
        )}

        {/* Cooling-off notice */}
        <View style={styles.coolingCard}>
          <View style={styles.coolingHeader}>
            <Ionicons name="time-outline" size={18} color={Colors.warning[700]} />
            <Text style={styles.coolingTitle}>
              {t('mobile.kfs.coolingOff.title', { days: kfs.coolingOffDays })}
            </Text>
          </View>
          <Text style={styles.coolingBody}>
            {t('mobile.kfs.coolingOff.body', { days: kfs.coolingOffDays })}
          </Text>
        </View>

        {/* Grievance officer */}
        <View style={styles.grievanceCard}>
          <Text style={styles.grievanceTitle}>{t('mobile.kfs.grievance.title')}</Text>
          <Text style={styles.grievanceContact}>{kfs.grievanceOfficerContact}</Text>
          <View style={styles.grievanceActions}>
            {grievancePhone && (
              <Pressable
                style={styles.contactBtn}
                onPress={() => void Linking.openURL(`tel:${grievancePhone}`)}
                accessibilityRole="button"
                accessibilityLabel={t('mobile.kfs.grievance.call')}
                hitSlop={8}
              >
                <Ionicons name="call-outline" size={16} color={Colors.brand[700]} />
                <Text style={styles.contactBtnText}>{t('mobile.kfs.grievance.call')}</Text>
              </Pressable>
            )}
            {grievanceEmail && (
              <Pressable
                style={styles.contactBtn}
                onPress={() => void Linking.openURL(`mailto:${grievanceEmail}`)}
                accessibilityRole="button"
                accessibilityLabel={t('mobile.kfs.grievance.emailCta')}
                hitSlop={8}
              >
                <Ionicons name="mail-outline" size={16} color={Colors.brand[700]} />
                <Text style={styles.contactBtnText}>{t('mobile.kfs.grievance.emailCta')}</Text>
              </Pressable>
            )}
          </View>
          <Text style={styles.grievanceEscalation}>{t('mobile.kfs.grievance.escalation')}</Text>
        </View>

        {/* KFS meta footer */}
        <View style={styles.metaFooter}>
          <Text style={styles.metaText}>{t('mobile.kfs.meta.id', { id: kfs.kfsId })}</Text>
          <Text style={styles.metaText}>{t('mobile.kfs.meta.issued', { dateTime: formatDateTime(kfs.generatedAt) })}</Text>
          <Text style={styles.metaText}>{t('mobile.kfs.meta.signature', { last8: kfs.signatureLast8 })}</Text>
        </View>

        {/* Bottom padding */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Scroll hint */}
      <ScrollHintBanner visible={!hasScrolledToBottom} testID="kfs-scroll-hint" />

      {/* Acknowledgement footer */}
      <View style={styles.footer}>
        <Pressable
          style={styles.checkboxRow}
          onPress={() => {
            if (hasScrolledToBottom) setChecked((v) => !v);
          }}
          accessibilityRole="checkbox"
          accessibilityState={{ checked, disabled: !hasScrolledToBottom }}
          accessibilityLabel={t('mobile.kfs.ack.checkbox')}
        >
          <View style={[styles.checkbox, checked && styles.checkboxChecked, !hasScrolledToBottom && styles.checkboxDisabled]}>
            {checked && <Ionicons name="checkmark" size={14} color="#fff" />}
          </View>
          <Text style={[styles.checkboxLabel, !hasScrolledToBottom && styles.checkboxLabelDisabled]}>
            {t('mobile.kfs.ack.checkbox')}
          </Text>
        </Pressable>

        <View style={styles.footerCtas}>
          <Pressable
            style={styles.downloadBtn}
            onPress={() => Alert.alert(t('mobile.kfs.cta.downloadPdf'), t('mobile.kfs.error.download'))}
            accessibilityRole="button"
            accessibilityLabel={t('mobile.kfs.cta.downloadPdf')}
          >
            <Ionicons name="download-outline" size={16} color={Colors.brand[700]} />
            <Text style={styles.downloadBtnText}>{t('mobile.kfs.cta.downloadPdf')}</Text>
          </Pressable>

          <Pressable
            style={[styles.continueBtn, !canContinue && styles.continueBtnDisabled]}
            onPress={handleContinue}
            disabled={!canContinue}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canContinue }}
            accessibilityHint={!canContinue ? t('mobile.kfs.cta.disabledHint') : undefined}
            accessibilityLabel={t('mobile.kfs.cta.continue')}
          >
            <Text style={[styles.continueBtnText, !canContinue && styles.continueBtnTextDisabled]}>
              {t('mobile.kfs.cta.continue')}
            </Text>
            <Ionicons
              name="arrow-forward"
              size={16}
              color={canContinue ? '#fff' : Colors.neutral[400]}
            />
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KfsHeader({
  navigation,
  verified,
  t,
  kfs,
}: {
  navigation: NavProp;
  verified: boolean;
  t: (key: string) => string;
  kfs: KfsParsed | null;
}) {
  return (
    <View style={styles.header}>
      <Pressable
        style={styles.backBtn}
        onPress={() => navigation.goBack()}
        accessibilityLabel={t('mobile.common.back')}
        hitSlop={8}
      >
        <Ionicons name="arrow-back" size={22} color={Colors.neutral[800]} />
      </Pressable>
      <Text style={styles.headerTitle}>{t('mobile.kfs.title')}</Text>
      {verified && kfs ? (
        <Pressable
          style={styles.verifiedChip}
          onPress={() =>
            Alert.alert(
              t('mobile.kfs.trust.explainer.title'),
              `${t('mobile.kfs.trust.explainer.body')}\n\n${t('mobile.kfs.meta.issued').replace('{{dateTime}}', formatDateTime(kfs.generatedAt))}`,
            )
          }
          accessibilityRole="button"
          accessibilityLabel={t('mobile.kfs.verified.chip')}
        >
          <Ionicons name="lock-closed" size={12} color={Colors.success[700]} />
          <Text style={styles.verifiedChipText}>{t('mobile.kfs.verified.chip')}</Text>
        </Pressable>
      ) : (
        <View style={{ width: 72 }} />
      )}
    </View>
  );
}

function SnapshotRow({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <View style={styles.snapshotRow} accessibilityRole="text">
      <Text style={styles.snapshotLabel}>{label}</Text>
      <Text style={[styles.snapshotValue, bold && styles.snapshotValueBold]}>{value}</Text>
    </View>
  );
}

function FeeRow({ fee }: { fee: KfsFee }) {
  return (
    <View style={styles.feeRow} accessibilityRole="text">
      <View style={styles.feeNameRow}>
        <Text style={styles.feeName}>{fee.name}</Text>
      </View>
      <Text style={styles.feeAmount}>{formatINR(fee.amount)}</Text>
    </View>
  );
}

function ScheduleTable({
  schedule,
  t,
}: {
  schedule: KfsInstalment[];
  t: (k: string, opts?: Record<string, unknown>) => string;
}) {
  const renderItem = ({ item }: { item: KfsInstalment }) => (
    <View style={styles.scheduleRow} accessibilityRole="text">
      <Text style={[styles.scheduleCell, styles.scheduleCellNo]}>{item.emiNumber}</Text>
      <Text style={[styles.scheduleCell, styles.scheduleCellDate]}>
        {formatDate(item.dueDate)}
      </Text>
      <Text style={[styles.scheduleCell, styles.scheduleCellAmt]}>{formatINR(item.total)}</Text>
      <Text style={[styles.scheduleCell, styles.scheduleCellAmt]}>{formatINR(item.principal)}</Text>
      <Text style={[styles.scheduleCell, styles.scheduleCellAmt]}>{formatINR(item.interest)}</Text>
      <Text style={[styles.scheduleCell, styles.scheduleCellAmt]}>{formatINR(item.balance)}</Text>
    </View>
  );

  return (
    <View style={styles.scheduleTable}>
      <View style={[styles.scheduleRow, styles.scheduleHeader]}>
        <Text style={[styles.scheduleCell, styles.scheduleCellNo, styles.scheduleHeaderCell]}>
          {t('mobile.kfs.schedule.col.no')}
        </Text>
        <Text style={[styles.scheduleCell, styles.scheduleCellDate, styles.scheduleHeaderCell]}>
          {t('mobile.kfs.schedule.col.dueDate')}
        </Text>
        <Text style={[styles.scheduleCell, styles.scheduleCellAmt, styles.scheduleHeaderCell]}>
          {t('mobile.kfs.schedule.col.emi')}
        </Text>
        <Text style={[styles.scheduleCell, styles.scheduleCellAmt, styles.scheduleHeaderCell]}>
          {t('mobile.kfs.schedule.col.principal')}
        </Text>
        <Text style={[styles.scheduleCell, styles.scheduleCellAmt, styles.scheduleHeaderCell]}>
          {t('mobile.kfs.schedule.col.interest')}
        </Text>
        <Text style={[styles.scheduleCell, styles.scheduleCellAmt, styles.scheduleHeaderCell]}>
          {t('mobile.kfs.schedule.col.balance')}
        </Text>
      </View>
      <FlatList
        data={schedule}
        keyExtractor={(item) => String(item.emiNumber)}
        renderItem={renderItem}
        scrollEnabled={false}
        nestedScrollEnabled
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.base },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.surface.default,
    borderBottomWidth: 1,
    borderBottomColor: Colors.neutral[100],
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.neutral[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.neutral[900] },
  verifiedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.success[50],
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minHeight: 44,
  },
  verifiedChipText: { fontSize: 12, fontWeight: '700', color: Colors.success[700] },

  trustBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.brand[50],
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.brand[100],
  },
  trustBannerText: { fontSize: 12, color: Colors.brand[700], flex: 1, fontWeight: '500' },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 16 },

  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  loadingText: { fontSize: 14, color: Colors.neutral[600], textAlign: 'center' },

  errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  errorTitle: { fontSize: 16, fontWeight: '700', color: Colors.neutral[800], textAlign: 'center' },
  errorBody: { fontSize: 14, color: Colors.neutral[600], textAlign: 'center', lineHeight: 22 },
  retryBtn: {
    backgroundColor: Colors.brand[600],
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  preparingTitle: { fontSize: 16, fontWeight: '700', color: Colors.neutral[800], textAlign: 'center' },
  preparingBody: { fontSize: 14, color: Colors.neutral[600], textAlign: 'center' },

  aprHero: {
    backgroundColor: Colors.brand[50],
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.brand[100],
    gap: 6,
  },
  aprLabel: { fontSize: 13, fontWeight: '600', color: Colors.brand[700], letterSpacing: 0.3, textTransform: 'uppercase' },
  aprValue: { fontSize: 38, fontWeight: '800', color: Colors.brand[900], letterSpacing: -1 },
  aprSuffix: { fontSize: 18, fontWeight: '600', color: Colors.brand[700] },
  aprCaption: { fontSize: 13, color: Colors.brand[700], lineHeight: 20 },

  section: {
    backgroundColor: Colors.surface.default,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.neutral[900], marginBottom: 4 },

  snapshotRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  snapshotLabel: { fontSize: 14, color: Colors.neutral[600], flex: 1, flexWrap: 'wrap', paddingRight: 8 },
  snapshotValue: { fontSize: 14, fontWeight: '600', color: Colors.neutral[900], textAlign: 'right' },
  snapshotValueBold: { fontWeight: '800', fontSize: 15 },

  feeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  feeNameRow: { flex: 1, paddingRight: 8 },
  feeName: { fontSize: 14, color: Colors.neutral[700] },
  feeAmount: { fontSize: 14, fontWeight: '600', color: Colors.neutral[900] },
  feeTotalRow: { borderTopWidth: 1, borderTopColor: Colors.neutral[100], paddingTop: 10, marginTop: 4 },
  feeTotalLabel: { fontSize: 14, fontWeight: '700', color: Colors.neutral[900], flex: 1 },
  feeTotalValue: { fontSize: 14, fontWeight: '800', color: Colors.neutral[900] },

  netCard: {
    backgroundColor: Colors.success[50],
    borderRadius: 16,
    padding: 20,
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.success[100],
  },
  netLabel: { fontSize: 13, fontWeight: '600', color: Colors.success[700], textTransform: 'uppercase', letterSpacing: 0.3 },
  netAmount: { fontSize: 28, fontWeight: '800', color: Colors.success[700] },
  netDerivation: { fontSize: 12, color: Colors.success[700] },

  accordionToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface.default,
    borderRadius: 12,
    padding: 16,
    minHeight: 48,
    borderWidth: 1,
    borderColor: Colors.neutral[100],
  },
  accordionLabel: { fontSize: 14, fontWeight: '600', color: Colors.brand[700], flex: 1 },

  scheduleTable: { backgroundColor: Colors.surface.default, borderRadius: 12, overflow: 'hidden' },
  scheduleHeader: { backgroundColor: Colors.neutral[50] },
  scheduleRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.neutral[50] },
  scheduleHeaderCell: { fontWeight: '700', color: Colors.neutral[700] },
  scheduleCell: { fontSize: 11, color: Colors.neutral[800], paddingVertical: 8, paddingHorizontal: 4 },
  scheduleCellNo: { width: 28, textAlign: 'center' },
  scheduleCellDate: { flex: 1.8, textAlign: 'center' },
  scheduleCellAmt: { flex: 1.3, textAlign: 'right' },

  coolingCard: {
    backgroundColor: Colors.warning[50],
    borderRadius: 16,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.warning[200],
  },
  coolingHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  coolingTitle: { fontSize: 14, fontWeight: '700', color: Colors.warning[900], flex: 1, flexWrap: 'wrap' },
  coolingBody: { fontSize: 13, color: Colors.warning[800], lineHeight: 20 },

  grievanceCard: {
    backgroundColor: Colors.surface.default,
    borderRadius: 16,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.neutral[100],
  },
  grievanceTitle: { fontSize: 15, fontWeight: '700', color: Colors.neutral[900] },
  grievanceContact: { fontSize: 13, color: Colors.neutral[700], lineHeight: 20 },
  grievanceActions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  contactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.brand[50],
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 44,
  },
  contactBtnText: { fontSize: 14, fontWeight: '600', color: Colors.brand[700] },
  grievanceEscalation: { fontSize: 12, color: Colors.neutral[500], lineHeight: 18 },

  metaFooter: { gap: 4, paddingTop: 4 },
  metaText: { fontSize: 11, color: Colors.neutral[400], lineHeight: 18 },

  footer: {
    backgroundColor: Colors.surface.default,
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.neutral[100],
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    minHeight: 44,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.brand[500],
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxChecked: { backgroundColor: Colors.brand[600], borderColor: Colors.brand[600] },
  checkboxDisabled: { borderColor: Colors.neutral[300], backgroundColor: Colors.neutral[50] },
  checkboxLabel: { flex: 1, fontSize: 14, color: Colors.neutral[800], lineHeight: 21 },
  checkboxLabelDisabled: { color: Colors.neutral[400] },

  footerCtas: { flexDirection: 'row', gap: 10 },
  downloadBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.brand[300],
    paddingVertical: 13,
    minHeight: 48,
  },
  downloadBtnText: { fontSize: 14, fontWeight: '600', color: Colors.brand[700] },
  continueBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 14,
    backgroundColor: Colors.brand[600],
    paddingVertical: 13,
    minHeight: 48,
  },
  continueBtnDisabled: { backgroundColor: Colors.neutral[200] },
  continueBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  continueBtnTextDisabled: { color: Colors.neutral[400] },
});
