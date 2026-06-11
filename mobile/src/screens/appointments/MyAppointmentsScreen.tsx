/**
 * MyAppointmentsScreen — Upcoming / Past consultations (Wave 7A / GAP-031).
 * ListStates kit for loading/empty/error; assisted-callback escape on error
 * (regulated-adjacent flow rule, spec §1.4).
 */

import React, { useState } from 'react';
import {
  Linking,
  Pressable,
  RefreshControl,
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
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { ListSkeleton, EmptyState, ErrorState } from '../../components/shared/ListStates';
import { AppointmentCard } from '../../components/appointments/AppointmentCard';
import { RatingSheet } from '../../components/appointments/RatingSheet';
import { useHaptics } from '../../hooks/useHaptics';
import { useNowMs } from '../../hooks/useNowMs';
import {
  isInJoinWindow,
  listAppointments,
  rateAppointment,
  type Appointment,
} from '../../api/appointments';
import type { ChatStackParamList } from '../../navigation/ChatStack';

type NavProp = NativeStackNavigationProp<ChatStackParamList, 'MyAppointments'>;
interface Props { navigation: NavProp }

type Scope = 'upcoming' | 'past';

export function MyAppointmentsScreen({ navigation }: Props) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const haptics = useHaptics();
  const qc = useQueryClient();
  const nowMs = useNowMs(30_000);
  const [scope, setScope] = useState<Scope>('upcoming');
  const [ratingTarget, setRatingTarget] = useState<Appointment | null>(null);

  const { data, isLoading, isRefetching, error, refetch } = useQuery({
    queryKey: ['appointments', scope],
    queryFn: () => listAppointments(scope),
  });

  const rateMutation = useMutation({
    mutationFn: ({ id, stars, comment }: { id: string; stars: number; comment: string }) =>
      rateAppointment(id, stars, comment || undefined),
    onSuccess: () => {
      haptics.success();
      setRatingTarget(null);
      void qc.invalidateQueries({ queryKey: ['appointments'] });
    },
    onError: () => haptics.error(),
  });

  const items = data?.items ?? [];

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
        <Text style={styles.headerTitle}>{t('mobile.ca.appts.title')}</Text>
        <View style={{ width: 44 }} />
      </View>

      {/* Segmented control (44pt segments) */}
      <View style={styles.segmentRow}>
        {(['upcoming', 'past'] as Scope[]).map((s) => {
          const active = scope === s;
          return (
            <Pressable
              key={s}
              style={[styles.segment, active && styles.segmentActive]}
              onPress={() => {
                haptics.lightTap();
                setScope(s);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              testID={`appts-tab-${s}`}
            >
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                {t(`mobile.ca.appts.tab.${s}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {isLoading ? (
        <View style={styles.body}>
          <ListSkeleton variant="card" count={4} cardHeight={108} testID="appts-skeleton" />
        </View>
      ) : error ? (
        <ErrorState
          message={t('mobile.ca.appts.error')}
          retryLabel={t('mobile.common.retry')}
          onRetry={() => void refetch()}
          // Assisted-callback escape — regulated-adjacent flow (spec §1.4).
          secondaryLabel={t('mobile.ca.appts.callbackEscape')}
          onSecondaryPress={() =>
            (navigation.navigate as (route: string, params?: object) => void)(
              'RequestCallbackModal',
              { category: 'OTHER' },
            )
          }
          testID="appts-error"
        />
      ) : items.length === 0 ? (
        scope === 'upcoming' ? (
          <EmptyState
            icon="calendar-outline"
            title={t('mobile.ca.appts.empty.upcoming')}
            body={t('mobile.ca.appts.empty.upcomingBody')}
            ctaLabel={t('mobile.ca.book.cta')}
            onCtaPress={() => navigation.navigate('CaSelect')}
            testID="appts-empty-upcoming"
          />
        ) : (
          <EmptyState
            icon="time-outline"
            title={t('mobile.ca.appts.empty.past')}
            testID="appts-empty-past"
          />
        )
      ) : (
        <ScrollView
          contentContainerStyle={styles.body}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => {
                haptics.lightTap();
                void refetch();
              }}
              tintColor={tokens.brand500}
              colors={[tokens.brand500]}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {items.map((appt) => {
            const joinable =
              scope === 'upcoming' &&
              !!appt.meetingUrl &&
              appt.status === 'CONFIRMED' &&
              isInJoinWindow(appt.scheduledAt, appt.durationMinutes, nowMs);
            return (
              <AppointmentCard
                key={appt.appointmentId}
                appointment={appt}
                canJoin={joinable}
                onJoin={
                  appt.meetingUrl
                    ? () => void Linking.openURL(appt.meetingUrl as string)
                    : undefined
                }
                onManage={() =>
                  navigation.navigate('AppointmentDetail', {
                    appointmentId: appt.appointmentId,
                  })
                }
                onRate={
                  scope === 'past' && appt.status === 'COMPLETED'
                    ? () => setRatingTarget(appt)
                    : undefined
                }
              />
            );
          })}
        </ScrollView>
      )}

      <RatingSheet
        visible={ratingTarget !== null}
        caName={ratingTarget?.caName ?? ''}
        busy={rateMutation.isPending}
        onSubmit={(stars, comment) => {
          if (ratingTarget) {
            rateMutation.mutate({ id: ratingTarget.appointmentId, stars, comment });
          }
        }}
        onClose={() => setRatingTarget(null)}
      />
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
    segmentRow: {
      flexDirection: 'row',
      gap: 8,
      padding: 16,
      paddingBottom: 8,
    },
    segment: {
      flex: 1,
      minHeight: 44,
      borderRadius: 12,
      backgroundColor: tk.sunken,
      borderWidth: 1,
      borderColor: tk.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    segmentActive: {
      backgroundColor: tk.brand500,
      borderColor: tk.brand500,
    },
    segmentText: { fontSize: 14, fontWeight: '600', color: tk.textSecondary },
    segmentTextActive: { color: tk.textOnBrand },
    body: { padding: 16, paddingTop: 8 },
  }),
);
