/**
 * Logged-in Devices Screen
 * Lists the devices currently bound to the user's account (GET /auth/devices) and
 * lets the user revoke any session (DELETE /auth/devices/{id}).
 *
 * Reachable from Profile → "Manage Devices".
 */

import React from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Device from 'expo-device';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { timeAgo } from '../../lib/utils';
import { formatIstDateTime } from '../../lib/ist';
import {
  getDevices,
  listPendingDeviceApprovals,
  revokeDevice,
  type DeviceApprovalRequest,
  type DeviceDto,
} from '../../api/auth';
import type { MoreStackParamList } from '../../navigation/MoreStack';

type NavProp = NativeStackNavigationProp<MoreStackParamList, 'Devices'>;
interface Props { navigation: NavProp }

function platformIcon(platform: string): React.ComponentProps<typeof Ionicons>['name'] {
  const p = platform.toLowerCase();
  if (p.includes('ios') || p.includes('apple')) return 'logo-apple';
  if (p.includes('android')) return 'logo-android';
  if (p.includes('web')) return 'globe-outline';
  return 'phone-portrait-outline';
}

export function DevicesScreen({ navigation }: Props) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  // Wave 7A (GAP-047): soft-launch notify-only banner dismissal (session-local).
  const [dismissedNotices, setDismissedNotices] = React.useState<string[]>([]);

  const {
    data: devices = [],
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useQuery<DeviceDto[]>({
    queryKey: ['auth', 'devices'],
    queryFn: getDevices,
  });

  // Wave 7A (GAP-047): pending approval requests for this (old) device.
  // ENFORCE rows are actionable (→ DeviceApprovalScreen); NOTIFY rows render
  // the soft-launch info banner only (no gate, no approve/deny).
  const { data: approvalRequests = [] } = useQuery<DeviceApprovalRequest[]>({
    queryKey: ['auth', 'device-approvals', 'pending'],
    queryFn: listPendingDeviceApprovals,
  });

  // Mode is server-side config (DeviceApproval:Enforce); the pending-approvals
  // DTO does not carry it per-request — treat every pending request as
  // actionable. The NOTIFY_ONLY branch ships forward-compatible for when the
  // flag is surfaced on this DTO (the NEW device already reads it from
  // GET /auth/devices/my-approval-status — Wave 7 recon).
  const enforceRequests = approvalRequests.filter(
    (r) => r.status === 'PENDING' && r.mode !== 'NOTIFY_ONLY',
  );
  const notifyRequests = approvalRequests.filter(
    (r) => r.mode === 'NOTIFY_ONLY' && !dismissedNotices.includes(r.requestId),
  );

  const revokeMutation = useMutation({
    mutationFn: (id: string) => revokeDevice(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['auth', 'devices'] });
      const previous = queryClient.getQueryData<DeviceDto[]>(['auth', 'devices']);
      queryClient.setQueryData<DeviceDto[]>(['auth', 'devices'], (old) =>
        old?.filter((d) => d.id !== id),
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(['auth', 'devices'], context.previous);
      Alert.alert('', t('mobile.auth.devices.revokeError'));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['auth', 'devices'] });
    },
  });

  // Best-effort match for "this device" so we can label it (never auto-revoked here).
  const thisModelId = Device.modelId ?? '';

  const confirmRevoke = (device: DeviceDto) => {
    Alert.alert(
      t('mobile.auth.devices.revokeTitle'),
      t('mobile.auth.devices.revokeBody'),
      [
        { text: t('mobile.common.cancel'), style: 'cancel' },
        {
          text: t('mobile.auth.devices.revokeConfirm'),
          style: 'destructive',
          onPress: () => revokeMutation.mutate(device.id),
        },
      ],
    );
  };

  const renderItem = ({ item }: { item: DeviceDto }) => {
    const isThisDevice = Boolean(thisModelId) && item.deviceId === thisModelId;
    const isRevoking = revokeMutation.isPending && revokeMutation.variables === item.id;
    const lastActive = item.lastActiveAt
      ? t('mobile.auth.devices.lastActive', { when: timeAgo(item.lastActiveAt) })
      : t('mobile.auth.devices.boundAt', { when: timeAgo(item.boundAt) });

    return (
      <Card shadow="sm" style={styles.deviceCard}>
        <View style={styles.deviceRow}>
          <View style={styles.deviceIcon}>
            <Ionicons name={platformIcon(item.platform)} size={22} color={tokens.brand500} />
          </View>
          <View style={styles.deviceInfo}>
            <View style={styles.deviceNameRow}>
              <Text style={styles.deviceName} numberOfLines={1}>
                {item.deviceName || item.platform}
              </Text>
              {isThisDevice && (
                <View style={styles.thisDevicePill}>
                  <Text style={styles.thisDeviceText}>{t('mobile.auth.devices.thisDevice')}</Text>
                </View>
              )}
            </View>
            <Text style={styles.deviceMeta} numberOfLines={1}>
              {item.platform}
              {item.osVersion ? ` · ${item.osVersion}` : ''}
              {item.appVersion ? ` · v${item.appVersion}` : ''}
            </Text>
            <Text style={styles.deviceLastActive}>{lastActive}</Text>
          </View>
          <View style={styles.deviceStatusCol}>
            <View style={[styles.statusDot, item.isActive ? styles.statusActive : styles.statusInactive]} />
          </View>
        </View>

        <Pressable
          style={styles.revokeBtn}
          onPress={() => confirmRevoke(item)}
          disabled={isRevoking}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.auth.devices.revoke')}
        >
          {isRevoking ? (
            <ActivityIndicator size="small" color={tokens.errorFg} />
          ) : (
            <>
              <Ionicons name="log-out-outline" size={16} color={tokens.errorFg} />
              <Text style={styles.revokeText}>{t('mobile.auth.devices.revoke')}</Text>
            </>
          )}
        </Pressable>
      </Card>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel={t('mobile.common.back')}>
          <Ionicons name="arrow-back" size={22} color={tokens.textPrimary} />
        </Pressable>
        <Text style={styles.title}>{t('mobile.auth.devices.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={tokens.brand500} />
        </View>
      ) : isError ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>{t('mobile.auth.common.loadError')}</Text>
          <Button label={t('mobile.common.retry')} variant="secondary" onPress={() => refetch()} style={styles.retryBtn} />
        </View>
      ) : (
        <FlatList
          data={devices}
          keyExtractor={(d) => d.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View style={styles.listHeader}>
              {/* GAP-047: pending ENFORCE approval requests (actionable) */}
              {enforceRequests.map((req) => (
                <Pressable
                  key={req.requestId}
                  style={styles.approvalCard}
                  onPress={() =>
                    navigation.navigate('DeviceApproval', { requestId: req.requestId })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={t('mobile.device.pendingCardA11y', {
                    model: req.deviceModel ?? t('mobile.device.meta.unknown'),
                  })}
                  testID={`device-approval-pending-${req.requestId}`}
                >
                  <Ionicons name="shield-half-outline" size={20} color={tokens.warningFg} />
                  <View style={styles.approvalCardBody}>
                    <Text style={styles.approvalCardTitle}>
                      {t('mobile.device.pendingCardTitle')}
                    </Text>
                    <Text style={styles.approvalCardMeta} numberOfLines={2}>
                      {[req.deviceModel, req.cityApprox].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={tokens.warningFg} />
                </Pressable>
              ))}

              {/* GAP-047 soft-launch: notify-only banner (dismissible, no gate) */}
              {notifyRequests.map((req) => (
                <View
                  key={req.requestId}
                  style={styles.noticeBanner}
                  accessibilityLiveRegion="polite"
                  testID={`device-signin-notice-${req.requestId}`}
                >
                  <Ionicons name="information-circle-outline" size={18} color={tokens.infoFg} />
                  <Text style={styles.noticeBannerText}>
                    {t('mobile.device.softLaunchBanner', {
                      model: req.deviceModel ?? t('mobile.device.meta.unknown'),
                      location: req.cityApprox ?? t('mobile.device.meta.unknown'),
                      time: formatIstDateTime(req.requestedAt),
                    })}
                  </Text>
                  <Pressable
                    onPress={() =>
                      setDismissedNotices((prev) => [...prev, req.requestId])
                    }
                    accessibilityRole="button"
                    accessibilityLabel={t('mobile.common.close')}
                    style={styles.noticeDismiss}
                    hitSlop={6}
                    testID={`device-signin-notice-dismiss-${req.requestId}`}
                  >
                    <Ionicons name="close" size={16} color={tokens.infoFg} />
                  </Pressable>
                </View>
              ))}

              <Text style={styles.subtitle}>{t('mobile.auth.devices.subtitle')}</Text>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyText}>{t('mobile.auth.devices.empty')}</Text>
            </View>
          }
          refreshing={isRefetching}
          onRefresh={refetch}
        />
      )}
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
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: tk.sunken, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: tk.textPrimary, letterSpacing: -0.2 },
  listContent: { padding: 16, gap: 12 },
  listHeader: { gap: 10 },
  subtitle: { fontSize: 13, color: tk.textSecondary, marginBottom: 4 },
  // GAP-047: pending approval card + soft-launch notice banner
  approvalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: tk.warningTint,
    borderColor: tk.warningTintBorder,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    minHeight: 56,
  },
  approvalCardBody: { flex: 1, gap: 2 },
  approvalCardTitle: { fontSize: 14, fontWeight: '700', color: tk.warningFg },
  approvalCardMeta: { fontSize: 12, color: tk.warningFg, lineHeight: 17 },
  noticeBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: tk.infoTint,
    borderRadius: 12,
    padding: 12,
  },
  noticeBannerText: { flex: 1, fontSize: 12, color: tk.infoFg, lineHeight: 18 },
  noticeDismiss: {
    width: 44,
    height: 44,
    marginTop: -12,
    marginRight: -8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emptyText: { fontSize: 14, color: tk.textSecondary, textAlign: 'center' },
  retryBtn: { marginTop: 8 },

  deviceCard: { padding: 16, gap: 12 },
  deviceRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  deviceIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: tk.brandTint, alignItems: 'center', justifyContent: 'center' },
  deviceInfo: { flex: 1, gap: 2 },
  deviceNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  deviceName: { fontSize: 15, fontWeight: '700', color: tk.textPrimary, flexShrink: 1 },
  thisDevicePill: { backgroundColor: tk.brandTint, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  thisDeviceText: { fontSize: 11, color: tk.brandCta, fontWeight: '600' },
  deviceMeta: { fontSize: 12, color: tk.textSecondary },
  deviceLastActive: { fontSize: 12, color: tk.textTertiary, marginTop: 2 },
  deviceStatusCol: { alignItems: 'center' },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusActive: { backgroundColor: tk.successFg },
  statusInactive: { backgroundColor: tk.border },

  revokeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: tk.errorTintBorder,
    backgroundColor: tk.errorTint,
  },
  revokeText: { fontSize: 14, color: tk.errorFg, fontWeight: '600' },
  }),
);
