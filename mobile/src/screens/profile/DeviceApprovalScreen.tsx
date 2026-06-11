/**
 * DeviceApprovalScreen — OLD device approves/denies a NEW device sign-in.
 * Wave 7A / GAP-047 · wave7-feature-specs.md §4.2 "OLD device — approval".
 *
 * - Modal, focus-trapped feel: no casual dismiss — explicit Approve / Deny /
 *   "Decide later".
 * - DeviceMetaCard (model/OS · approximate location · IST time) + live 10-min
 *   ApprovalCountdown (milestone announcements only).
 * - Deny is framed as the safe choice ("Didn't try to sign in?").
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  findNodeHandle,
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
import * as Device from 'expo-device';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { ListSkeleton, ErrorState } from '../../components/shared/ListStates';
import { DeviceMetaCard } from '../../components/auth/DeviceMetaCard';
import { ApprovalCountdown } from '../../components/auth/ApprovalCountdown';
import { useHaptics } from '../../hooks/useHaptics';
import {
  approveDeviceRequest,
  denyDeviceRequest,
  findReviewingDeviceEntityId,
  getDeviceApprovalRequest,
} from '../../api/auth';
import type { MoreStackParamList } from '../../navigation/MoreStack';

type NavProp = NativeStackNavigationProp<MoreStackParamList, 'DeviceApproval'>;
type RoutePropType = RouteProp<MoreStackParamList, 'DeviceApproval'>;
interface Props { navigation: NavProp; route: RoutePropType }

type Outcome = 'approved' | 'denied' | 'expired' | null;

export function DeviceApprovalScreen({ navigation, route }: Props) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const haptics = useHaptics();
  const qc = useQueryClient();
  const { requestId } = route.params;
  const [outcome, setOutcome] = useState<Outcome>(null);
  const headlineRef = useRef<Text>(null);

  const { data: request, isLoading, error, refetch } = useQuery({
    queryKey: ['device-approval', requestId],
    queryFn: () => getDeviceApprovalRequest(requestId),
  });

  // Security-critical modal: AT focus lands on the headline first (spec §4.5).
  useEffect(() => {
    const timer = setTimeout(() => {
      const node = findNodeHandle(headlineRef.current);
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  // The landed contract requires the REVIEWING (this/old) device's entity id
  // in approve/deny bodies — it must belong to the caller and differ from the
  // new device. Resolved best-effort from GET /auth/devices.
  const resolveReviewerId = async (): Promise<string> => {
    const reviewerId = await findReviewingDeviceEntityId(
      Device.modelId ?? '',
      request?.newDeviceId,
    );
    if (!reviewerId) throw new Error('DeviceApproval.NoReviewingDevice');
    return reviewerId;
  };

  const approveMutation = useMutation({
    mutationFn: async () => approveDeviceRequest(requestId, await resolveReviewerId()),
    onSuccess: () => {
      haptics.success();
      setOutcome('approved');
      void qc.invalidateQueries({ queryKey: ['device-approval'] });
    },
    onError: () => haptics.error(),
  });

  const denyMutation = useMutation({
    mutationFn: async () => denyDeviceRequest(requestId, await resolveReviewerId()),
    onSuccess: () => {
      haptics.warning();
      setOutcome('denied');
      void qc.invalidateQueries({ queryKey: ['device-approval'] });
    },
    onError: () => haptics.error(),
  });

  const busy = approveMutation.isPending || denyMutation.isPending;

  // Outcome views
  if (outcome === 'approved') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.outcomeWrap} accessibilityLiveRegion="polite">
          <View style={[styles.outcomeIcon, { backgroundColor: tokens.successTint }]}>
            <Ionicons name="checkmark-circle" size={48} color={tokens.successFg} />
          </View>
          <Text style={styles.outcomeTitle}>{t('mobile.device.approval.approved')}</Text>
          <Pressable
            style={styles.primaryBtn}
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel={t('mobile.common.done')}
            testID="device-approval-done"
          >
            <Text style={styles.primaryBtnText}>{t('mobile.common.done')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (outcome === 'denied') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.outcomeWrap} accessibilityLiveRegion="polite">
          <View style={[styles.outcomeIcon, { backgroundColor: tokens.errorTint }]}>
            <Ionicons name="shield-checkmark" size={48} color={tokens.errorFg} />
          </View>
          <Text style={styles.outcomeTitle}>{t('mobile.device.approval.denied')}</Text>
          <Text style={styles.outcomeBody}>{t('mobile.device.approval.deniedBody')}</Text>
          <Pressable
            style={styles.primaryBtn}
            onPress={() => navigation.replace('Devices')}
            accessibilityRole="button"
            accessibilityLabel={t('mobile.device.approval.secure')}
            testID="device-approval-review-devices"
          >
            <Text style={styles.primaryBtnText}>{t('mobile.device.approval.secure')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.shieldWrap}>
          <Ionicons name="shield-half-outline" size={40} color={tokens.warningFg} />
        </View>
        <Text ref={headlineRef} style={styles.headline} accessibilityRole="header">
          {t('mobile.device.approval.title')}
        </Text>
        <Text style={styles.subhead}>{t('mobile.device.approval.body')}</Text>

        {isLoading ? (
          <ListSkeleton variant="card" count={1} cardHeight={140} testID="device-approval-skeleton" />
        ) : error ? (
          <ErrorState
            message={t('mobile.device.approval.loadError')}
            retryLabel={t('mobile.common.retry')}
            onRetry={() => void refetch()}
            secondaryLabel={t('mobile.common.goBack')}
            onSecondaryPress={() => navigation.goBack()}
            testID="device-approval-error"
          />
        ) : outcome === 'expired' || !request ? (
          /* `request === null` ⇒ no longer in the pending list — resolved on
             another device or expired (no per-id status endpoint; residual). */
          <View style={styles.expiredWrap} accessibilityLiveRegion="polite" testID="device-approval-expired">
            <Text style={styles.expiredText}>{t('mobile.device.countdown.expired')}</Text>
            <Pressable
              style={styles.laterBtn}
              onPress={() => navigation.goBack()}
              accessibilityRole="button"
              accessibilityLabel={t('mobile.common.close')}
            >
              <Text style={styles.laterBtnText}>{t('mobile.common.close')}</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <DeviceMetaCard
              model={request.deviceModel}
              os={request.deviceOs}
              cityApprox={request.cityApprox}
              time={request.requestedAt}
            />
            <ApprovalCountdown
              expiresAt={request.expiresAt}
              onExpire={() => setOutcome('expired')}
            />
            <Text style={styles.denyHint}>{t('mobile.device.approval.denyHint')}</Text>

            <Pressable
              style={[styles.approveBtn, busy && styles.btnDisabled]}
              onPress={() => approveMutation.mutate()}
              disabled={busy}
              accessibilityRole="button"
              // Consequence in the label (spec §4.5).
              accessibilityLabel={t('mobile.device.approval.approveA11y', {
                model: request.deviceModel ?? t('mobile.device.meta.unknown'),
              })}
              accessibilityState={{ disabled: busy }}
              testID="device-approval-approve"
            >
              {approveMutation.isPending ? (
                <ActivityIndicator size="small" color={tokens.textOnBrand} />
              ) : (
                <>
                  <Ionicons name="checkmark" size={18} color={tokens.textOnBrand} />
                  <Text style={styles.approveBtnText}>
                    {t('mobile.device.approval.approve')}
                  </Text>
                </>
              )}
            </Pressable>
            <Pressable
              style={[styles.denyBtn, busy && styles.btnDisabled]}
              onPress={() => denyMutation.mutate()}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel={t('mobile.device.approval.denyA11y')}
              accessibilityState={{ disabled: busy }}
              testID="device-approval-deny"
            >
              {denyMutation.isPending ? (
                <ActivityIndicator size="small" color={tokens.errorFg} />
              ) : (
                <>
                  <Ionicons name="close" size={18} color={tokens.errorFg} />
                  <Text style={styles.denyBtnText}>{t('mobile.device.approval.deny')}</Text>
                </>
              )}
            </Pressable>
            <Pressable
              style={styles.laterBtn}
              onPress={() => navigation.goBack()}
              accessibilityRole="button"
              accessibilityLabel={t('mobile.device.approval.later')}
              testID="device-approval-later"
            >
              <Text style={styles.laterBtnText}>{t('mobile.device.approval.later')}</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: tk.canvas },
    scrollContent: { padding: 24, gap: 16 },
    shieldWrap: {
      width: 72,
      height: 72,
      borderRadius: 20,
      backgroundColor: tk.warningTint,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
    },
    headline: {
      fontSize: 22,
      fontWeight: '800',
      color: tk.textPrimary,
      textAlign: 'center',
      letterSpacing: -0.3,
    },
    subhead: {
      fontSize: 14,
      color: tk.textSecondary,
      textAlign: 'center',
      lineHeight: 21,
    },
    denyHint: {
      fontSize: 13,
      color: tk.textSecondary,
      textAlign: 'center',
      lineHeight: 19,
    },
    approveBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: tk.brandCta,
      borderRadius: 14,
      minHeight: 52,
    },
    approveBtnText: { fontSize: 16, fontWeight: '700', color: tk.textOnBrand },
    denyBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: tk.errorTint,
      borderWidth: 1,
      borderColor: tk.errorTintBorder,
      borderRadius: 14,
      minHeight: 52,
    },
    denyBtnText: { fontSize: 16, fontWeight: '700', color: tk.errorFg },
    btnDisabled: { opacity: 0.5 },
    laterBtn: {
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    laterBtnText: { fontSize: 14, fontWeight: '600', color: tk.textSecondary },
    expiredWrap: { gap: 12, alignItems: 'center', paddingVertical: 16 },
    expiredText: { fontSize: 15, fontWeight: '600', color: tk.errorFg, textAlign: 'center' },
    outcomeWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      gap: 16,
    },
    outcomeIcon: {
      width: 96,
      height: 96,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    outcomeTitle: {
      fontSize: 22,
      fontWeight: '800',
      color: tk.textPrimary,
      textAlign: 'center',
    },
    outcomeBody: {
      fontSize: 14,
      color: tk.textSecondary,
      textAlign: 'center',
      lineHeight: 21,
    },
    primaryBtn: {
      backgroundColor: tk.brandCta,
      borderRadius: 14,
      minHeight: 52,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'stretch',
    },
    primaryBtnText: { fontSize: 16, fontWeight: '700', color: tk.textOnBrand },
  }),
);
