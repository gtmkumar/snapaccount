/**
 * DeviceDeniedScreen — NEW device blocked (denied / expired).
 * Wave 7A / GAP-047 · wave7-feature-specs.md §4.2 "NEW device — denied".
 * Never a dead end: retry sign-in + assisted-callback support escape.
 */

import React from 'react';
import { Linking } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { ResultScreen } from '../../components/shared/ResultScreen';
import { useAuthStore } from '../../store/authStore';
import type { AuthStackParamList } from '../../navigation/AuthNavigator';

type NavProp = NativeStackNavigationProp<AuthStackParamList, 'DeviceDenied'>;
type RoutePropType = RouteProp<AuthStackParamList, 'DeviceDenied'>;
interface Props { navigation: NavProp; route: RoutePropType }

const SUPPORT_PHONE = 'tel:+918000000000'; // assisted-callback escape

export function DeviceDeniedScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const { cause } = route.params;
  const signOut = useAuthStore((s) => s.signOut);

  const isExpired = cause === 'expired';

  return (
    <ResultScreen
      variant="error"
      title={t('mobile.device.denied.title')}
      subtitle={
        isExpired
          ? t('mobile.device.denied.cause.expired')
          : t('mobile.device.denied.cause.denied')
      }
      detail={t('mobile.device.denied.support')}
      primaryLabel={
        isExpired
          ? t('mobile.device.denied.startAgain')
          : t('mobile.device.denied.retry')
      }
      onPrimary={() => {
        // Drop the held (un-activated) session and restart the sign-in flow.
        signOut();
        navigation.reset({ index: 0, routes: [{ name: 'PhoneEntry' }] });
      }}
      secondaryLabel={t('mobile.device.denied.contactSupport')}
      onSecondary={() => void Linking.openURL(SUPPORT_PHONE)}
      testID="device-denied"
    />
  );
}
