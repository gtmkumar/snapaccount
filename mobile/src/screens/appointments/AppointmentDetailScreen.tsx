/**
 * AppointmentDetailScreen — Wave 7A / GAP-031 Flow C.
 *
 * The ≥2h reschedule/cancel cutoff is shown EXPLICITLY:
 * - >2h away: info line "You can reschedule or cancel until {{time}} (2 hours
 *   before)." + enabled Reschedule / Cancel.
 * - ≤2h (or in progress / past): buttons disabled WITH a warning banner
 *   explaining why + "Message CA" escape. Never silently disabled.
 * The same cutoff is server-enforced; a 4xx on cancel flips to the closed
 * presentation (server is source of truth) [confirm 7A].
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { ListSkeleton, ErrorState } from '../../components/shared/ListStates';
import { RatingSheet } from '../../components/appointments/RatingSheet';
import { ConfirmCancelSheet } from '../../components/appointments/ConfirmCancelSheet';
import { appointmentStatusKey } from '../../components/appointments/AppointmentCard';
import { useHaptics } from '../../hooks/useHaptics';
import { useNowMs } from '../../hooks/useNowMs';
import { formatIstDate, formatIstTime } from '../../lib/ist';
import {
  cancelAppointment,
  getAppointment,
  getCutoffMs,
  isBeforeCutoff,
  isInJoinWindow,
  rateAppointment,
} from '../../api/appointments';
import type { ChatStackParamList } from '../../navigation/ChatStack';

type NavProp = NativeStackNavigationProp<ChatStackParamList, 'AppointmentDetail'>;
type RoutePropType = RouteProp<ChatStackParamList, 'AppointmentDetail'>;
interface Props { navigation: NavProp; route: RoutePropType }

export function AppointmentDetailScreen({ navigation, route }: Props) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const haptics = useHaptics();
  const qc = useQueryClient();
  const nowMs = useNowMs(30_000);
  const { appointmentId } = route.params;

  const [showCancelSheet, setShowCancelSheet] = useState(false);
  const [showRatingSheet, setShowRatingSheet] = useState(false);
  // Set when the SERVER rejects a cancel as too late (source of truth).
  const [serverClosed, setServerClosed] = useState(false);

  const { data: appt, isLoading, error, refetch } = useQuery({
    queryKey: ['appointment', appointmentId],
    queryFn: () => getAppointment(appointmentId),
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelAppointment(appointmentId),
    onSuccess: () => {
      haptics.warning();
      setShowCancelSheet(false);
      void qc.invalidateQueries({ queryKey: ['appointments'] });
      void qc.invalidateQueries({ queryKey: ['appointment', appointmentId] });
    },
    onError: () => {
      haptics.error();
      setShowCancelSheet(false);
      setServerClosed(true);
    },
  });

  const rateMutation = useMutation({
    mutationFn: ({ stars, comment }: { stars: number; comment: string }) =>
      rateAppointment(appointmentId, stars, comment || undefined),
    onSuccess: () => {
      haptics.success();
      setShowRatingSheet(false);
      void qc.invalidateQueries({ queryKey: ['appointment', appointmentId] });
      void qc.invalidateQueries({ queryKey: ['appointments'] });
    },
    onError: () => haptics.error(),
  });

  const messageCa = () =>
    (navigation.navigate as (route: string) => void)('ChatList');

  const renderBody = () => {
    if (isLoading) {
      return (
        <View style={styles.section}>
          <ListSkeleton variant="card" count={3} cardHeight={88} testID="appt-detail-skeleton" />
        </View>
      );
    }
    if (error || !appt) {
      return (
        <ErrorState
          message={t('mobile.ca.appts.error')}
          retryLabel={t('mobile.common.retry')}
          onRetry={() => void refetch()}
          secondaryLabel={t('mobile.common.goBack')}
          onSecondaryPress={() => navigation.goBack()}
          testID="appt-detail-error"
        />
      );
    }

    const isActionable = appt.status === 'DRAFT' || appt.status === 'CONFIRMED';
    const cutoffOpen =
      isActionable && !serverClosed && isBeforeCutoff(appt.scheduledAt, nowMs);
    const cutoffTimeLabel = `${formatIstTime(
      new Date(getCutoffMs(appt.scheduledAt)).toISOString(),
    )} IST`;
    const joinable =
      !!appt.meetingUrl &&
      appt.status === 'CONFIRMED' &&
      isInJoinWindow(appt.scheduledAt, appt.durationMinutes, nowMs);
    const canRate = appt.status === 'COMPLETED' && !(appt.rating && appt.rating > 0);

    return (
      <>
        {/* Summary */}
        <View style={styles.card}>
          {[
            { label: t('mobile.ca.confirm.ca'), value: appt.caName },
            { label: t('mobile.ca.confirm.date'), value: formatIstDate(appt.scheduledAt) },
            {
              label: t('mobile.ca.confirm.time'),
              value: `${formatIstTime(appt.scheduledAt)} IST`,
            },
            {
              label: t('mobile.ca.confirm.duration'),
              value: t('mobile.ca.confirm.durationValue', { minutes: appt.durationMinutes }),
            },
            ...(appt.topic
              ? [{
                  label: t('mobile.ca.confirm.topicShort'),
                  value: t(`mobile.ca.confirm.topic.${appt.topic.toLowerCase()}`),
                }]
              : []),
            { label: t('mobile.ca.detail.status'), value: t(appointmentStatusKey(appt.status)) },
          ].map((row) => (
            <View key={row.label} style={styles.row}>
              <Text style={styles.rowLabel}>{row.label}</Text>
              <Text style={styles.rowValue}>{row.value}</Text>
            </View>
          ))}
        </View>

        {/* Join */}
        {joinable ? (
          <Pressable
            style={styles.joinBtn}
            onPress={() => void Linking.openURL(appt.meetingUrl as string)}
            accessibilityRole="button"
            accessibilityLabel={t('mobile.ca.appt.joinA11y', { caName: appt.caName })}
            testID="appt-detail-join"
          >
            <Ionicons name="videocam" size={18} color={tokens.textOnBrand} />
            <Text style={styles.joinBtnText}>{t('mobile.ca.appt.join')}</Text>
          </Pressable>
        ) : null}

        {/* Reminder expectation (Flow D) */}
        {isActionable ? (
          <View style={styles.reminderRow}>
            <Ionicons name="notifications-outline" size={16} color={tokens.textSecondary} />
            <Text style={styles.reminderText}>{t('mobile.ca.detail.reminderNote')}</Text>
          </View>
        ) : null}

        {/* Cutoff state — always explicit, never a bare disabled control */}
        {isActionable ? (
          cutoffOpen ? (
            <Text style={styles.cutoffOpenLine} testID="appt-cutoff-open">
              {t('mobile.ca.appt.cutoffOpen', { time: cutoffTimeLabel })}
            </Text>
          ) : (
            <View
              style={styles.cutoffBanner}
              accessibilityLiveRegion="polite"
              testID="appt-cutoff-closed"
            >
              <Ionicons name="warning-outline" size={18} color={tokens.warningFg} />
              <View style={styles.cutoffBannerBody}>
                <Text style={styles.cutoffBannerText}>
                  {t('mobile.ca.appt.cutoffClosed')}
                </Text>
                <Text style={styles.cutoffBannerHelp}>
                  {t('mobile.ca.appt.cutoffClosedHelp')}
                </Text>
              </View>
            </View>
          )
        ) : null}

        {/* Reschedule / Cancel */}
        {isActionable ? (
          <View style={styles.actionsRow}>
            <Pressable
              style={[styles.actionBtn, !cutoffOpen && styles.actionBtnDisabled]}
              onPress={
                cutoffOpen
                  ? () =>
                      navigation.navigate('SlotPicker', {
                        caProfileId: appt.caProfileId,
                        caName: appt.caName,
                        rescheduleAppointmentId: appt.appointmentId,
                      })
                  : undefined
              }
              disabled={!cutoffOpen}
              accessibilityRole="button"
              accessibilityLabel={t('mobile.ca.appt.reschedule')}
              accessibilityState={{ disabled: !cutoffOpen }}
              accessibilityHint={
                cutoffOpen ? undefined : t('mobile.ca.appt.cutoffClosed')
              }
              testID="appt-reschedule"
            >
              <Text
                style={[styles.actionBtnText, !cutoffOpen && styles.actionBtnTextDisabled]}
              >
                {t('mobile.ca.appt.reschedule')}
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.actionBtn,
                styles.cancelBtn,
                !cutoffOpen && styles.actionBtnDisabled,
              ]}
              onPress={cutoffOpen ? () => setShowCancelSheet(true) : undefined}
              disabled={!cutoffOpen}
              accessibilityRole="button"
              accessibilityLabel={t('mobile.ca.appt.cancel')}
              accessibilityState={{ disabled: !cutoffOpen }}
              accessibilityHint={
                cutoffOpen ? undefined : t('mobile.ca.appt.cutoffClosed')
              }
              testID="appt-cancel"
            >
              <Text
                style={[
                  styles.cancelBtnText,
                  !cutoffOpen && styles.actionBtnTextDisabled,
                ]}
              >
                {t('mobile.ca.appt.cancel')}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {/* Message CA escape — shown alongside the closed cutoff state */}
        {isActionable && !cutoffOpen ? (
          <Pressable
            style={styles.messageCaBtn}
            onPress={messageCa}
            accessibilityRole="button"
            accessibilityLabel={t('mobile.ca.appt.messageCa')}
            testID="appt-message-ca"
          >
            <Ionicons name="chatbubble-ellipses-outline" size={16} color={tokens.brandFg} />
            <Text style={styles.messageCaText}>{t('mobile.ca.appt.messageCa')}</Text>
          </Pressable>
        ) : null}

        {/* Post-call rating */}
        {canRate ? (
          <Pressable
            style={styles.rateBtn}
            onPress={() => setShowRatingSheet(true)}
            accessibilityRole="button"
            accessibilityLabel={t('mobile.ca.rating.cta')}
            testID="appt-rate"
          >
            <Ionicons name="star-outline" size={16} color={tokens.brandFg} />
            <Text style={styles.messageCaText}>{t('mobile.ca.rating.cta')}</Text>
          </Pressable>
        ) : null}

        <RatingSheet
          visible={showRatingSheet}
          caName={appt.caName}
          busy={rateMutation.isPending}
          onSubmit={(stars, comment) => rateMutation.mutate({ stars, comment })}
          onClose={() => setShowRatingSheet(false)}
        />
        <ConfirmCancelSheet
          visible={showCancelSheet}
          busy={cancelMutation.isPending}
          onConfirm={() => cancelMutation.mutate()}
          onClose={() => setShowCancelSheet(false)}
        />
      </>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.common.back')}
          hitSlop={8}
        >
          <Ionicons name="arrow-back" size={22} color={tokens.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('mobile.ca.detail.title')}</Text>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {renderBody()}
      </ScrollView>
      {cancelMutation.isPending ? (
        <ActivityIndicator
          style={styles.pendingSpinner}
          color={tokens.brand500}
          testID="appt-cancel-pending"
        />
      ) : null}
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
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: tk.sunken,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: { fontSize: 18, fontWeight: '700', color: tk.textPrimary },
    scrollContent: { padding: 16, gap: 14 },
    section: { gap: 10 },
    card: {
      backgroundColor: tk.raised,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: tk.border,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 13,
      minHeight: 48,
      borderBottomWidth: 1,
      borderBottomColor: tk.border,
    },
    rowLabel: { fontSize: 13, color: tk.textSecondary, flex: 1 },
    rowValue: {
      fontSize: 13,
      fontWeight: '600',
      color: tk.textPrimary,
      flex: 1.4,
      textAlign: 'right',
    },
    joinBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: tk.brandCta,
      borderRadius: 14,
      minHeight: 52,
    },
    joinBtnText: { fontSize: 16, fontWeight: '700', color: tk.textOnBrand },
    reminderRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
    },
    reminderText: { flex: 1, fontSize: 13, color: tk.textSecondary, lineHeight: 19 },
    cutoffOpenLine: { fontSize: 13, color: tk.textSecondary, lineHeight: 19 },
    cutoffBanner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      backgroundColor: tk.warningTint,
      borderColor: tk.warningTintBorder,
      borderWidth: 1,
      borderRadius: 12,
      padding: 12,
    },
    cutoffBannerBody: { flex: 1, gap: 4 },
    cutoffBannerText: { fontSize: 13, fontWeight: '600', color: tk.warningFg, lineHeight: 19 },
    cutoffBannerHelp: { fontSize: 13, color: tk.warningFg, lineHeight: 19 },
    actionsRow: { flexDirection: 'row', gap: 10 },
    actionBtn: {
      flex: 1,
      minHeight: 48,
      borderRadius: 12,
      backgroundColor: tk.brandTint,
      borderWidth: 1,
      borderColor: tk.brandTintBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelBtn: {
      backgroundColor: tk.errorTint,
      borderColor: tk.errorTintBorder,
    },
    actionBtnDisabled: { opacity: 0.45 },
    actionBtnText: { fontSize: 14, fontWeight: '700', color: tk.brandFg },
    cancelBtnText: { fontSize: 14, fontWeight: '700', color: tk.errorFg },
    actionBtnTextDisabled: { color: tk.textDisabled },
    messageCaBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      minHeight: 44,
      borderRadius: 12,
      backgroundColor: tk.brandTint,
    },
    rateBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      minHeight: 48,
      borderRadius: 12,
      backgroundColor: tk.brandTint,
    },
    messageCaText: { fontSize: 14, fontWeight: '700', color: tk.brandFg },
    pendingSpinner: { position: 'absolute', bottom: 24, alignSelf: 'center' },
  }),
);
