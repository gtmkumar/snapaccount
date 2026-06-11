/**
 * AppointmentConfirmedScreen — booking success (Wave 7A / GAP-031).
 * ResultScreen success variant: "You're booked" + IST date/time + reminder
 * expectation (30 min and 5 min push reminders).
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { ResultScreen } from '../../components/shared/ResultScreen';
import { formatIstDate, formatIstTime } from '../../lib/ist';
import type { ChatStackParamList } from '../../navigation/ChatStack';

type NavProp = NativeStackNavigationProp<ChatStackParamList, 'AppointmentConfirmed'>;
type RoutePropType = RouteProp<ChatStackParamList, 'AppointmentConfirmed'>;
interface Props { navigation: NavProp; route: RoutePropType }

export function AppointmentConfirmedScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const { appointmentId, scheduledAt } = route.params;

  return (
    <ResultScreen
      variant="success"
      title={t('mobile.ca.confirmed.title')}
      subtitle={t('mobile.ca.confirmed.subtitle', {
        date: formatIstDate(scheduledAt),
        time: `${formatIstTime(scheduledAt)} IST`,
      })}
      detail={t('mobile.ca.confirmed.reminderNote')}
      primaryLabel={t('mobile.ca.confirmed.viewAppointment')}
      onPrimary={() => navigation.replace('AppointmentDetail', { appointmentId })}
      secondaryLabel={t('mobile.common.done')}
      onSecondary={() => navigation.popToTop()}
      testID="appointment-confirmed"
    />
  );
}
