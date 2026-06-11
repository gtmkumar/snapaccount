/**
 * DeviceWaitingScreen — NEW device waits for approval from an old device.
 * Wave 7A / GAP-047 · wave7-feature-specs.md §4.2 "NEW device — waiting".
 *
 * Polls GET /auth/devices/my-approval-status (Wave 7 reconciliation — real
 * verdict, no more pending-list-disappearance heuristic):
 *  - APPROVED → markAuthenticated() (the session token was already stored via
 *    setSession in the OTP step).
 *  - DENIED → DeviceDeniedScreen (denied); EXPIRED → DeviceDeniedScreen (expired).
 *  - mode NOTIFY_ONLY (soft-launch, spec §4.2) → no gate/countdown: proceed
 *    straight in; old devices get the info banner + notify-only push.
 * The pending-approvals lookup is kept as a one-shot metadata echo (model/OS/
 * time) only. Includes the assisted-callback escape for users who no longer
 * have the old device (a11y equivalent-path rule).
 */

import React, { useEffect, useRef } from 'react';
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
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { DeviceMetaCard } from '../../components/auth/DeviceMetaCard';
import { ApprovalCountdown } from '../../components/auth/ApprovalCountdown';
import { useHaptics } from '../../hooks/useHaptics';
import { useAuthStore } from '../../store/authStore';
import { getDeviceApprovalRequest, getMyApprovalStatus } from '../../api/auth';
import type { AuthStackParamList } from '../../navigation/AuthNavigator';

type NavProp = NativeStackNavigationProp<AuthStackParamList, 'DeviceWaiting'>;
type RoutePropType = RouteProp<AuthStackParamList, 'DeviceWaiting'>;
interface Props { navigation: NavProp; route: RoutePropType }

const SUPPORT_PHONE = 'tel:+918000000000'; // assisted-callback escape (CallbackService IVR)

export function DeviceWaitingScreen({ navigation, route }: Props) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const haptics = useHaptics();
  const { requestId } = route.params;
  const markAuthenticated = useAuthStore((s) => s.markAuthenticated);
  const settledRef = useRef(false);

  // Real verdict poll — GET /auth/devices/my-approval-status (Wave 7 recon).
  const { data: approval } = useQuery({
    queryKey: ['device-approval-status', requestId],
    queryFn: getMyApprovalStatus,
    refetchInterval: 3000,
  });

  // One-shot metadata echo for the "this device" card (model/OS/time) —
  // display only, never used to decide the verdict.
  const { data: request } = useQuery({
    queryKey: ['device-approval-meta', requestId],
    queryFn: () => getDeviceApprovalRequest(requestId),
    staleTime: Infinity,
  });

  useEffect(() => {
    if (settledRef.current || !approval) return;
    // Soft-launch (NOTIFY_ONLY): never gate the login — proceed straight in
    // (spec §4.2); old devices get the notify-only push + info banner instead.
    if (approval.mode === 'NOTIFY_ONLY') {
      settledRef.current = true;
      markAuthenticated(); // RootNavigator swaps to the app
      return;
    }
    switch (approval.status) {
      case 'APPROVED':
        settledRef.current = true;
        haptics.success();
        markAuthenticated(); // RootNavigator swaps to the app
        break;
      case 'DENIED':
        settledRef.current = true;
        navigation.replace('DeviceDenied', { cause: 'denied' });
        break;
      case 'EXPIRED':
        settledRef.current = true;
        navigation.replace('DeviceDenied', { cause: 'expired' });
        break;
      default:
        // PENDING / UNKNOWN — keep waiting; the countdown handles local expiry.
        break;
    }
  }, [approval, haptics, markAuthenticated, navigation]);

  const expiresAt = approval?.expiresAt ?? request?.expiresAt ?? null;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.illustration}>
          <Ionicons name="phone-portrait-outline" size={34} color={tokens.brand500} />
          <Ionicons name="arrow-forward" size={20} color={tokens.textTertiary} />
          <Ionicons name="phone-portrait" size={34} color={tokens.brand500} />
        </View>
        <Text style={styles.headline} accessibilityRole="header">
          {t('mobile.device.waiting.title')}
        </Text>
        <Text style={styles.body}>{t('mobile.device.waiting.body')}</Text>

        {expiresAt ? (
          <ApprovalCountdown
            expiresAt={expiresAt}
            onExpire={() => {
              if (!settledRef.current) {
                settledRef.current = true;
                navigation.replace('DeviceDenied', { cause: 'expired' });
              }
            }}
          />
        ) : (
          <View style={styles.spinnerWrap}>
            <ActivityIndicator color={tokens.brand500} testID="device-waiting-spinner" />
          </View>
        )}

        {request ? (
          <>
            {/* Echo the metadata the old device sees (trust, spec §4.2). */}
            <Text style={styles.metaCaption}>{t('mobile.device.waiting.thisDevice')}</Text>
            <DeviceMetaCard
              model={request.deviceModel}
              os={request.deviceOs}
              cityApprox={request.cityApprox}
              time={request.requestedAt}
            />
          </>
        ) : null}

        {/* NOTE: resend-push is product-gated (TL decision pending) — the
            spec's "Resend request" affordance is omitted, not stubbed. */}

        {/* Assisted escape — users who lost the old device (a11y §3). */}
        <Pressable
          style={styles.escapeBtn}
          onPress={() => void Linking.openURL(SUPPORT_PHONE)}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.device.waiting.otherWay')}
          testID="device-waiting-escape"
        >
          <Ionicons name="call-outline" size={16} color={tokens.textSecondary} />
          <Text style={styles.escapeBtnText}>{t('mobile.device.waiting.otherWay')}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: tk.canvas },
    scrollContent: { padding: 24, gap: 16, flexGrow: 1, justifyContent: 'center' },
    illustration: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
    },
    headline: {
      fontSize: 22,
      fontWeight: '800',
      color: tk.textPrimary,
      textAlign: 'center',
      letterSpacing: -0.3,
    },
    body: {
      fontSize: 14,
      color: tk.textSecondary,
      textAlign: 'center',
      lineHeight: 21,
    },
    metaCaption: {
      fontSize: 12,
      fontWeight: '600',
      color: tk.textSecondary,
      marginTop: 4,
    },
    spinnerWrap: { paddingVertical: 24, alignItems: 'center' },
    secondaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      minHeight: 48,
      borderRadius: 12,
      backgroundColor: tk.brandTint,
    },
    secondaryBtnText: { fontSize: 14, fontWeight: '700', color: tk.brandFg },
    btnDisabled: { opacity: 0.5 },
    escapeBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      minHeight: 44,
    },
    escapeBtnText: { fontSize: 13, fontWeight: '600', color: tk.textSecondary },
  }),
);
