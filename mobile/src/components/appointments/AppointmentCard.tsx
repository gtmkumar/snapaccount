/**
 * AppointmentCard — row for MyAppointments (Upcoming / Past tabs).
 * Wave 7 / GAP-031 · component-library.md "Wave 7 Additions".
 *
 * Composition: avatar + CA name + topic tag + IST date/time + status badge +
 * one context CTA (Join / Manage / Rate / read-only stars).
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { formatIstDate, formatIstTime } from '../../lib/ist';
import { StarRatingInput } from '../shared/StarRatingInput';
import type { Appointment, AppointmentStatus } from '../../api/appointments';

// Appointment StatusBadge map — component-library.md "Wave 7 Additions",
// reconciled to the server enum (DRAFT/CONFIRMED/COMPLETED/CANCELLED/NO_SHOW,
// migration 080). Semantic re-use of existing tint scales; never colour-only.
function statusVisual(
  status: AppointmentStatus,
  tk: ThemeTokens,
): { bg: string; fg: string; icon: React.ComponentProps<typeof Ionicons>['name'] } {
  switch (status) {
    case 'DRAFT':
      return { bg: tk.warningTint, fg: tk.warningFg, icon: 'time-outline' };
    case 'CONFIRMED':
      return { bg: tk.infoTint, fg: tk.infoFg, icon: 'calendar-outline' };
    case 'COMPLETED':
      return { bg: tk.successTint, fg: tk.successFg, icon: 'checkmark-circle-outline' };
    case 'CANCELLED':
      return { bg: tk.sunken, fg: tk.textSecondary, icon: 'close-circle-outline' };
    case 'NO_SHOW':
      return { bg: tk.errorTint, fg: tk.errorFg, icon: 'person-remove-outline' };
  }
}

export function appointmentStatusKey(status: AppointmentStatus): string {
  switch (status) {
    case 'DRAFT':
      return 'mobile.ca.status.requested';
    case 'CONFIRMED':
      return 'mobile.ca.status.confirmed';
    case 'COMPLETED':
      return 'mobile.ca.status.completed';
    case 'CANCELLED':
      return 'mobile.ca.status.cancelled';
    case 'NO_SHOW':
      return 'mobile.ca.status.noShow';
  }
}

interface AppointmentCardProps {
  appointment: Appointment;
  /** Upcoming & inside the join window. */
  canJoin?: boolean;
  onJoin?: () => void;
  /** Upcoming, outside join window → manage (detail). */
  onManage?: () => void;
  /** Past, not yet rated. */
  onRate?: () => void;
  testID?: string;
}

export function AppointmentCard({
  appointment,
  canJoin = false,
  onJoin,
  onManage,
  onRate,
  testID,
}: AppointmentCardProps) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const visual = statusVisual(appointment.status, tokens);
  const statusLabel = t(appointmentStatusKey(appointment.status));
  const dateLine = `${formatIstDate(appointment.scheduledAt)} · ${formatIstTime(appointment.scheduledAt)} IST`;
  const isRated = appointment.rating != null && appointment.rating > 0;
  const tid = testID ?? `appointment-card-${appointment.appointmentId}`;

  return (
    <Pressable
      style={styles.card}
      onPress={onManage}
      accessibilityRole="button"
      accessibilityLabel={t('mobile.ca.appts.cardA11y', {
        caName: appointment.caName,
        date: dateLine,
        status: statusLabel,
      })}
      testID={tid}
    >
      <View style={styles.topRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {appointment.caName.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.mid}>
          <Text style={styles.caName} numberOfLines={1}>
            {appointment.caName}
          </Text>
          <Text style={styles.dateLine}>{dateLine}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: visual.bg }]}>
          <Ionicons name={visual.icon} size={12} color={visual.fg} />
          <Text style={[styles.statusText, { color: visual.fg }]}>{statusLabel}</Text>
        </View>
      </View>

      <View style={styles.bottomRow}>
        {/* Topic is a first-class list-DTO field since migration 086 —
            null on legacy rows; render when present. */}
        {appointment.topic ? (
          <View style={styles.topicTag}>
            <Text style={styles.topicTagText}>
              {t(`mobile.ca.confirm.topic.${appointment.topic.toLowerCase()}`)}
            </Text>
          </View>
        ) : null}
        <View style={styles.spacer} />
        {canJoin && onJoin ? (
          <Pressable
            style={styles.joinBtn}
            onPress={onJoin}
            accessibilityRole="button"
            accessibilityLabel={t('mobile.ca.appt.joinA11y', { caName: appointment.caName })}
            testID={`${tid}-join`}
          >
            <Ionicons name="videocam" size={16} color={tokens.textOnBrand} />
            <Text style={styles.joinBtnText}>{t('mobile.ca.appt.join')}</Text>
          </Pressable>
        ) : onRate && !isRated ? (
          <Pressable
            style={styles.rateBtn}
            onPress={onRate}
            accessibilityRole="button"
            accessibilityLabel={t('mobile.ca.rating.cta')}
            testID={`${tid}-rate`}
          >
            <Ionicons name="star-outline" size={16} color={tokens.brandFg} />
            <Text style={styles.rateBtnText}>{t('mobile.ca.rating.cta')}</Text>
          </Pressable>
        ) : isRated ? (
          <StarRatingInput
            value={appointment.rating ?? 0}
            onChange={() => undefined}
            readOnly
            size={44}
            testID={`${tid}-stars`}
          />
        ) : onManage ? (
          <View style={styles.manageHint}>
            <Text style={styles.manageHintText}>{t('mobile.ca.appt.manage')}</Text>
            <Ionicons name="chevron-forward" size={14} color={tokens.textTertiary} />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
    card: {
      backgroundColor: tk.raised,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: tk.border,
      padding: 14,
      gap: 12,
      marginBottom: 10,
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: tk.brand500,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: { color: tk.textOnBrand, fontSize: 16, fontWeight: '700' },
    mid: { flex: 1, gap: 2 },
    caName: { fontSize: 15, fontWeight: '700', color: tk.textPrimary },
    dateLine: { fontSize: 12, color: tk.textSecondary },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
      minWidth: 64,
      justifyContent: 'center',
    },
    statusText: { fontSize: 11, fontWeight: '700', flexShrink: 1 },
    bottomRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    topicTag: {
      backgroundColor: tk.sunken,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
    },
    topicTagText: { fontSize: 11, fontWeight: '600', color: tk.textSecondary },
    spacer: { flex: 1 },
    joinBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: tk.brandCta,
      borderRadius: 12,
      minHeight: 44,
      paddingHorizontal: 16,
    },
    joinBtnText: { fontSize: 14, fontWeight: '700', color: tk.textOnBrand },
    rateBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: tk.brandTint,
      borderRadius: 12,
      minHeight: 44,
      paddingHorizontal: 16,
    },
    rateBtnText: { fontSize: 14, fontWeight: '700', color: tk.brandFg },
    manageHint: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      minHeight: 44,
      paddingHorizontal: 4,
    },
    manageHintText: { fontSize: 13, fontWeight: '600', color: tk.textSecondary },
  }),
);
