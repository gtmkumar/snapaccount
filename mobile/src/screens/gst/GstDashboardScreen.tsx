/**
 * GST Dashboard Screen — Redesign 2026
 * Premium GST dashboard with better visual hierarchy
 */

import React from 'react';
import {
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { StatusBadge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { AmountDisplay } from '../../components/ui/AmountDisplay';
import { Button } from '../../components/ui/Button';
import {
  createThemedStyles,
  useTheme,
  type ThemeTokens,
} from '../../contexts/ThemeContext';
import { daysUntil, formatINR } from '../../lib/utils';
import apiClient from '../../lib/api';
import type { GstStackParamList } from '../../navigation/GstStack';
import type { GstReturnStatus } from '../../components/ui/Badge';
import { useSensitiveScreen } from '../../hooks/usePreventScreenCapture';
import { RequestCallbackCta } from '../../components/callbacks/RequestCallbackCta';
import { useAuthStore } from '../../store/authStore';
import { getImsSummary } from '../../api/gstIms';
import {
  currentOpenImsPeriod,
  daysUntilDate,
  periodToLabel,
} from '../../lib/imsPeriod';

type NavProp = NativeStackNavigationProp<GstStackParamList, 'GstDashboard'>;
interface Props { navigation: NavProp }

interface GstReturn {
  id: string;
  type: 'GSTR-1' | 'GSTR-3B';
  period: string;
  status: GstReturnStatus;
  dueDate: string;
  taxableAmount?: number;
  itcClaimed?: number;
  netPayable?: number;
}

interface GstSummary {
  gstin: string;
  itcAvailable: number;
  outputTax: number;
  netPayable: number;
  pendingReturns: GstReturn[];
  itcMismatches: number;
}

export function GstDashboardScreen({ navigation }: Props) {
  useSensitiveScreen();
  const { t } = useTranslation();
  const { tokens } = useTheme();
  const styles = useStyles();
  const organization = useAuthStore((s) => s.currentOrganization);
  const imsPeriod = currentOpenImsPeriod();

  // GAP-101: live PENDING badge for the IMS Inbox entry card (spec §1.2)
  const { data: imsSummary } = useQuery({
    queryKey: ['ims-summary', organization?.id ?? '', imsPeriod],
    queryFn: () => getImsSummary(organization?.id ?? '', imsPeriod),
    enabled: !!organization?.id,
  });
  const imsPending = (imsSummary?.pending ?? 0) + (imsSummary?.pendingKept ?? 0);
  const imsDaysLeft = imsSummary
    ? daysUntilDate(imsSummary.gstr2bGenerationDeadline)
    : 99;
  const imsUrgent =
    !!imsSummary && !imsSummary.gstr2bGenerationPast && imsPending > 0 && imsDaysLeft <= 7;

  const { data: summary, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['gst-dashboard'],
    queryFn: async () => {
      const res = await apiClient.get<GstSummary>('/gst/dashboard');
      return res.data;
    },
    placeholderData: {
      gstin: '27AABCU9603R1ZM',
      itcAvailable: 0,
      outputTax: 0,
      netPayable: 0,
      pendingReturns: [],
      itcMismatches: 0,
    },
  });

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>GST Filing</Text>
          {summary?.gstin && (
            <Text style={styles.gstinValue}>{summary.gstin}</Text>
          )}
        </View>
        {/* Calendar view not yet implemented — hidden until a dedicated screen exists */}
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Summary cards */}
        <View style={styles.summaryGrid}>
          <View style={styles.summaryRow}>
            <SummaryCard
              label="ITC Available"
              amount={summary?.itcAvailable ?? 0}
              iconName="arrow-down-circle"
              iconColor={tokens.successFg}
              bg={tokens.successTint}
            />
            <SummaryCard
              label="Output Tax"
              amount={summary?.outputTax ?? 0}
              iconName="arrow-up-circle"
              iconColor={tokens.errorFg}
              bg={tokens.errorTint}
            />
          </View>
          <Card shadow="md" padding="md">
            <View style={styles.netPayableCard}>
              {/* AND-03: the amount block must flex-shrink so the pending
                  badge is never pushed past the right screen edge. */}
              <View style={styles.netPayableLeft}>
                <Text style={styles.netPayableLabel}>Net GST Payable</Text>
                <AmountDisplay amount={summary?.netPayable ?? 0} size="lg" colorCode />
              </View>
              <View style={styles.pendingCountBadge}>
                <Text style={styles.pendingCountNum}>{summary?.pendingReturns.length ?? 0}</Text>
                <Text style={styles.pendingCountLabel}>Pending</Text>
              </View>
            </View>
          </Card>
        </View>

        {/* Alerts */}
        {summary?.pendingReturns.some((r) => daysUntil(r.dueDate) <= 7) && (
          <View style={styles.alertBanner}>
            <Ionicons name="alert-circle" size={18} color={tokens.warningFg} />
            <Text style={styles.alertText}>Returns due within 7 days</Text>
          </View>
        )}

        {summary && summary.itcMismatches > 0 && (
          <View style={styles.mismatchBanner}>
            <View style={styles.mismatchLeft}>
              <Ionicons name="warning" size={18} color={tokens.loanAccent} />
              <Text style={styles.mismatchText}>
                {summary.itcMismatches} ITC mismatch{summary.itcMismatches > 1 ? 'es' : ''}
              </Text>
            </View>
            <Button label="Review" variant="secondary" size="sm" onPress={() => {}} />
          </View>
        )}

        {/* Callback CTA */}
        <RequestCallbackCta
          variant="card"
          category="GST"
          onNavigateToModal={(params) =>
            navigation.navigate('RequestCallbackModal', params)
          }
          onNavigateToStatus={(callbackId) =>
            navigation.navigate('CallbackStatus', { callbackId })
          }
        />

        {/* Pending Actions */}
        <Text style={styles.sectionTitle}>Pending Actions</Text>

        {/* GAP-101: IMS Inbox entry card (spec §1.2) */}
        <Pressable
          onPress={() => navigation.navigate('ImsInbox', { period: imsPeriod })}
          style={styles.imsCard}
          accessibilityRole="button"
          accessibilityLabel={
            imsPending > 0
              ? `${t('mobile.gst.ims.entry.title')}, ${t('mobile.gst.ims.entry.pendingCount', { count: imsPending })}, ${periodToLabel(imsPeriod)}`
              : `${t('mobile.gst.ims.entry.title')}, ${periodToLabel(imsPeriod)}`
          }
          testID="gst-ims-entry-card"
        >
          <View style={styles.imsIconWrap}>
            <Ionicons name="file-tray-full-outline" size={20} color={tokens.gstAccent} />
            {imsUrgent && <View style={styles.imsUrgencyDot} testID="gst-ims-urgency-dot" />}
          </View>
          <View style={styles.imsCardBody}>
            <Text style={styles.imsCardTitle}>{t('mobile.gst.ims.entry.title')}</Text>
            <Text style={styles.imsCardSub}>
              {t('mobile.gst.ims.entry.subtitle', { period: periodToLabel(imsPeriod) })}
            </Text>
          </View>
          {imsPending > 0 && (
            <View style={styles.imsBadge} testID="gst-ims-pending-badge">
              <Text style={styles.imsBadgeText}>{imsPending}</Text>
            </View>
          )}
          <Ionicons name="chevron-forward" size={18} color={tokens.textSecondary} />
        </Pressable>
        {isLoading ? (
          <View style={styles.skeletonCard} />
        ) : summary?.pendingReturns.length === 0 ? (
          <Card shadow="sm" padding="lg">
            <View style={styles.allClear}>
              <View style={styles.allClearIcon}>
                <Ionicons name="checkmark-circle" size={36} color={tokens.successFg} />
              </View>
              <Text style={styles.allClearText}>All returns filed!</Text>
              <Text style={styles.allClearSub}>You're up to date</Text>
            </View>
          </Card>
        ) : (
          summary?.pendingReturns.map((ret) => (
            <ReturnCard
              key={ret.id}
              ret={ret}
              onPress={
                ret.type === 'GSTR-3B'
                  ? () => navigation.navigate('Gstr3b', { returnId: ret.id, period: ret.period })
                  : undefined
              }
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryCard({ label, amount, iconName, iconColor, bg }: {
  label: string; amount: number; iconName: React.ComponentProps<typeof Ionicons>['name']; iconColor: string; bg: string;
}) {
  const styles = useStyles();
  return (
    <Card shadow="sm" style={styles.summaryCard}>
      <View style={[styles.summaryCardIcon, { backgroundColor: bg }]}>
        <Ionicons name={iconName} size={18} color={iconColor} />
      </View>
      <Text style={styles.summaryCardLabel}>{label}</Text>
      <Text style={styles.summaryCardAmount}>{formatINR(amount)}</Text>
    </Card>
  );
}

function ReturnCard({ ret, onPress }: { ret: GstReturn; onPress?: () => void }) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const days = daysUntil(ret.dueDate);
  const isOverdue = days < 0;
  const isUrgent = days >= 0 && days <= 7;

  return (
    <Card shadow="sm" style={styles.returnCard} clickable={!!onPress} onPress={onPress}>
      <View style={styles.returnCardHeader}>
        <View style={styles.returnTypeRow}>
          <View style={styles.returnTypeBadge}>
            <Text style={styles.returnTypeBadgeText}>{ret.type}</Text>
          </View>
          <Text style={styles.returnPeriod}>{ret.period}</Text>
        </View>
        <StatusBadge status={ret.status} />
      </View>

      <View style={styles.returnDueRow}>
        <View
          style={[
            styles.dueBadge,
            isOverdue && styles.dueBadgeOverdue,
            isUrgent && !isOverdue && styles.dueBadgeUrgent,
            !isOverdue && !isUrgent && styles.dueBadgeNormal,
          ]}
        >
          <Ionicons
            name={isOverdue ? 'alert-circle' : 'time-outline'}
            size={12}
            color={isOverdue ? tokens.errorFg : isUrgent ? tokens.warningFg : tokens.textSecondary}
          />
          <Text
            style={[
              styles.dueBadgeText,
              isOverdue && styles.dueBadgeTextOverdue,
              isUrgent && !isOverdue && styles.dueBadgeTextUrgent,
            ]}
          >
            {isOverdue ? 'Overdue' : `${days} day${days !== 1 ? 's' : ''} left`}
          </Text>
        </View>
      </View>

      {ret.netPayable !== undefined && (
        <View style={styles.returnSummary}>
          <Text style={styles.returnSummaryLabel}>Net Payable</Text>
          <AmountDisplay amount={ret.netPayable} size="sm" />
        </View>
      )}

      {onPress && (
        <Button
          label={ret.type === 'GSTR-3B' ? 'Review & File' : 'View Return'}
          onPress={onPress}
          size="sm"
          variant="primary"
          fullWidth
        />
      )}
    </Card>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: tk.canvas },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingVertical: 14,
      backgroundColor: tk.raised,
      borderBottomWidth: 1,
      borderBottomColor: tk.border,
    },
    headerTitle: { fontSize: 22, fontWeight: '800', color: tk.textPrimary, letterSpacing: -0.3 },
    // GSTIN is meaningful identifying text — textSecondary keeps ≥4.5:1 (a11y §4).
    gstinValue: { fontSize: 12, color: tk.textSecondary, marginTop: 2, fontFamily: Platform.OS === 'ios' ? 'SF Mono' : 'monospace' },
    headerBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: tk.sunken, alignItems: 'center', justifyContent: 'center' },
    scrollContent: { padding: 16, gap: 16 },

    // Summary grid
    summaryGrid: { gap: 12 },
    summaryRow: { flexDirection: 'row', gap: 12 },
    summaryCard: { flex: 1, padding: 14 },
    summaryCardIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
    summaryCardLabel: { fontSize: 12, color: tk.textSecondary, marginBottom: 4 },
    summaryCardAmount: { fontSize: 17, fontWeight: '700', color: tk.textPrimary, letterSpacing: -0.3 },
    netPayableCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    // AND-03: amount block shrinks within the card instead of overflowing it
    netPayableLeft: { flex: 1, minWidth: 0 },
    netPayableLabel: { fontSize: 13, color: tk.textSecondary, marginBottom: 4 },
    pendingCountBadge: { alignItems: 'center', backgroundColor: tk.warningTint, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, flexShrink: 0 },
    pendingCountNum: { fontSize: 22, fontWeight: '800', color: tk.warningFg },
    pendingCountLabel: { fontSize: 10, color: tk.warningFg, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },

    // Alerts
    alertBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: tk.warningTint, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: tk.warningTintBorder },
    alertText: { fontSize: 13, color: tk.warningFg, fontWeight: '600', flex: 1 },
    mismatchBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: tk.warningTint, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: tk.warningTintBorder },
    mismatchLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
    mismatchText: { fontSize: 13, color: tk.warningFg, fontWeight: '600' },

    sectionTitle: { fontSize: 18, fontWeight: '700', color: tk.textPrimary, letterSpacing: -0.3 },

    // GAP-101: IMS Inbox entry card
    imsCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: tk.raised,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: tk.border,
      padding: 14,
      minHeight: 44,
      ...tk.elevation1,
    },
    imsIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: tk.gstAccent + '15',
      alignItems: 'center',
      justifyContent: 'center',
    },
    imsUrgencyDot: {
      position: 'absolute',
      top: -2,
      right: -2,
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: tk.errorCta,
      borderWidth: 1.5,
      borderColor: tk.raised,
    },
    imsCardBody: { flex: 1, minWidth: 0 },
    imsCardTitle: { fontSize: 15, fontWeight: '700', color: tk.textPrimary },
    imsCardSub: { fontSize: 12, color: tk.textSecondary, marginTop: 2 },
    imsBadge: {
      minWidth: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: tk.warningTint,
      borderWidth: 1,
      borderColor: tk.warningTintBorder,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 7,
    },
    imsBadgeText: { fontSize: 12, fontWeight: '800', color: tk.warningFg },
    skeletonCard: { height: 120, backgroundColor: tk.skeleton1, borderRadius: 16 },
    allClear: { alignItems: 'center', gap: 8 },
    allClearIcon: { width: 56, height: 56, borderRadius: 16, backgroundColor: tk.successTint, alignItems: 'center', justifyContent: 'center' },
    allClearText: { fontSize: 17, fontWeight: '700', color: tk.successFg },
    allClearSub: { fontSize: 13, color: tk.textSecondary },

    // Return card
    returnCard: { padding: 16, marginBottom: 12 },
    returnCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    returnTypeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    returnTypeBadge: { backgroundColor: tk.gstAccent + '15', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    returnTypeBadgeText: { fontSize: 12, fontWeight: '700', color: tk.gstAccent },
    returnPeriod: { fontSize: 14, color: tk.textSecondary, fontWeight: '500' },
    returnDueRow: { marginBottom: 12 },
    dueBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
    dueBadgeNormal: { backgroundColor: tk.sunken },
    dueBadgeOverdue: { backgroundColor: tk.errorTint },
    dueBadgeUrgent: { backgroundColor: tk.warningTint },
    dueBadgeText: { fontSize: 12, fontWeight: '600', color: tk.textSecondary },
    dueBadgeTextOverdue: { color: tk.errorFg },
    dueBadgeTextUrgent: { color: tk.warningFg },
    returnSummary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, paddingVertical: 8, borderTopWidth: 1, borderTopColor: tk.border },
    returnSummaryLabel: { fontSize: 13, color: tk.textSecondary },
  }),
);
