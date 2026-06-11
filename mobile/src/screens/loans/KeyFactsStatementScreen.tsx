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

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  AccessibilityInfo,
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

import {
  createThemedStyles,
  useTheme,
  type ThemeTokens,
} from '../../contexts/ThemeContext';
import { getKfs, generateKfs } from '../../api/loans';
import type { KfsParsed, KfsInstalment, KfsFee } from '../../api/loans';
import { normalizeLocale } from '../../i18n/locale';
import { ScrollHintBanner } from '../../components/loans/ScrollHintBanner';
import { useSensitiveScreen } from '../../hooks/usePreventScreenCapture';
import { useScreenReaderEnabled } from '../../hooks/useScreenReaderEnabled';
import { logger } from '../../lib/logger';
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
  const { t, i18n } = useTranslation();
  const { tokens } = useTheme();
  const styles = useStyles();
  const { applicationId } = route.params;

  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [checked, setChecked] = useState(false);
  const [scheduleExpanded, setScheduleExpanded] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // A11Y KFS-1 (Blocker): screen-reader users traverse element-by-element and
  // may never fire a visual onScroll to the bottom, leaving the legally
  // required acknowledgement permanently locked. When a reader is active we
  // additionally render an explicit "I have reviewed" affordance at the end
  // of the document that satisfies the same gate. The visual scroll-gate and
  // the ack record that gets written are unchanged.
  const screenReaderEnabled = useScreenReaderEnabled();

  const satisfyGateViaReader = useCallback(() => {
    setHasScrolledToBottom((already) => {
      if (!already) {
        void Haptics.selectionAsync();
        AccessibilityInfo.announceForAccessibility(t('mobile.a11y.gateUnlocked'));
      }
      return true;
    });
  }, [t]);

  // NEW-D10: statutory KFS must be requested in the language the user is
  // reading the app in (server resolution: param → user pref → org default → en).
  const activeLocale = normalizeLocale(i18n.language);

  // Fetch KFS
  const {
    data: kfs,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useQuery<KfsParsed | null>({
    queryKey: ['kfs', applicationId, activeLocale],
    queryFn: () => getKfs(applicationId, activeLocale),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  // NEW-W2-005: surface fetch failures through structured logging.
  useEffect(() => {
    if (error) logger.error('kfs', 'getKfs failed', { applicationId, err: error });
  }, [error, applicationId]);

  // Generate KFS (used when 404 — no KFS yet)
  const generateMutation = useMutation({
    mutationFn: () => generateKfs(applicationId, activeLocale),
    onSuccess: () => { void refetch(); },
    onError: (err: unknown) => {
      // NEW-W2-005: structured logging instead of bare console.warn.
      logger.error('kfs', 'generateKfs failed', { applicationId, err });
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
          <ActivityIndicator size="large" color={tokens.brand500} />
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
          <Ionicons name="wifi-outline" size={48} color={tokens.textTertiary} />
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
          <ActivityIndicator size="large" color={tokens.brand500} />
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
          <Ionicons name="shield-checkmark-outline" size={48} color={tokens.errorFg} />
          <Text style={[styles.errorTitle, { color: tokens.errorFg }]}>
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
          <Ionicons name="warning-outline" size={48} color={tokens.warningFg} />
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
        <Ionicons name="lock-closed" size={14} color={tokens.brandFg} />
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
            color={tokens.brandFg}
          />
        </Pressable>
        {scheduleExpanded && (
          <ScheduleTable schedule={kfs.repaymentSchedule} t={t} />
        )}

        {/* Cooling-off notice */}
        <View style={styles.coolingCard}>
          <View style={styles.coolingHeader}>
            <Ionicons name="time-outline" size={18} color={tokens.warningFg} />
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
                <Ionicons name="call-outline" size={16} color={tokens.brandFg} />
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
                <Ionicons name="mail-outline" size={16} color={tokens.brandFg} />
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

        {/* A11Y KFS-1: explicit reviewed-all affordance for screen-reader users.
            Last element of the document body — reaching and activating it
            satisfies the same scroll-gate sighted users pass visually. */}
        {screenReaderEnabled && !hasScrolledToBottom && (
          <Pressable
            style={styles.srGateBtn}
            onPress={satisfyGateViaReader}
            accessibilityRole="button"
            accessibilityLabel={t('mobile.a11y.reviewedAll')}
            accessibilityHint={t('mobile.a11y.reviewedAllHint')}
            testID="kfs-sr-reviewed-all"
          >
            <Ionicons name="checkmark-done-outline" size={18} color={tokens.brandFg} />
            <Text style={styles.srGateBtnText}>{t('mobile.a11y.reviewedAll')}</Text>
          </Pressable>
        )}

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
            {checked && <Ionicons name="checkmark" size={14} color={tokens.textOnBrand} />}
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
            <Ionicons name="download-outline" size={16} color={tokens.brandFg} />
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
              color={canContinue ? tokens.textOnBrand : tokens.textDisabled}
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
  const { tokens } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.header}>
      <Pressable
        style={styles.backBtn}
        onPress={() => navigation.goBack()}
        accessibilityLabel={t('mobile.common.back')}
        hitSlop={8}
      >
        <Ionicons name="arrow-back" size={22} color={tokens.textPrimary} />
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
          <Ionicons name="lock-closed" size={12} color={tokens.successFg} />
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
  const styles = useStyles();
  return (
    <View style={styles.snapshotRow} accessibilityRole="text">
      <Text style={styles.snapshotLabel}>{label}</Text>
      <Text style={[styles.snapshotValue, bold && styles.snapshotValueBold]}>{value}</Text>
    </View>
  );
}

function FeeRow({ fee }: { fee: KfsFee }) {
  const styles = useStyles();
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
  const styles = useStyles();
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
    // P6-QA-MOBILE-09: 44×44pt minimum touch target (was 40×40).
    backBtn: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: tk.sunken,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: { fontSize: 17, fontWeight: '700', color: tk.textPrimary },
    verifiedChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: tk.successTint,
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 6,
      minHeight: 44,
    },
    verifiedChipText: { fontSize: 12, fontWeight: '700', color: tk.successFg },

    trustBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: tk.brandTint,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: tk.brandTintBorder,
    },
    trustBannerText: { fontSize: 12, color: tk.brandFg, flex: 1, fontWeight: '500' },

    scroll: { flex: 1 },
    scrollContent: { padding: 16, gap: 16 },

    loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
    loadingText: { fontSize: 14, color: tk.textSecondary, textAlign: 'center' },

    errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
    errorTitle: { fontSize: 16, fontWeight: '700', color: tk.textPrimary, textAlign: 'center' },
    errorBody: { fontSize: 14, color: tk.textSecondary, textAlign: 'center', lineHeight: 22 },
    retryBtn: {
      backgroundColor: tk.brandCta,
      borderRadius: 12,
      paddingHorizontal: 24,
      paddingVertical: 12,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    retryBtnText: { fontSize: 15, fontWeight: '700', color: tk.textOnBrand },
    preparingTitle: { fontSize: 16, fontWeight: '700', color: tk.textPrimary, textAlign: 'center' },
    preparingBody: { fontSize: 14, color: tk.textSecondary, textAlign: 'center' },

    // Regulated tint card: brandTint + brandFg pair is contrast-gated in both
    // modes (design-elevation-spec §2.3); APR numeral uses display.hero (36/40/800).
    aprHero: {
      backgroundColor: tk.brandTint,
      borderRadius: 16,
      padding: 20,
      borderWidth: 1,
      borderColor: tk.brandTintBorder,
      gap: 6,
    },
    aprLabel: { fontSize: 13, fontWeight: '600', color: tk.brandFg, letterSpacing: 0.3, textTransform: 'uppercase' },
    aprValue: { fontSize: 36, lineHeight: 40, fontWeight: '800', color: tk.brandFg, letterSpacing: -1 },
    aprSuffix: { fontSize: 18, fontWeight: '600', color: tk.brandFg },
    aprCaption: { fontSize: 13, color: tk.brandFg, lineHeight: 20 },

    section: {
      backgroundColor: tk.raised,
      borderRadius: 16,
      padding: 16,
      gap: 12,
      ...tk.elevation1,
    },
    sectionTitle: { fontSize: 15, fontWeight: '700', color: tk.textPrimary, marginBottom: 4 },

    snapshotRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    snapshotLabel: { fontSize: 14, color: tk.textSecondary, flex: 1, flexWrap: 'wrap', paddingRight: 8 },
    snapshotValue: { fontSize: 14, fontWeight: '600', color: tk.textPrimary, textAlign: 'right' },
    snapshotValueBold: { fontWeight: '800', fontSize: 15 },

    feeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    feeNameRow: { flex: 1, paddingRight: 8 },
    feeName: { fontSize: 14, color: tk.textSecondary },
    feeAmount: { fontSize: 14, fontWeight: '600', color: tk.textPrimary },
    feeTotalRow: { borderTopWidth: 1, borderTopColor: tk.border, paddingTop: 10, marginTop: 4 },
    feeTotalLabel: { fontSize: 14, fontWeight: '700', color: tk.textPrimary, flex: 1 },
    feeTotalValue: { fontSize: 14, fontWeight: '800', color: tk.textPrimary },

    netCard: {
      backgroundColor: tk.successTint,
      borderRadius: 16,
      padding: 20,
      gap: 6,
      borderWidth: 1,
      borderColor: tk.successTintBorder,
    },
    netLabel: { fontSize: 13, fontWeight: '600', color: tk.successFg, textTransform: 'uppercase', letterSpacing: 0.3 },
    netAmount: { fontSize: 28, lineHeight: 34, fontWeight: '800', color: tk.successFg },
    netDerivation: { fontSize: 12, color: tk.successFg },

    accordionToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: tk.raised,
      borderRadius: 12,
      padding: 16,
      minHeight: 48,
      borderWidth: 1,
      borderColor: tk.border,
    },
    accordionLabel: { fontSize: 14, fontWeight: '600', color: tk.brandFg, flex: 1 },

    scheduleTable: { backgroundColor: tk.raised, borderRadius: 12, overflow: 'hidden' },
    scheduleHeader: { backgroundColor: tk.sunken },
    scheduleRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: tk.border },
    scheduleHeaderCell: { fontWeight: '700', color: tk.textSecondary },
    scheduleCell: { fontSize: 11, color: tk.textPrimary, paddingVertical: 8, paddingHorizontal: 4 },
    scheduleCellNo: { width: 28, textAlign: 'center' },
    scheduleCellDate: { flex: 1.8, textAlign: 'center' },
    scheduleCellAmt: { flex: 1.3, textAlign: 'right' },

    coolingCard: {
      backgroundColor: tk.warningTint,
      borderRadius: 16,
      padding: 16,
      gap: 8,
      borderWidth: 1,
      borderColor: tk.warningTintBorder,
    },
    coolingHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    coolingTitle: { fontSize: 14, fontWeight: '700', color: tk.warningFg, flex: 1, flexWrap: 'wrap' },
    coolingBody: { fontSize: 13, color: tk.warningFg, lineHeight: 20 },

    grievanceCard: {
      backgroundColor: tk.raised,
      borderRadius: 16,
      padding: 16,
      gap: 8,
      borderWidth: 1,
      borderColor: tk.border,
    },
    grievanceTitle: { fontSize: 15, fontWeight: '700', color: tk.textPrimary },
    grievanceContact: { fontSize: 13, color: tk.textSecondary, lineHeight: 20 },
    grievanceActions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    contactBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: tk.brandTint,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      minHeight: 44,
    },
    contactBtnText: { fontSize: 14, fontWeight: '600', color: tk.brandFg },
    grievanceEscalation: { fontSize: 12, color: tk.textSecondary, lineHeight: 18 },

    metaFooter: { gap: 4, paddingTop: 4 },
    // KFS-6 (a11y): provenance text is legally relevant — textSecondary keeps ≥4.5:1.
    metaText: { fontSize: 11, color: tk.textSecondary, lineHeight: 18 },

    // A11Y KFS-1: screen-reader review affordance (≥44pt target).
    srGateBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      minHeight: 48,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: tk.brand400,
      backgroundColor: tk.brandTint,
      paddingHorizontal: 16,
    },
    srGateBtnText: { fontSize: 14, fontWeight: '700', color: tk.brandFg },

    footer: {
      backgroundColor: tk.raised,
      paddingHorizontal: 16,
      paddingVertical: 12,
      paddingBottom: 20,
      gap: 12,
      borderTopWidth: 1,
      borderTopColor: tk.border,
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
      borderColor: tk.brand500,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    checkboxChecked: { backgroundColor: tk.brandCta, borderColor: tk.brandCta },
    checkboxDisabled: { borderColor: tk.border, backgroundColor: tk.sunken },
    checkboxLabel: { flex: 1, fontSize: 14, color: tk.textPrimary, lineHeight: 21 },
    checkboxLabelDisabled: { color: tk.textDisabled },

    footerCtas: { flexDirection: 'row', gap: 10 },
    downloadBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: tk.brand400,
      paddingVertical: 13,
      minHeight: 48,
    },
    downloadBtnText: { fontSize: 14, fontWeight: '600', color: tk.brandFg },
    continueBtn: {
      flex: 2,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      borderRadius: 14,
      backgroundColor: tk.brandCta,
      paddingVertical: 13,
      minHeight: 48,
    },
    continueBtnDisabled: { backgroundColor: tk.skeleton1 },
    continueBtnText: { fontSize: 15, fontWeight: '700', color: tk.textOnBrand },
    continueBtnTextDisabled: { color: tk.textDisabled },
  }),
);
