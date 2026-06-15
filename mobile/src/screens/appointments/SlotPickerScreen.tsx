/**
 * SlotPickerScreen — IST date strip + time-slot grid (Wave 7A / GAP-031).
 * Also reused for reschedule (route.params.rescheduleAppointmentId set):
 * confirming a slot then calls the reschedule endpoint directly.
 */

import React, { useMemo, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
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
import { DateStrip, type DateStripDay } from '../../components/appointments/DateStrip';
import { SlotGrid } from '../../components/appointments/SlotGrid';
import { useHaptics } from '../../hooks/useHaptics';
import {
  getCaSlots,
  getSlotDayMap,
  rescheduleAppointment,
  type AppointmentSlot,
} from '../../api/appointments';
import type { ChatStackParamList } from '../../navigation/ChatStack';

type NavProp = NativeStackNavigationProp<ChatStackParamList, 'SlotPicker'>;
type RoutePropType = RouteProp<ChatStackParamList, 'SlotPicker'>;
interface Props { navigation: NavProp; route: RoutePropType }

const STRIP_DAYS = 14;

/** IST calendar date (YYYY-MM-DD) for today + offset days. */
function istDateKey(offsetDays: number): string {
  const d = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  // en-CA locale formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function SlotPickerScreen({ navigation, route }: Props) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const haptics = useHaptics();
  const qc = useQueryClient();
  const { caProfileId, caName, rescheduleAppointmentId } = route.params;

  const stripDates = useMemo(
    () => Array.from({ length: STRIP_DAYS }).map((_, i) => istDateKey(i)),
    [],
  );
  const [selectedDate, setSelectedDate] = useState<string>(stripDates[0]);
  const [selectedSlot, setSelectedSlot] = useState<AppointmentSlot | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['ca-slots', caProfileId, selectedDate],
    queryFn: () => getCaSlots(caProfileId, selectedDate),
  });

  // Per-day availability for the strip — GET /appointments/slots/day-map
  // (Wave 7 reconciliation; replaces client-side derivation).
  const { data: dayMap } = useQuery({
    queryKey: ['ca-slot-day-map', caProfileId, stripDates[0], stripDates[stripDates.length - 1]],
    queryFn: () =>
      getSlotDayMap(caProfileId, stripDates[0], stripDates[stripDates.length - 1]),
    staleTime: 60_000,
  });

  const days: DateStripDay[] = useMemo(() => {
    const availability = new Map((dayMap ?? []).map((d) => [d.date, d.hasSlots]));
    return stripDates.map((date, i) => ({
      date,
      // Until the day-map arrives, keep days tappable (server is truth).
      hasSlots: availability.get(date) ?? true,
      isToday: i === 0,
    }));
  }, [dayMap, stripDates]);

  const rescheduleMutation = useMutation({
    mutationFn: (slotId: string) =>
      rescheduleAppointment(rescheduleAppointmentId as string, slotId),
    onSuccess: (appt) => {
      haptics.success();
      void qc.invalidateQueries({ queryKey: ['appointments'] });
      void qc.invalidateQueries({ queryKey: ['appointment', rescheduleAppointmentId] });
      navigation.replace('AppointmentConfirmed', {
        appointmentId: appt.appointmentId,
        scheduledAt: appt.scheduledAt,
      });
    },
    onError: () => {
      haptics.error();
      // Server enforces the ≥2h rule — surface the cutoff explanation.
      AccessibilityInfo.announceForAccessibility(t('mobile.ca.appt.cutoffClosed'));
    },
  });

  const handleContinue = () => {
    if (!selectedSlot) return;
    haptics.lightTap();
    if (rescheduleAppointmentId) {
      rescheduleMutation.mutate(selectedSlot.slotId);
      return;
    }
    navigation.navigate('BookingConfirm', {
      caProfileId,
      caName,
      slotId: selectedSlot.slotId,
      startsAt: selectedSlot.startsAt,
      durationMinutes: selectedSlot.durationMinutes,
    });
  };

  const slots = data?.slots ?? [];

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
        <View style={styles.headerMid}>
          <Text style={styles.headerTitle}>
            {rescheduleAppointmentId
              ? t('mobile.ca.slot.rescheduleTitle')
              : t('mobile.ca.slot.title')}
          </Text>
          <Text style={styles.headerSub} numberOfLines={1}>{caName}</Text>
        </View>
        <View style={{ width: 44 }} />
      </View>

      {rescheduleMutation.isError ? (
        <View
          style={styles.cutoffBanner}
          accessibilityLiveRegion="assertive"
          accessibilityRole="alert"
          testID="slot-picker-cutoff-banner"
        >
          <Ionicons name="warning-outline" size={16} color={tokens.warningFg} />
          <Text style={styles.cutoffBannerText}>
            {t('mobile.ca.appt.cutoffClosed')} {t('mobile.ca.appt.cutoffClosedHelp')}
          </Text>
        </View>
      ) : null}

      <DateStrip
        days={days}
        selected={selectedDate}
        onSelect={(date) => {
          setSelectedDate(date);
          setSelectedSlot(null);
        }}
        testID="slot-picker-date-strip"
      />

      {isLoading ? (
        <View style={styles.body}>
          <ListSkeleton variant="card" count={4} cardHeight={48} testID="slot-picker-skeleton" />
        </View>
      ) : error ? (
        <ErrorState
          message={t('mobile.ca.slot.error')}
          retryLabel={t('mobile.common.retry')}
          onRetry={() => void refetch()}
          secondaryLabel={t('mobile.common.goBack')}
          onSecondaryPress={() => navigation.goBack()}
          testID="slot-picker-error"
        />
      ) : slots.length === 0 ? (
        <View style={styles.emptyDay} testID="slot-picker-empty-day">
          <Ionicons name="calendar-outline" size={28} color={tokens.textTertiary} />
          <Text style={styles.emptyDayText}>{t('mobile.ca.slot.empty')}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <SlotGrid
            slots={slots}
            selectedSlotId={selectedSlot?.slotId ?? null}
            onSelect={setSelectedSlot}
            testID="slot-picker-grid"
          />
        </ScrollView>
      )}

      {/* Sticky continue */}
      <View style={styles.footer}>
        <Pressable
          style={[styles.continueBtn, (!selectedSlot || rescheduleMutation.isPending) && styles.continueBtnDisabled]}
          onPress={handleContinue}
          disabled={!selectedSlot || rescheduleMutation.isPending}
          accessibilityRole="button"
          accessibilityLabel={
            rescheduleAppointmentId
              ? t('mobile.ca.slot.confirmReschedule')
              : t('mobile.common.continue')
          }
          accessibilityState={{ disabled: !selectedSlot || rescheduleMutation.isPending }}
          testID="slot-picker-continue"
        >
          {rescheduleMutation.isPending ? (
            <ActivityIndicator size="small" color={tokens.textOnBrand} />
          ) : (
            <Text style={styles.continueBtnText}>
              {rescheduleAppointmentId
                ? t('mobile.ca.slot.confirmReschedule')
                : t('mobile.common.continue')}
            </Text>
          )}
        </Pressable>
      </View>
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
    headerMid: { flex: 1, alignItems: 'center', gap: 2 },
    headerTitle: { fontSize: 17, fontWeight: '700', color: tk.textPrimary },
    headerSub: { fontSize: 12, color: tk.textSecondary },
    cutoffBanner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      backgroundColor: tk.warningTint,
      borderColor: tk.warningTintBorder,
      borderWidth: 1,
      borderRadius: 12,
      padding: 12,
      margin: 16,
      marginBottom: 0,
    },
    cutoffBannerText: { flex: 1, fontSize: 13, color: tk.warningFg, lineHeight: 19 },
    body: { padding: 16, gap: 12 },
    emptyDay: {
      alignItems: 'center',
      gap: 10,
      paddingVertical: 40,
      paddingHorizontal: 24,
    },
    emptyDayText: {
      fontSize: 14,
      color: tk.textSecondary,
      textAlign: 'center',
      lineHeight: 21,
    },
    footer: {
      padding: 16,
      borderTopWidth: 1,
      borderTopColor: tk.border,
      backgroundColor: tk.raised,
    },
    continueBtn: {
      backgroundColor: tk.brandCta,
      borderRadius: 14,
      minHeight: 52,
      alignItems: 'center',
      justifyContent: 'center',
    },
    continueBtnDisabled: { opacity: 0.4 },
    continueBtnText: { fontSize: 16, fontWeight: '700', color: tk.textOnBrand },
  }),
);
