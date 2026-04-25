/**
 * RefundTrackerScreen — Live refund status with vertical StatusTimeline, RaiseGrievanceModal.
 * Phase 6D — docs/design/mobile/itr/refund-tracker-screen.md
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
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
import { RaiseGrievanceModal } from '../../components/shared/RaiseGrievanceModal';
import { Colors } from '../../constants/colors';
import { useSensitiveScreen } from '../../hooks/usePreventScreenCapture';
import { getRefundStatus } from '../../api/itr';
import type { RefundStatus } from '../../api/itr';
import type { ItrStackParamList } from '../../navigation/ItrStack';
import { formatINR } from '../../lib/utils';
import { apiClient } from '../../lib/api';

type NavProp = NativeStackNavigationProp<ItrStackParamList, 'RefundTracker'>;
type RoutePropType = RouteProp<ItrStackParamList, 'RefundTracker'>;

interface Props {
  navigation: NavProp;
  route: RoutePropType;
}

interface TimelineStep {
  status: RefundStatus;
  label: string;
  completedKey: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}

const TIMELINE_STEPS: TimelineStep[] = [
  { status: 'Pending', label: 'Filed', completedKey: 'mobile.itr.refund.stepFiled', icon: 'document-text-outline' },
  { status: 'Processing', label: 'Processing', completedKey: 'mobile.itr.refund.stepProcessing', icon: 'sync-outline' },
  { status: 'Issued', label: 'Issued', completedKey: 'mobile.itr.refund.stepIssued', icon: 'checkmark-circle' },
];

function statusToStep(status: RefundStatus): number {
  const steps: RefundStatus[] = ['Pending', 'Processing', 'Issued'];
  return steps.indexOf(status);
}

const STATUS_COLORS: Record<RefundStatus, string> = {
  NotApplicable: Colors.neutral[400],
  Pending: Colors.warning[500],
  Processing: Colors.brand[500],
  Issued: Colors.success[500],
  Failed: Colors.error[500],
  Adjusted: Colors.accent[500],
};

export function RefundTrackerScreen({ navigation, route }: Props) {
  useSensitiveScreen();
  const { t } = useTranslation();
  const { filingId } = route.params;
  const [grievanceVisible, setGrievanceVisible] = useState(false);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['refund-status', filingId],
    queryFn: () => getRefundStatus(filingId),
    refetchInterval: 30_000, // Poll every 30s
  });

  const currentStep = data ? statusToStep(data.refundStatus) : -1;
  const isDelayed = data?.refundStatus === 'Pending' || data?.refundStatus === 'Processing';
  const statusColor = data ? STATUS_COLORS[data.refundStatus] : Colors.neutral[400];

  const handleSubmitGrievance = async (formData: { subject: string; description: string; contactEmail?: string }) => {
    await apiClient.post('/itr/grievances', { filingId, ...formData });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={8}
          accessibilityLabel={t('mobile.common.back')}>
          <Ionicons name="arrow-back" size={22} color={Colors.neutral[800]} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('mobile.itr.refund.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
        showsVerticalScrollIndicator={false}
      >
        {isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={Colors.itr} />
          </View>
        ) : data ? (
          <>
            {/* Status hero card */}
            <View style={[styles.heroCard, { borderColor: statusColor + '40' }]}>
              <View style={[styles.heroIcon, { backgroundColor: statusColor + '15' }]}>
                <Ionicons
                  name={
                    data.refundStatus === 'Issued' ? 'checkmark-circle' :
                    data.refundStatus === 'Failed' ? 'close-circle' :
                    'time'
                  }
                  size={36}
                  color={statusColor}
                />
              </View>
              <Text style={[styles.heroStatus, { color: statusColor }]}>
                {t(`mobile.itr.refund.status.${data.refundStatus}`)}
              </Text>
              {data.refundAmount && data.refundAmount > 0 && (
                <Text style={styles.heroAmount}>{formatINR(data.refundAmount)}</Text>
              )}
              {data.statusMessage && (
                <Text style={styles.heroMessage}>{data.statusMessage}</Text>
              )}
              {data.refundDate && (
                <Text style={styles.heroDate}>
                  {t('mobile.itr.refund.expectedDate', { date: data.refundDate })}
                </Text>
              )}
              {data.transactionReference && (
                <View style={styles.txRefBadge}>
                  <Text style={styles.txRefText}>{data.transactionReference}</Text>
                </View>
              )}
            </View>

            {/* Vertical timeline */}
            <View style={styles.timelineCard}>
              <Text style={styles.timelineTitle}>{t('mobile.itr.refund.timeline')}</Text>
              {TIMELINE_STEPS.map((step, index) => {
                const isDone = currentStep >= index;
                const isActive = currentStep === index;
                return (
                  <View key={step.status} style={styles.timelineRow}>
                    {/* Connector */}
                    <View style={styles.timelineLeft}>
                      <View
                        style={[
                          styles.timelineCircle,
                          isDone && styles.timelineCircleDone,
                          isActive && styles.timelineCircleActive,
                        ]}
                      >
                        <Ionicons
                          name={isDone ? 'checkmark' : step.icon}
                          size={14}
                          color={isDone || isActive ? '#FFFFFF' : Colors.neutral[400]}
                        />
                      </View>
                      {index < TIMELINE_STEPS.length - 1 && (
                        <View
                          style={[
                            styles.timelineLine,
                            isDone && styles.timelineLineDone,
                          ]}
                        />
                      )}
                    </View>
                    <View style={styles.timelineContent}>
                      <Text
                        style={[
                          styles.timelineLabel,
                          isDone && styles.timelineLabelDone,
                        ]}
                      >
                        {t(step.completedKey)}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Last polled */}
            <View style={styles.polledRow}>
              <Ionicons name="refresh-outline" size={14} color={Colors.neutral[400]} />
              <Text style={styles.polledText}>
                {t('mobile.itr.refund.lastPolled', { time: data.lastPolledAt })}
              </Text>
            </View>

            {/* Raise grievance (for delayed refunds) */}
            {isDelayed && (
              <Pressable
                style={styles.grievanceBtn}
                onPress={() => setGrievanceVisible(true)}
                accessibilityRole="button"
                accessibilityLabel={t('mobile.itr.refund.raiseGrievance')}
              >
                <Ionicons name="alert-circle-outline" size={20} color={Colors.error[600]} />
                <Text style={styles.grievanceBtnText}>{t('mobile.itr.refund.raiseGrievance')}</Text>
              </Pressable>
            )}
          </>
        ) : (
          <View style={styles.emptyWrap}>
            <Ionicons name="receipt-outline" size={48} color={Colors.neutral[300]} />
            <Text style={styles.emptyText}>{t('mobile.itr.refund.noData')}</Text>
          </View>
        )}
      </ScrollView>

      <RaiseGrievanceModal
        visible={grievanceVisible}
        filingId={filingId}
        onClose={() => setGrievanceVisible(false)}
        onSubmit={handleSubmitGrievance}
        testID="grievance-modal"
      />
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
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.neutral[900] },
  scrollContent: { padding: 16, gap: 16 },

  loadingWrap: { alignItems: 'center', paddingVertical: 60 },

  heroCard: {
    backgroundColor: Colors.surface.default, borderRadius: 20,
    borderWidth: 1.5, padding: 24, alignItems: 'center', gap: 10,
  },
  heroIcon: { width: 72, height: 72, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  heroStatus: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  heroAmount: { fontSize: 28, fontWeight: '800', color: Colors.neutral[900], letterSpacing: -0.5 },
  heroMessage: { fontSize: 14, color: Colors.neutral[600], textAlign: 'center', lineHeight: 20 },
  heroDate: { fontSize: 13, color: Colors.neutral[500] },
  txRefBadge: { backgroundColor: Colors.neutral[100], borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  txRefText: { fontSize: 12, color: Colors.neutral[600], fontFamily: 'monospace' },

  timelineCard: { backgroundColor: Colors.surface.default, borderRadius: 16, borderWidth: 1, borderColor: Colors.neutral[100], padding: 16, gap: 0 },
  timelineTitle: { fontSize: 15, fontWeight: '700', color: Colors.neutral[800], marginBottom: 16 },
  timelineRow: { flexDirection: 'row', gap: 14 },
  timelineLeft: { alignItems: 'center', width: 28 },
  timelineCircle: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: Colors.neutral[100], borderWidth: 2, borderColor: Colors.neutral[200],
    alignItems: 'center', justifyContent: 'center',
  },
  timelineCircleDone: { backgroundColor: Colors.success[500], borderColor: Colors.success[500] },
  timelineCircleActive: { backgroundColor: Colors.brand[500], borderColor: Colors.brand[500] },
  timelineLine: { width: 2, flex: 1, backgroundColor: Colors.neutral[200], marginVertical: 4 },
  timelineLineDone: { backgroundColor: Colors.success[400] },
  timelineContent: { flex: 1, paddingBottom: 20, paddingTop: 4 },
  timelineLabel: { fontSize: 14, fontWeight: '600', color: Colors.neutral[500] },
  timelineLabelDone: { color: Colors.neutral[800] },

  polledRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  polledText: { fontSize: 12, color: Colors.neutral[400] },

  grievanceBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12, justifyContent: 'center',
    backgroundColor: Colors.error[50], borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: Colors.error[200], minHeight: 52,
  },
  grievanceBtnText: { fontSize: 15, fontWeight: '700', color: Colors.error[700] },

  emptyWrap: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 15, color: Colors.neutral[500], textAlign: 'center' },
});
