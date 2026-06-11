/**
 * LoanStatusScreen — Live loan application tracker.
 * Phase 6C — docs/design/mobile/loans/loan-status-screen.md
 *
 * Shows: status stepper (8 states), ETA countdown, bank comm log, doc requests,
 * celebration overlays on APPROVED + DISBURSED transitions.
 *
 * Security: useSensitiveScreen — shows offer amounts, bank account details
 * Deep-link target: FCM payload data.type = 'loan_status_change', data.appId
 *
 * Polling: useQuery with refetchInterval (real-time SignalR wiring is Phase 6F)
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  RefreshControl,
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
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { ListSkeleton, ErrorState } from '../../components/shared/ListStates';
import { useSensitiveScreen } from '../../hooks/usePreventScreenCapture';
import { useNowMs } from '../../hooks/useNowMs';
import { getLoanApplication, type LoanApplicationStatus } from '../../api/loans';
import { ETACountdownCard } from '../../components/loans/ETACountdownCard';
import {
  CelebrationOverlay,
  type CelebrationKind,
} from '../../components/loans/CelebrationOverlay';
import type { LoanStackParamList } from '../../navigation/LoanStack';

type NavProp = NativeStackNavigationProp<LoanStackParamList, 'LoanStatus'>;
type RoutePropType = RouteProp<LoanStackParamList, 'LoanStatus'>;
interface Props { navigation: NavProp; route: RoutePropType }

// Status stepper definition — 8 canonical states
const STEPPER_NODES: { status: LoanApplicationStatus; labelKey: string }[] = [
  { status: 'DRAFT', labelKey: 'mobile.loan.status.stepper.draft' },
  { status: 'SUBMITTED', labelKey: 'mobile.loan.status.stepper.submitted' },
  { status: 'UNDER_REVIEW', labelKey: 'mobile.loan.status.stepper.underReview' },
  { status: 'APPROVED', labelKey: 'mobile.loan.status.stepper.approvedRejected' },
  { status: 'DISBURSED', labelKey: 'mobile.loan.status.stepper.disbursed' },
];

const STATUS_ORDER: LoanApplicationStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'DOCS_REQUESTED',
  'APPROVED',
  'REJECTED',
  'DISBURSED',
  'CLOSED',
];

function statusIndex(s: LoanApplicationStatus): number {
  return STATUS_ORDER.indexOf(s);
}

function statusVariant(
  s: LoanApplicationStatus,
  tk: ThemeTokens,
): { color: string; icon: React.ComponentProps<typeof Ionicons>['name'] } {
  switch (s) {
    case 'APPROVED': case 'DISBURSED': return { color: tk.successFg, icon: 'checkmark-circle' };
    case 'REJECTED': return { color: tk.errorFg, icon: 'close-circle' };
    case 'DOCS_REQUESTED': return { color: tk.warningFg, icon: 'alert-circle' };
    case 'UNDER_REVIEW': return { color: tk.infoFg, icon: 'search' };
    case 'SUBMITTED': return { color: tk.infoFg, icon: 'send' };
    case 'CLOSED': return { color: tk.textSecondary, icon: 'archive' };
    default: return { color: tk.textTertiary, icon: 'create-outline' };
  }
}

function badgeKey(s: LoanApplicationStatus): string {
  switch (s) {
    case 'DRAFT': return 'mobile.loan.status.badge.draft';
    case 'SUBMITTED': return 'mobile.loan.status.badge.submitted';
    case 'UNDER_REVIEW': return 'mobile.loan.status.badge.underReview';
    case 'DOCS_REQUESTED': return 'mobile.loan.status.badge.docsRequested';
    case 'APPROVED': return 'mobile.loan.status.badge.approved';
    case 'REJECTED': return 'mobile.loan.status.badge.rejected';
    case 'DISBURSED': return 'mobile.loan.status.badge.disbursed';
    case 'CLOSED': return 'mobile.loan.status.badge.closed';
  }
}

function formatIndianAmount(n: number): string {
  if (n >= 10_000_000) return `${(n / 10_000_000).toFixed(2)} Cr`;
  if (n >= 100_000) return `${(n / 100_000).toFixed(2)} L`;
  return n.toLocaleString('en-IN');
}

export function LoanStatusScreen({ navigation, route }: Props) {
  const { tokens } = useTheme();
  const styles = useStyles();
  useSensitiveScreen();
  const { t } = useTranslation();
  const { applicationId } = route.params;

  const [celebration, setCelebration] = useState<CelebrationKind | null>(null);
  const prevStatusRef = useRef<LoanApplicationStatus | null>(null);
  const nowMs = useNowMs();

  const { data: app, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['loan-application', applicationId],
    queryFn: () => getLoanApplication(applicationId),
    refetchInterval: 30_000, // Poll every 30s (SignalR real-time in Phase 6F)
  });

  // Trigger celebration on status transition
  useEffect(() => {
    if (!app) return;
    const prev = prevStatusRef.current;
    if (
      prev &&
      prev !== app.status &&
      (app.status === 'APPROVED' || app.status === 'DISBURSED')
    ) {
      setCelebration(app.status);
    }
    prevStatusRef.current = app.status ?? null;
  }, [app]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        {/* §3.1: shaped skeleton — status hero + stepper + comms silhouettes */}
        <View style={styles.skeletonWrap}>
          <ListSkeleton variant="card" count={3} cardHeight={140} testID="loan-status-skeleton" />
        </View>
      </SafeAreaView>
    );
  }

  if (isError || !app) {
    return (
      <SafeAreaView style={styles.container}>
        <ErrorState
          message={t('mobile.loan.status.error')}
          retryLabel={t('mobile.common.retry')}
          onRetry={() => void refetch()}
          secondaryLabel={t('mobile.common.goBack')}
          onSecondaryPress={() => navigation.goBack()}
          testID="loan-status-error-state"
        />
      </SafeAreaView>
    );
  }

  const currentStatusIdx = statusIndex(app.status);
  const variant = statusVariant(app.status, tokens);

  // ETA: assume submitted 2 days ago for demo; Phase 6F wires real submittedAt
  const submittedDaysAgo = app.submittedAt
    ? Math.floor((nowMs - new Date(app.submittedAt).getTime()) / 86_400_000)
    : 2;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={8}
          accessibilityLabel={t('mobile.common.back')}
        >
          <Ionicons name="arrow-back" size={22} color={tokens.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('mobile.loan.status.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => void refetch()}
            tintColor={tokens.loanAccent}
          />
        }
      >
        {/* Hero card */}
        <View style={styles.heroCard}>
          <Text style={styles.heroBankProduct}>
            {app.bankName ? `${app.bankName} · ${app.productName ?? ''}` : app.productName ?? ''}
          </Text>
          <Text style={styles.heroAmountLine}>
            {t('mobile.loan.status.hero.amountTenurePurpose', {
              amount: formatIndianAmount(app.requestedAmount),
              tenure: app.tenureMonths,
              purpose: app.purpose?.replace('_', ' ') ?? '',
            })}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: variant.color + '18' }]}>
            <Ionicons name={variant.icon} size={14} color={variant.color} />
            <Text style={[styles.statusBadgeText, { color: variant.color }]}>
              {t(badgeKey(app.status))}
            </Text>
          </View>
          {app.submittedAt && (
            <Text style={styles.heroMeta}>
              {t('mobile.loan.status.hero.submittedAt', {
                date: new Date(app.submittedAt).toLocaleDateString('en-IN'),
              })}
              {app.bankReferenceNo
                ? '  ·  ' + t('mobile.loan.status.hero.bankRef', { ref: app.bankReferenceNo })
                : ''}
            </Text>
          )}
        </View>

        {/* Status stepper */}
        <View style={styles.stepperCard}>
          {STEPPER_NODES.map((node, idx) => {
            const nodeIdx = statusIndex(node.status);
            const isCompleted = currentStatusIdx > nodeIdx;
            const isCurrent = node.status === app.status ||
              (app.status === 'DOCS_REQUESTED' && node.status === 'UNDER_REVIEW') ||
              (app.status === 'REJECTED' && node.status === 'APPROVED');
            const isPending = !isCompleted && !isCurrent;

            return (
              <View key={node.status} style={styles.stepperRow}>
                <View style={styles.stepperLeft}>
                  <View
                    style={[
                      styles.stepperDot,
                      isCompleted && styles.stepperDotCompleted,
                      isCurrent && styles.stepperDotCurrent,
                      isPending && styles.stepperDotPending,
                    ]}
                    accessibilityRole="text"
                    accessibilityState={{ busy: isCurrent }}
                  >
                    {isCompleted ? (
                      <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                    ) : isCurrent ? (
                      <View style={styles.stepperPulse} />
                    ) : (
                      <View style={styles.stepperEmpty} />
                    )}
                  </View>
                  {idx < STEPPER_NODES.length - 1 && (
                    <View
                      style={[
                        styles.stepperLine,
                        isCompleted && styles.stepperLineCompleted,
                      ]}
                    />
                  )}
                </View>
                <View style={styles.stepperLabelWrap}>
                  <Text
                    style={[
                      styles.stepperLabel,
                      isCompleted && styles.stepperLabelCompleted,
                      isCurrent && styles.stepperLabelCurrent,
                    ]}
                  >
                    {t(node.labelKey)}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* ETA countdown */}
        {(app.status === 'SUBMITTED' || app.status === 'UNDER_REVIEW') && (
          <ETACountdownCard
            totalDays={7}
            elapsedDays={submittedDaysAgo}
            testID="eta-countdown"
          />
        )}

        {/* Rejected banner */}
        {app.status === 'REJECTED' && (
          <View style={styles.rejectedBanner}>
            <Ionicons name="close-circle" size={20} color={tokens.errorFg} />
            <View style={styles.rejectedInfo}>
              <Text style={styles.rejectedTitle}>
                {t('mobile.loan.status.rejected.banner.title')}
              </Text>
              {app.rejectionReason && (
                <Text style={styles.rejectedReason}>
                  {t('mobile.loan.status.rejected.banner.reasons', {
                    reasons: app.rejectionReason,
                  })}
                </Text>
              )}
            </View>
          </View>
        )}

        {/* Bank communication log — placeholder */}
        <View style={styles.commSection}>
          <Text style={styles.commTitle}>{t('mobile.loan.status.comms.title')}</Text>
          <Text style={styles.commEmpty}>{t('mobile.loan.status.comms.empty')}</Text>
        </View>

        {/* Actions */}
        <View style={styles.actionsRow}>
          <Pressable
            style={styles.actionBtn}
            onPress={() =>
              navigation.navigate('LoanPackagePreview', { applicationId })
            }
            accessibilityRole="button"
          >
            <Ionicons name="document-text-outline" size={18} color={tokens.brand500} />
            <Text style={styles.actionBtnText}>
              {t('mobile.loan.status.action.viewPackage')}
            </Text>
          </Pressable>
          {app.status === 'REJECTED' && (
            <Pressable
              style={styles.actionBtn}
              onPress={() => navigation.navigate('LoanHub')}
              accessibilityRole="button"
            >
              <Ionicons name="business-outline" size={18} color={tokens.brand500} />
              <Text style={styles.actionBtnText}>
                {t('mobile.loan.status.action.viewOtherBanks')}
              </Text>
            </Pressable>
          )}
        </View>
      </ScrollView>

      {/* Celebration overlay */}
      {celebration && (
        <CelebrationOverlay
          kind={celebration}
          bankName={app.bankName ?? ''}
          amount={app.requestedAmount}
          date={new Date().toLocaleDateString('en-IN')}
          onPrimary={() => setCelebration(null)}
          onSecondary={() => setCelebration(null)}
          testID="celebration-overlay"
        />
      )}
    </SafeAreaView>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: tk.canvas },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  loadingText: { fontSize: 14, color: tk.textSecondary },
  errorText: { fontSize: 14, color: tk.textSecondary, textAlign: 'center' },
  skeletonWrap: { padding: 16 },
  retryBtn: { backgroundColor: tk.loanAccent, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  retryText: { fontSize: 14, fontWeight: '700', color: tk.textOnBrand },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: tk.raised, borderBottomWidth: 1, borderBottomColor: tk.border,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: tk.sunken, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: tk.textPrimary },

  scrollContent: { padding: 16, gap: 14, paddingBottom: 32 },

  // Hero
  heroCard: {
    backgroundColor: tk.raised, borderRadius: 16, padding: 18, gap: 8,
    shadowColor: tk.shadowColor, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  heroBankProduct: { fontSize: 13, fontWeight: '600', color: tk.textSecondary },
  heroAmountLine: { fontSize: 16, fontWeight: '700', color: tk.textPrimary },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
  },
  statusBadgeText: { fontSize: 12, fontWeight: '700' },
  heroMeta: { fontSize: 12, color: tk.textTertiary, fontWeight: '500' },

  // Stepper
  stepperCard: { backgroundColor: tk.raised, borderRadius: 14, padding: 16, gap: 0 },
  stepperRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  stepperLeft: { alignItems: 'center', width: 24 },
  stepperDot: {
    width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
  },
  stepperDotCompleted: { backgroundColor: tk.brand500 },
  stepperDotCurrent: { backgroundColor: tk.loanAccent },
  stepperDotPending: { backgroundColor: tk.sunken, borderWidth: 2, borderColor: tk.border },
  stepperPulse: { width: 10, height: 10, borderRadius: 5, backgroundColor: tk.textOnBrand },
  stepperEmpty: { width: 8, height: 8, borderRadius: 4, backgroundColor: tk.border },
  stepperLine: { width: 2, height: 28, backgroundColor: tk.border, marginTop: 2 },
  stepperLineCompleted: { backgroundColor: tk.brand500 },
  stepperLabelWrap: { flex: 1, paddingBottom: 16 },
  stepperLabel: { fontSize: 14, fontWeight: '600', color: tk.textTertiary, paddingTop: 4 },
  stepperLabelCompleted: { color: tk.brand500 },
  stepperLabelCurrent: { color: tk.loanAccent, fontWeight: '700' },

  // Rejected
  rejectedBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: tk.errorTint, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: tk.errorTintBorder,
  },
  rejectedInfo: { flex: 1, gap: 4 },
  rejectedTitle: { fontSize: 14, fontWeight: '700', color: tk.errorFg },
  rejectedReason: { fontSize: 13, color: tk.errorFg, lineHeight: 18 },

  // Comms
  commSection: { backgroundColor: tk.raised, borderRadius: 14, padding: 16, gap: 10 },
  commTitle: { fontSize: 15, fontWeight: '700', color: tk.textPrimary },
  commEmpty: { fontSize: 13, color: tk.textTertiary },

  // Actions
  actionsRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: tk.raised, borderRadius: 12, paddingHorizontal: 14,
    paddingVertical: 12, minHeight: 48,
    shadowColor: tk.shadowColor, shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  actionBtnText: { fontSize: 13, fontWeight: '600', color: tk.textSecondary },
  }),
);
