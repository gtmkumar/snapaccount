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
import { Colors } from '../../constants/colors';
import { timeAgo } from '../../lib/utils';
import { getDevices, revokeDevice, type DeviceDto } from '../../api/auth';
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
  const { t } = useTranslation();
  const queryClient = useQueryClient();

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

  const revokeMutation = useMutation({
    mutationFn: (id: string) => revokeDevice(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['auth', 'devices'] });
    },
    onError: () => {
      Alert.alert('', t('mobile.auth.devices.revokeError'));
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
            <Ionicons name={platformIcon(item.platform)} size={22} color={Colors.brand[500]} />
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
            <ActivityIndicator size="small" color={Colors.error[600]} />
          ) : (
            <>
              <Ionicons name="log-out-outline" size={16} color={Colors.error[600]} />
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
          <Ionicons name="arrow-back" size={22} color={Colors.neutral[800]} />
        </Pressable>
        <Text style={styles.title}>{t('mobile.auth.devices.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.brand[500]} />
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
            <Text style={styles.subtitle}>{t('mobile.auth.devices.subtitle')}</Text>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.base },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.surface.default,
    borderBottomWidth: 1,
    borderBottomColor: Colors.neutral[100],
  },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.neutral[100], alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: Colors.neutral[900], letterSpacing: -0.2 },
  listContent: { padding: 16, gap: 12 },
  subtitle: { fontSize: 13, color: Colors.neutral[500], marginBottom: 4 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emptyText: { fontSize: 14, color: Colors.neutral[500], textAlign: 'center' },
  retryBtn: { marginTop: 8 },

  deviceCard: { padding: 16, gap: 12 },
  deviceRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  deviceIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.brand[50], alignItems: 'center', justifyContent: 'center' },
  deviceInfo: { flex: 1, gap: 2 },
  deviceNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  deviceName: { fontSize: 15, fontWeight: '700', color: Colors.neutral[900], flexShrink: 1 },
  thisDevicePill: { backgroundColor: Colors.brand[50], paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  thisDeviceText: { fontSize: 11, color: Colors.brand[600], fontWeight: '600' },
  deviceMeta: { fontSize: 12, color: Colors.neutral[500] },
  deviceLastActive: { fontSize: 12, color: Colors.neutral[400], marginTop: 2 },
  deviceStatusCol: { alignItems: 'center' },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusActive: { backgroundColor: Colors.success[500] },
  statusInactive: { backgroundColor: Colors.neutral[300] },

  revokeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.error[200],
    backgroundColor: Colors.error[50],
  },
  revokeText: { fontSize: 14, color: Colors.error[600], fontWeight: '600' },
});
