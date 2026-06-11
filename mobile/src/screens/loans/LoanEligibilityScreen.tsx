/**
 * LoanEligibilityScreen — Soft eligibility pre-check (no CIBIL pull).
 * Phase 6C — docs/design/mobile/loans/loan-eligibility-screen.md
 *
 * Step 1: amount slider + tenure stepper + purpose + soft-check consent
 * Step 2: score ring + qualify reasons + improve reasons + qualifying products
 *
 * Telemetry: loan.eligibility.started, loan.eligibility.computed, loan.eligibility.bankSelected
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { useSensitiveScreen } from '../../hooks/usePreventScreenCapture';
import {
  checkLoanEligibility,
  type EligibilityResult,
  type LoanPurpose,
} from '../../api/loans';
import { LoanProductCard } from '../../components/loans/LoanProductCard';
import { ProgressRing } from '../../components/shared/ProgressRing';
import type { LoanStackParamList } from '../../navigation/LoanStack';

type NavProp = NativeStackNavigationProp<LoanStackParamList, 'LoanEligibility'>;
type RoutePropType = RouteProp<LoanStackParamList, 'LoanEligibility'>;
interface Props { navigation: NavProp; route: RoutePropType }

const PURPOSE_OPTIONS: { value: LoanPurpose; labelKey: string }[] = [
  { value: 'WORKING_CAPITAL', labelKey: 'mobile.loan.eligibility.purpose.workingCapital' },
  { value: 'EQUIPMENT', labelKey: 'mobile.loan.eligibility.purpose.equipment' },
  { value: 'INVENTORY', labelKey: 'mobile.loan.eligibility.purpose.inventory' },
  { value: 'EXPANSION', labelKey: 'mobile.loan.eligibility.purpose.expansion' },
  { value: 'OTHER', labelKey: 'mobile.loan.eligibility.purpose.other' },
];

const TENURE_OPTIONS = [12, 24, 36, 48, 60];
const MIN_AMOUNT = 100_000;   // ₹1L
const MAX_AMOUNT = 5_000_000; // ₹50L
const AMOUNT_STEP = 100_000;

function formatIndianAmount(n: number): string {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(1)}Cr`;
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(0)}L`;
  return `₹${n.toLocaleString('en-IN')}`;
}

function scoreHeadlineKey(score: number): string {
  if (score >= 80) return 'mobile.loan.eligibility.result.headline.strong';
  if (score >= 60) return 'mobile.loan.eligibility.result.headline.moderate';
  return 'mobile.loan.eligibility.result.headline.weak';
}

function scoreColor(score: number, tk: ThemeTokens): string {
  if (score >= 80) return tk.successFg;
  if (score >= 60) return tk.brand500;
  if (score >= 40) return tk.warningFg;
  return tk.errorFg;
}

export function LoanEligibilityScreen({ navigation }: Props) {
  const { tokens } = useTheme();
  const styles = useStyles();
  useSensitiveScreen();
  const { t } = useTranslation();

  // Step 1 state
  const [requestedAmount, setRequestedAmount] = useState(1_500_000);
  const [tenureMonths, setTenureMonths] = useState(24);
  const [purpose, setPurpose] = useState<LoanPurpose>('WORKING_CAPITAL');
  const [softCheckConsent, setSoftCheckConsent] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);

  // Step 2 state
  const [result, setResult] = useState<EligibilityResult | null>(null);

  const eligibilityMutation = useMutation({
    mutationFn: () =>
      checkLoanEligibility({
        requestedAmount,
        tenureMonths,
        purpose,
        softCheckConsent,
      }),
    onSuccess: (data) => {
      setResult(data);
    },
    onError: () => {
      Alert.alert(t('mobile.common.retry'), t('mobile.loan.eligibility.error'));
    },
  });

  const handleCheck = () => {
    if (!softCheckConsent) return;
    eligibilityMutation.mutate();
  };

  const handleApplyToProduct = (productId: string) => {
    navigation.navigate('LoanApplication', { productId, productName: '' });
  };

  // ── STEP 2 RESULT ──────────────────────────────────────────────────────────
  if (result) {
    const color = scoreColor(result.score, tokens);
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable
            style={styles.backBtn}
            onPress={() => setResult(null)}
            hitSlop={8}
            accessibilityLabel={t('mobile.common.back')}
          >
            <Ionicons name="arrow-back" size={22} color={tokens.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('mobile.loan.eligibility.title')}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Score card */}
          <View style={styles.scoreCard}>
            <ProgressRing
              progress={result.score / 100}
              size={100}
              strokeWidth={8}
              color={color}
              centerText={String(result.score)}
              label={`/ 100`}
            />
            <View style={styles.scoreTextWrap}>
              <Text style={styles.scoreHeadline}>
                {t(scoreHeadlineKey(result.score))}
              </Text>
              <Text style={styles.scoreSubline}>
                {t('mobile.loan.eligibility.result.subline', {
                  n: result.qualifiedCount,
                  m: result.totalBanks,
                })}
              </Text>
            </View>
          </View>

          {/* Qualify reasons */}
          {result.qualifyReasons.length > 0 && (
            <View style={styles.reasonSection}>
              <Text style={styles.reasonSectionTitle}>
                {t('mobile.loan.eligibility.reasons.qualify.title')}
              </Text>
              {result.qualifyReasons.map((r, i) => (
                <View key={i} style={styles.reasonRow} accessibilityRole="text">
                  <Ionicons name="checkmark-circle" size={16} color={tokens.successFg} />
                  <Text style={styles.reasonText}>{r}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Improve reasons */}
          {result.improveReasons.length > 0 && (
            <View style={styles.reasonSection}>
              <Text style={styles.reasonSectionTitle}>
                {t('mobile.loan.eligibility.reasons.improve.title')}
              </Text>
              {result.improveReasons.map((r, i) => (
                <View key={i} style={styles.reasonRow} accessibilityRole="text">
                  <Ionicons name="warning" size={16} color={tokens.warningFg} />
                  <Text style={styles.reasonText}>{r}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Qualified products */}
          {result.qualifiedProducts.length > 0 && (
            <View style={styles.productSection}>
              <Text style={styles.productSectionTitle}>
                {t('mobile.loan.eligibility.products.qualified.title')}
              </Text>
              {result.qualifiedProducts.map((p) => (
                <LoanProductCard
                  key={p.productId}
                  product={{
                    productId: p.productId,
                    bankId: p.bankId,
                    productName: p.productName,
                    minAmount: p.minAmount,
                    maxAmount: p.maxAmount,
                    tenureMonths: p.tenureMonths,
                    interestRate: p.interestRate,
                    isActive: true,
                  }}
                  bankName={p.bankName}
                  qualLevel="QUALIFIED"
                  hintText={p.reasons[0]}
                  onApply={() => handleApplyToProduct(p.productId)}
                />
              ))}
            </View>
          )}

          {/* Near-match products */}
          {result.nearMatchProducts.length > 0 && (
            <View style={styles.productSection}>
              <Text style={styles.productSectionTitle}>
                {t('mobile.loan.eligibility.products.nearMatch.title')}
              </Text>
              {result.nearMatchProducts.map((p) => (
                <LoanProductCard
                  key={p.productId}
                  product={{
                    productId: p.productId,
                    bankId: p.bankId,
                    productName: p.productName,
                    minAmount: p.minAmount,
                    maxAmount: p.maxAmount,
                    tenureMonths: p.tenureMonths,
                    interestRate: p.interestRate,
                    isActive: true,
                  }}
                  bankName={p.bankName}
                  qualLevel="NEAR_MATCH"
                  hintText={p.reasons[0]}
                  onApply={() => handleApplyToProduct(p.productId)}
                />
              ))}
            </View>
          )}

          {/* Empty */}
          {result.qualifiedProducts.length === 0 &&
            result.nearMatchProducts.length === 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="business-outline" size={36} color={tokens.textTertiary} />
                <Text style={styles.emptyTitle}>
                  {t('mobile.loan.eligibility.empty.headline')}
                </Text>
                <Text style={styles.emptyBody}>
                  {t('mobile.loan.eligibility.empty.body')}
                </Text>
              </View>
            )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── STEP 1 INPUT ───────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={8}
          accessibilityLabel={t('mobile.common.back')}
        >
          <Ionicons name="arrow-back" size={22} color={tokens.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('mobile.loan.eligibility.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.stepLabel}>{t('mobile.loan.eligibility.step1')}</Text>

        {/* Amount */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>{t('mobile.loan.eligibility.amount.label')}</Text>
          <Text style={styles.amountDisplay}>{formatIndianAmount(requestedAmount)}</Text>
          <View style={styles.amountStepRow}>
            <Pressable
              style={styles.stepBtn}
              onPress={() => setRequestedAmount((v) => Math.max(MIN_AMOUNT, v - AMOUNT_STEP))}
              accessibilityRole="button"
              accessibilityLabel="Decrease amount"
            >
              <Ionicons name="remove" size={20} color={tokens.textSecondary} />
            </Pressable>
            <View style={styles.amountTrack}>
              <View
                style={[
                  styles.amountFill,
                  {
                    width: `${((requestedAmount - MIN_AMOUNT) / (MAX_AMOUNT - MIN_AMOUNT)) * 100}%` as `${number}%`,
                  },
                ]}
              />
            </View>
            <Pressable
              style={styles.stepBtn}
              onPress={() => setRequestedAmount((v) => Math.min(MAX_AMOUNT, v + AMOUNT_STEP))}
              accessibilityRole="button"
              accessibilityLabel="Increase amount"
            >
              <Ionicons name="add" size={20} color={tokens.textSecondary} />
            </Pressable>
          </View>
          <View style={styles.amountRangeRow}>
            <Text style={styles.amountRangeText}>{t('mobile.loan.eligibility.amount.min')}</Text>
            <Text style={styles.amountRangeText}>{t('mobile.loan.eligibility.amount.max')}</Text>
          </View>
        </View>

        {/* Tenure */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>{t('mobile.loan.eligibility.tenure.label')}</Text>
          <View style={styles.tenureRow}>
            {TENURE_OPTIONS.map((mo) => (
              <Pressable
                key={mo}
                style={[styles.tenureChip, tenureMonths === mo && styles.tenureChipActive]}
                onPress={() => setTenureMonths(mo)}
                accessibilityRole="button"
                accessibilityState={{ selected: tenureMonths === mo }}
              >
                <Text
                  style={[styles.tenureChipText, tenureMonths === mo && styles.tenureChipTextActive]}
                >
                  {mo}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.tenureUnit}>
            {tenureMonths} {t('mobile.loan.eligibility.tenure.unit')}
          </Text>
        </View>

        {/* Purpose */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>{t('mobile.loan.eligibility.purpose.label')}</Text>
          <View style={styles.purposeGrid}>
            {PURPOSE_OPTIONS.map((opt) => (
              <Pressable
                key={opt.value}
                style={[styles.purposeChip, purpose === opt.value && styles.purposeChipActive]}
                onPress={() => setPurpose(opt.value)}
                accessibilityRole="button"
                accessibilityState={{ selected: purpose === opt.value }}
              >
                <Text
                  style={[
                    styles.purposeChipText,
                    purpose === opt.value && styles.purposeChipTextActive,
                  ]}
                >
                  {t(opt.labelKey)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Soft check consent */}
        <Pressable
          style={styles.consentRow}
          onPress={() => setSoftCheckConsent((v) => !v)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: softCheckConsent }}
        >
          <View style={[styles.checkbox, softCheckConsent && styles.checkboxChecked]}>
            {softCheckConsent && <Ionicons name="checkmark" size={14} color={tokens.textOnBrand} />}
          </View>
          <View style={styles.consentTextWrap}>
            <Text style={styles.consentText}>
              {t('mobile.loan.eligibility.consent.softCheck')}
            </Text>
            <Pressable
              onPress={() => setShowInfoModal(true)}
              hitSlop={8}
              accessibilityRole="link"
            >
              <Text style={styles.consentLink}>
                {t('mobile.loan.eligibility.consent.linkWhat')}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </ScrollView>

      {/* Sticky footer */}
      <View style={styles.stickyFooter}>
        <Pressable
          style={[
            styles.checkBtn,
            (!softCheckConsent || eligibilityMutation.isPending) && styles.checkBtnDisabled,
          ]}
          onPress={handleCheck}
          disabled={!softCheckConsent || eligibilityMutation.isPending}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.loan.eligibility.cta.check')}
        >
          {eligibilityMutation.isPending ? (
            <ActivityIndicator color={tokens.textOnBrand} />
          ) : (
            <>
              <Ionicons
                name="sparkles"
                size={18}
                color={softCheckConsent ? tokens.textOnBrand : tokens.textTertiary}
              />
              <Text style={[styles.checkBtnText, !softCheckConsent && styles.checkBtnTextDisabled]}>
                {t('mobile.loan.eligibility.cta.check')}
              </Text>
            </>
          )}
        </Pressable>
      </View>

      {/* Soft check info modal */}
      <Modal
        visible={showInfoModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowInfoModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>
              {t('mobile.loan.eligibility.consent.linkWhat')}
            </Text>
            <Text style={styles.modalBody}>
              {t('mobile.loan.eligibility.softCheckInfo')}
            </Text>
            <Pressable
              style={styles.modalCloseBtn}
              onPress={() => setShowInfoModal(false)}
              accessibilityRole="button"
            >
              <Text style={styles.modalCloseBtnText}>{t('mobile.common.ok')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: tk.sunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: tk.textPrimary },
  scrollContent: { padding: 20, gap: 20, paddingBottom: 24 },
  stepLabel: { fontSize: 13, fontWeight: '600', color: tk.textSecondary },
  fieldGroup: { gap: 10 },
  fieldLabel: { fontSize: 15, fontWeight: '700', color: tk.textPrimary },

  // Amount
  amountDisplay: {
    fontSize: 28,
    fontWeight: '800',
    color: tk.textPrimary,
    letterSpacing: -1,
  },
  amountStepRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: tk.sunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  amountTrack: {
    flex: 1,
    height: 8,
    backgroundColor: tk.sunken,
    borderRadius: 4,
    overflow: 'hidden',
  },
  amountFill: { height: 8, backgroundColor: tk.loanAccent, borderRadius: 4 },
  amountRangeRow: { flexDirection: 'row', justifyContent: 'space-between' },
  amountRangeText: { fontSize: 12, color: tk.textTertiary, fontWeight: '500' },

  // Tenure
  tenureRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  tenureChip: {
    width: 52,
    height: 44,
    borderRadius: 10,
    backgroundColor: tk.sunken,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  tenureChipActive: { backgroundColor: tk.loanAccent, borderColor: tk.loanAccent },
  tenureChipText: { fontSize: 14, fontWeight: '700', color: tk.textSecondary },
  tenureChipTextActive: { color: tk.textOnBrand },
  tenureUnit: { fontSize: 13, color: tk.textSecondary, fontWeight: '500' },

  // Purpose
  purposeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  purposeChip: {
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 22,
    backgroundColor: tk.sunken,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  purposeChipActive: { backgroundColor: tk.loanAccent + '18', borderColor: tk.loanAccent },
  purposeChipText: { fontSize: 13, fontWeight: '600', color: tk.textSecondary },
  purposeChipTextActive: { color: tk.loanAccent },

  // Consent
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: tk.canvas,
    borderRadius: 12,
    padding: 14,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: tk.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  checkboxChecked: { backgroundColor: tk.loanAccent, borderColor: tk.loanAccent },
  consentTextWrap: { flex: 1, gap: 4 },
  consentText: { fontSize: 13, color: tk.textSecondary, lineHeight: 19 },
  consentLink: {
    fontSize: 13,
    color: tk.brand500,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },

  // Sticky footer
  stickyFooter: {
    padding: 16,
    backgroundColor: tk.raised,
    borderTopWidth: 1,
    borderTopColor: tk.border,
  },
  checkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 56,
    borderRadius: 14,
    backgroundColor: tk.loanAccent,
  },
  checkBtnDisabled: { opacity: 0.4 },
  checkBtnText: { fontSize: 16, fontWeight: '700', color: tk.textOnBrand },
  checkBtnTextDisabled: { color: tk.textTertiary },

  // Result page
  scoreCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    backgroundColor: tk.raised,
    borderRadius: 16,
    padding: 20,
    shadowColor: tk.shadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  scoreTextWrap: { flex: 1, gap: 6 },
  scoreHeadline: { fontSize: 17, fontWeight: '800', color: tk.textPrimary, letterSpacing: -0.2 },
  scoreSubline: { fontSize: 13, color: tk.textSecondary, lineHeight: 18 },

  reasonSection: {
    backgroundColor: tk.raised,
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  reasonSectionTitle: { fontSize: 14, fontWeight: '700', color: tk.textPrimary },
  reasonRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  reasonText: { flex: 1, fontSize: 13, color: tk.textSecondary, lineHeight: 18 },

  productSection: { gap: 4 },
  productSectionTitle: { fontSize: 14, fontWeight: '700', color: tk.textSecondary, marginBottom: 4 },

  emptyState: { alignItems: 'center', padding: 32, gap: 12 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: tk.textSecondary },
  emptyBody: { fontSize: 14, color: tk.textSecondary, textAlign: 'center', lineHeight: 20 },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: tk.raised,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: tk.textPrimary },
  modalBody: { fontSize: 14, color: tk.textSecondary, lineHeight: 22 },
  modalCloseBtn: {
    backgroundColor: tk.loanAccent,
    borderRadius: 12,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseBtnText: { fontSize: 15, fontWeight: '700', color: tk.textOnBrand },
  }),
);
