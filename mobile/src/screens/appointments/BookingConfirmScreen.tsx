/**
 * BookingConfirmScreen — topic + optional notes + confirm (Wave 7A / GAP-031).
 * Read-only summary (CA, IST date/time, duration, channel) + required topic.
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { useHaptics } from '../../hooks/useHaptics';
import { formatIstDate, formatIstTime } from '../../lib/ist';
import { bookAppointment, type ConsultTopic } from '../../api/appointments';
import type { ChatStackParamList } from '../../navigation/ChatStack';

type NavProp = NativeStackNavigationProp<ChatStackParamList, 'BookingConfirm'>;
type RoutePropType = RouteProp<ChatStackParamList, 'BookingConfirm'>;
interface Props { navigation: NavProp; route: RoutePropType }

const NOTES_MAX_LENGTH = 500;

const TOPICS: { key: ConsultTopic; i18nKey: string }[] = [
  { key: 'ACCOUNTING', i18nKey: 'mobile.ca.confirm.topic.accounting' },
  { key: 'GST', i18nKey: 'mobile.ca.confirm.topic.gst' },
  { key: 'ITR', i18nKey: 'mobile.ca.confirm.topic.itr' },
  { key: 'LOAN', i18nKey: 'mobile.ca.confirm.topic.loan' },
  { key: 'OTHER', i18nKey: 'mobile.ca.confirm.topic.other' },
];

export function BookingConfirmScreen({ navigation, route }: Props) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const haptics = useHaptics();
  const qc = useQueryClient();
  const { caProfileId, caName, slotId, startsAt, durationMinutes } = route.params;

  const [topic, setTopic] = useState<ConsultTopic | null>(null);
  const [notes, setNotes] = useState('');

  const bookMutation = useMutation({
    mutationFn: () =>
      bookAppointment({
        caProfileId,
        slotId,
        topic: topic as ConsultTopic,
        notes: notes.trim() || undefined,
      }),
    onSuccess: (appt) => {
      haptics.success();
      void qc.invalidateQueries({ queryKey: ['appointments'] });
      navigation.replace('AppointmentConfirmed', {
        appointmentId: appt.appointmentId,
        scheduledAt: appt.scheduledAt,
      });
    },
    onError: () => haptics.error(),
  });

  const summary = [
    { label: t('mobile.ca.confirm.ca'), value: caName },
    { label: t('mobile.ca.confirm.date'), value: formatIstDate(startsAt) },
    { label: t('mobile.ca.confirm.time'), value: `${formatIstTime(startsAt)} IST` },
    {
      label: t('mobile.ca.confirm.duration'),
      value: t('mobile.ca.confirm.durationValue', { minutes: durationMinutes }),
    },
    { label: t('mobile.ca.confirm.channel'), value: t('mobile.ca.confirm.channelValue') },
  ];

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
        <Text style={styles.headerTitle}>{t('mobile.ca.confirm.title')}</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {/* Read-only summary */}
        <View style={styles.summaryCard}>
          {summary.map((row) => (
            <View key={row.label} style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>{row.label}</Text>
              <Text style={styles.summaryValue}>{row.value}</Text>
            </View>
          ))}
        </View>

        {/* Required topic */}
        <Text style={styles.sectionLabel}>{t('mobile.ca.confirm.topicLabel')}</Text>
        <View style={styles.topicRow}>
          {TOPICS.map((item) => {
            const active = topic === item.key;
            return (
              <Pressable
                key={item.key}
                style={[styles.topicChip, active && styles.topicChipActive]}
                onPress={() => {
                  haptics.lightTap();
                  setTopic(item.key);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={t(item.i18nKey)}
                testID={`booking-topic-${item.key}`}
              >
                <Text style={[styles.topicChipText, active && styles.topicChipTextActive]}>
                  {t(item.i18nKey)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Optional notes */}
        <Text style={styles.sectionLabel}>{t('mobile.ca.confirm.notesLabel')}</Text>
        <TextInput
          style={styles.notesInput}
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={4}
          maxLength={NOTES_MAX_LENGTH}
          placeholder={t('mobile.ca.confirm.notesPlaceholder')}
          placeholderTextColor={tokens.textTertiary}
          accessibilityLabel={t('mobile.ca.confirm.notesLabel')}
          testID="booking-notes-input"
        />
        <Text style={styles.counter}>
          {notes.length}/{NOTES_MAX_LENGTH}
        </Text>

        {bookMutation.isError ? (
          <Text
            style={styles.errorText}
            accessibilityLiveRegion="assertive"
            testID="booking-error"
          >
            {t('mobile.ca.confirm.error')}
          </Text>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={[styles.confirmBtn, (!topic || bookMutation.isPending) && styles.confirmBtnDisabled]}
          onPress={() => bookMutation.mutate()}
          disabled={!topic || bookMutation.isPending}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.ca.confirm.submit')}
          accessibilityState={{ disabled: !topic || bookMutation.isPending }}
          testID="booking-confirm-submit"
        >
          {bookMutation.isPending ? (
            <ActivityIndicator size="small" color={tokens.textOnBrand} />
          ) : (
            <Text style={styles.confirmBtnText}>{t('mobile.ca.confirm.submit')}</Text>
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
    headerTitle: { fontSize: 17, fontWeight: '700', color: tk.textPrimary },
    body: { padding: 16, gap: 12 },
    summaryCard: {
      backgroundColor: tk.raised,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: tk.border,
      overflow: 'hidden',
    },
    summaryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 13,
      minHeight: 48,
      borderBottomWidth: 1,
      borderBottomColor: tk.border,
    },
    summaryLabel: { fontSize: 13, color: tk.textSecondary, flex: 1 },
    summaryValue: {
      fontSize: 13,
      fontWeight: '600',
      color: tk.textPrimary,
      flex: 1.4,
      textAlign: 'right',
    },
    sectionLabel: {
      fontSize: 14,
      fontWeight: '700',
      color: tk.textPrimary,
      marginTop: 6,
    },
    topicRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    topicChip: {
      minHeight: 44,
      paddingHorizontal: 16,
      borderRadius: 20,
      backgroundColor: tk.sunken,
      borderWidth: 1,
      borderColor: tk.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    topicChipActive: {
      backgroundColor: tk.brand500,
      borderColor: tk.brand500,
    },
    topicChipText: { fontSize: 13, fontWeight: '600', color: tk.textSecondary },
    topicChipTextActive: { color: tk.textOnBrand },
    notesInput: {
      borderWidth: 1.5,
      borderColor: tk.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingTop: 12,
      fontSize: 15,
      color: tk.textPrimary,
      backgroundColor: tk.inputBg,
      minHeight: 100,
      textAlignVertical: 'top',
    },
    counter: { fontSize: 11, color: tk.textTertiary, textAlign: 'right' },
    errorText: { fontSize: 13, color: tk.errorFg },
    footer: {
      padding: 16,
      borderTopWidth: 1,
      borderTopColor: tk.border,
      backgroundColor: tk.raised,
    },
    confirmBtn: {
      backgroundColor: tk.brandCta,
      borderRadius: 14,
      minHeight: 52,
      alignItems: 'center',
      justifyContent: 'center',
    },
    confirmBtnDisabled: { opacity: 0.4 },
    confirmBtnText: { fontSize: 16, fontWeight: '700', color: tk.textOnBrand },
  }),
);
