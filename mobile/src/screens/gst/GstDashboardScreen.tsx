/**
 * GST Dashboard Screen — Redesign 2026
 * Premium GST dashboard with better visual hierarchy
 */

import React from 'react';
import {
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { StatusBadge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { AmountDisplay } from '../../components/ui/AmountDisplay';
import { Button } from '../../components/ui/Button';
import { Colors } from '../../constants/colors';
import { daysUntil, formatINR } from '../../lib/utils';
import apiClient from '../../lib/api';
import type { GstStackParamList } from '../../navigation/GstStack';
import type { GstReturnStatus } from '../../components/ui/Badge';
import { useSensitiveScreen } from '../../hooks/usePreventScreenCapture';
import { RequestCallbackCta } from '../../components/callbacks/RequestCallbackCta';

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
        <Pressable
          style={styles.headerBtn}
          accessibilityLabel="Deadline calendar"
          onPress={() => Alert.alert('Coming Soon', 'Calendar view coming soon.')}
        >
          <Ionicons name="calendar-outline" size={20} color={Colors.neutral[600]} />
        </Pressable>
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
              iconColor={Colors.success[500]}
              bg={Colors.success[50]}
            />
            <SummaryCard
              label="Output Tax"
              amount={summary?.outputTax ?? 0}
              iconName="arrow-up-circle"
              iconColor={Colors.error[500]}
              bg={Colors.error[50]}
            />
          </View>
          <Card shadow="md" padding="md">
            <View style={styles.netPayableCard}>
              <View>
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
            <Ionicons name="alert-circle" size={18} color={Colors.warning[600]} />
            <Text style={styles.alertText}>Returns due within 7 days</Text>
          </View>
        )}

        {summary && summary.itcMismatches > 0 && (
          <View style={styles.mismatchBanner}>
            <View style={styles.mismatchLeft}>
              <Ionicons name="warning" size={18} color={Colors.accent[600]} />
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
        {isLoading ? (
          <View style={styles.skeletonCard} />
        ) : summary?.pendingReturns.length === 0 ? (
          <Card shadow="sm" padding="lg">
            <View style={styles.allClear}>
              <View style={styles.allClearIcon}>
                <Ionicons name="checkmark-circle" size={36} color={Colors.success[500]} />
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
              onPress={() => {
                if (ret.type === 'GSTR-3B') {
                  navigation.navigate('Gstr3b', { returnId: ret.id, period: ret.period });
                } else {
                  Alert.alert('Coming Soon', 'GSTR-1 filing will be available soon.');
                }
              }}
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

function ReturnCard({ ret, onPress }: { ret: GstReturn; onPress: () => void }) {
  const days = daysUntil(ret.dueDate);
  const isOverdue = days < 0;
  const isUrgent = days >= 0 && days <= 7;

  return (
    <Card shadow="sm" style={styles.returnCard} clickable onPress={onPress}>
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
            color={isOverdue ? Colors.error[600] : isUrgent ? Colors.warning[600] : Colors.neutral[600]}
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

      <Button
        label={ret.type === 'GSTR-3B' ? 'Review & File' : 'View Return'}
        onPress={onPress}
        size="sm"
        variant={ret.type === 'GSTR-3B' ? 'primary' : 'secondary'}
        fullWidth
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.base },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: Colors.surface.default,
    borderBottomWidth: 1,
    borderBottomColor: Colors.neutral[100],
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: Colors.neutral[900], letterSpacing: -0.3 },
  gstinValue: { fontSize: 12, color: Colors.neutral[400], marginTop: 2, fontFamily: Platform.OS === 'ios' ? 'SF Mono' : 'monospace' },
  headerBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.neutral[100], alignItems: 'center', justifyContent: 'center' },
  scrollContent: { padding: 16, gap: 16 },

  // Summary grid
  summaryGrid: { gap: 12 },
  summaryRow: { flexDirection: 'row', gap: 12 },
  summaryCard: { flex: 1, padding: 14 },
  summaryCardIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  summaryCardLabel: { fontSize: 12, color: Colors.neutral[500], marginBottom: 4 },
  summaryCardAmount: { fontSize: 17, fontWeight: '700', color: Colors.neutral[900], letterSpacing: -0.3 },
  netPayableCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  netPayableLabel: { fontSize: 13, color: Colors.neutral[500], marginBottom: 4 },
  pendingCountBadge: { alignItems: 'center', backgroundColor: Colors.warning[50], paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  pendingCountNum: { fontSize: 22, fontWeight: '800', color: Colors.warning[600] },
  pendingCountLabel: { fontSize: 10, color: Colors.warning[600], fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },

  // Alerts
  alertBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.warning[50], borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.warning[200] },
  alertText: { fontSize: 13, color: Colors.warning[700], fontWeight: '600', flex: 1 },
  mismatchBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.accent[50], borderRadius: 12, padding: 14, borderWidth: 1, borderColor: Colors.accent[200] },
  mismatchLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  mismatchText: { fontSize: 13, color: Colors.accent[700], fontWeight: '600' },

  sectionTitle: { fontSize: 18, fontWeight: '700', color: Colors.neutral[800], letterSpacing: -0.3 },
  skeletonCard: { height: 120, backgroundColor: Colors.neutral[100], borderRadius: 16 },
  allClear: { alignItems: 'center', gap: 8 },
  allClearIcon: { width: 56, height: 56, borderRadius: 16, backgroundColor: Colors.success[50], alignItems: 'center', justifyContent: 'center' },
  allClearText: { fontSize: 17, fontWeight: '700', color: Colors.success[600] },
  allClearSub: { fontSize: 13, color: Colors.neutral[500] },

  // Return card
  returnCard: { padding: 16, marginBottom: 12 },
  returnCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  returnTypeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  returnTypeBadge: { backgroundColor: Colors.gst + '15', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  returnTypeBadgeText: { fontSize: 12, fontWeight: '700', color: Colors.gst },
  returnPeriod: { fontSize: 14, color: Colors.neutral[600], fontWeight: '500' },
  returnDueRow: { marginBottom: 12 },
  dueBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
  dueBadgeNormal: { backgroundColor: Colors.neutral[100] },
  dueBadgeOverdue: { backgroundColor: Colors.error[50] },
  dueBadgeUrgent: { backgroundColor: Colors.warning[50] },
  dueBadgeText: { fontSize: 12, fontWeight: '600', color: Colors.neutral[600] },
  dueBadgeTextOverdue: { color: Colors.error[600] },
  dueBadgeTextUrgent: { color: Colors.warning[600] },
  returnSummary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, paddingVertical: 8, borderTopWidth: 1, borderTopColor: Colors.neutral[100] },
  returnSummaryLabel: { fontSize: 13, color: Colors.neutral[500] },
});
