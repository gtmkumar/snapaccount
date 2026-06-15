/**
 * Notification Center Screen — Redesign 2026
 */

import React from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { ListSkeleton, EmptyState, ErrorState } from '../../components/shared/ListStates';
import { useHaptics } from '../../hooks/useHaptics';
import { timeAgo } from '../../lib/utils';
import apiClient from '../../lib/api';
import type { MoreStackParamList } from '../../navigation/MoreStack';

type NavProp = NativeStackNavigationProp<MoreStackParamList, 'NotificationCenter'>;
interface Props { navigation: NavProp }

interface AppNotification {
  id: string;
  title?: string;
  body: string;
  /** eventCode from server maps to type for display */
  eventCode?: string;
  type: 'gst' | 'itr' | 'document' | 'loan' | 'chat' | 'callback' | 'system';
  /** status from server — 'Read' means read */
  status?: string;
  read: boolean;
  createdAt: string;
  sentAt?: string;
}

const typeConfigFor = (tk: ThemeTokens): Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }> => ({
  gst: { icon: 'receipt-outline', color: tk.gstAccent, bg: tk.gstAccent + '12' },
  itr: { icon: 'document-text-outline', color: tk.itrAccent, bg: tk.itrAccent + '12' },
  document: { icon: 'document-outline', color: tk.brand500, bg: tk.brandTint },
  loan: { icon: 'wallet-outline', color: tk.loanAccent, bg: tk.loanAccent + '12' },
  chat: { icon: 'chatbubbles-outline', color: tk.successFg, bg: tk.successTint },
  system: { icon: 'settings-outline', color: tk.textSecondary, bg: tk.sunken },
  callback: { icon: 'call-outline', color: tk.brand500, bg: tk.brandTint },
});

export function NotificationCenterScreen({ navigation }: Props) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const haptics = useHaptics();
  const { data: notifications = [], isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['notifications', 'inbox'],
    queryFn: async () => {
      const res = await apiClient.get<{ items: AppNotification[]; totalCount: number; unreadCount: number }>(
        '/notifications/inbox',
        { params: { page: 1, pageSize: 50 } },
      );
      return res.data.items ?? [];
    },
  });

  // §3.3 haptics map: pull-to-refresh release → light impact.
  const handleRefresh = () => {
    haptics.lightTap();
    void refetch();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.common.back')}
        >
          <Ionicons name="arrow-back" size={22} color={tokens.textPrimary} />
        </Pressable>
        <Text style={styles.title}>{t('mobile.notifications.title')}</Text>
        <Pressable
          onPress={() => Alert.alert(t('mobile.common.comingSoon'), t('mobile.notifications.markAllSoon'))}
          style={styles.markAllBtn}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.notifications.markAll')}
        >
          <Text style={styles.markAll}>{t('mobile.notifications.markAll')}</Text>
        </Pressable>
      </View>

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={handleRefresh}
            tintColor={tokens.brand500}
            colors={[tokens.brand500]}
          />
        }
        renderItem={({ item }) => {
          const typeConfig = typeConfigFor(tokens);
          const cfg = typeConfig[item.type] ?? typeConfig.system;
          return (
            <View style={[styles.notifItem, !(item.read || item.status === 'Read') && styles.notifUnread]}>
              <View style={[styles.notifIcon, { backgroundColor: cfg.bg }]}>
                <Ionicons name={cfg.icon} size={20} color={cfg.color} />
                {!(item.read || item.status === 'Read') && <View style={styles.unreadDot} />}
              </View>
              <View style={styles.notifContent}>
                <Text style={styles.notifTitle}>{item.title}</Text>
                <Text style={styles.notifBody} numberOfLines={2}>{item.body}</Text>
                <Text style={styles.notifTime}>{timeAgo(item.createdAt)}</Text>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          isLoading ? (
            // §3.1: row-shaped skeleton matching notification rows
            <ListSkeleton variant="row" count={7} testID="notif-skeleton" />
          ) : isError ? (
            <ErrorState
              message={t('mobile.notifications.error.loadFailed')}
              retryLabel={t('mobile.common.retry')}
              onRetry={() => void refetch()}
              testID="notif-error-state"
            />
          ) : (
            <EmptyState
              icon="notifications-outline"
              title={t('mobile.notifications.empty.title')}
              body={t('mobile.notifications.empty.body')}
              testID="notif-empty-state"
            />
          )
        }
      />
    </SafeAreaView>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: tk.canvas },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: tk.raised, borderBottomWidth: 1, borderBottomColor: tk.border },
  backBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: tk.sunken, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: tk.textPrimary, letterSpacing: -0.2 },
  markAllBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  markAll: { fontSize: 13, color: tk.brand500, fontWeight: '600' },
  notifItem: { flexDirection: 'row', padding: 16, borderBottomWidth: 1, borderBottomColor: tk.border, gap: 12 },
  notifUnread: { backgroundColor: tk.brandTint + '40' },
  notifIcon: { position: 'relative', width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  unreadDot: { position: 'absolute', top: 0, right: 0, width: 10, height: 10, borderRadius: 5, backgroundColor: tk.brand500, borderWidth: 2, borderColor: tk.raised },
  notifContent: { flex: 1 },
  notifTitle: { fontSize: 14, fontWeight: '600', color: tk.textPrimary, marginBottom: 4 },
  notifBody: { fontSize: 13, color: tk.textSecondary, lineHeight: 18 },
  notifTime: { fontSize: 11, color: tk.textTertiary, marginTop: 6 },
  }),
);
