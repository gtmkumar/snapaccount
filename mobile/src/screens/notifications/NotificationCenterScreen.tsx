/**
 * Notification Center Screen — Redesign 2026
 */

import React from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
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

const TYPE_CONFIG: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }> = {
  gst: { icon: 'receipt-outline', color: Colors.gst, bg: Colors.gst + '12' },
  itr: { icon: 'document-text-outline', color: Colors.itr, bg: Colors.itr + '12' },
  document: { icon: 'document-outline', color: Colors.brand[500], bg: Colors.brand[50] },
  loan: { icon: 'wallet-outline', color: Colors.loan, bg: Colors.loan + '12' },
  chat: { icon: 'chatbubbles-outline', color: Colors.success[500], bg: Colors.success[50] },
  system: { icon: 'settings-outline', color: Colors.neutral[500], bg: Colors.neutral[100] },
  callback: { icon: 'call-outline', color: Colors.brand[500], bg: Colors.brand[50] },
};

export function NotificationCenterScreen({ navigation }: Props) {
  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications', 'inbox'],
    queryFn: async () => {
      const res = await apiClient.get<{ items: AppNotification[]; totalCount: number; unreadCount: number }>(
        '/notifications/inbox',
        { params: { page: 1, pageSize: 50 } },
      );
      return res.data.items ?? [];
    },
    placeholderData: [],
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.neutral[800]} />
        </Pressable>
        <Text style={styles.title}>Notifications</Text>
        <Pressable onPress={() => Alert.alert('Coming Soon', 'Mark all read coming soon.')} style={styles.markAllBtn}>
          <Text style={styles.markAll}>Mark all read</Text>
        </Pressable>
      </View>

      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const cfg = TYPE_CONFIG[item.type] ?? TYPE_CONFIG.system;
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
          !isLoading ? (
            <View style={styles.empty}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="notifications-outline" size={36} color={Colors.neutral[300]} />
              </View>
              <Text style={styles.emptyTitle}>No notifications yet</Text>
              <Text style={styles.emptyText}>
                GST deadlines, document updates, and expert chat messages will appear here.
              </Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.base },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.surface.default, borderBottomWidth: 1, borderBottomColor: Colors.neutral[100] },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.neutral[100], alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: Colors.neutral[900], letterSpacing: -0.2 },
  markAllBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  markAll: { fontSize: 13, color: Colors.brand[500], fontWeight: '600' },
  notifItem: { flexDirection: 'row', padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.neutral[100], gap: 12 },
  notifUnread: { backgroundColor: Colors.brand[50] + '40' },
  notifIcon: { position: 'relative', width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  unreadDot: { position: 'absolute', top: 0, right: 0, width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.brand[500], borderWidth: 2, borderColor: Colors.neutral[0] },
  notifContent: { flex: 1 },
  notifTitle: { fontSize: 14, fontWeight: '600', color: Colors.neutral[900], marginBottom: 4 },
  notifBody: { fontSize: 13, color: Colors.neutral[600], lineHeight: 18 },
  notifTime: { fontSize: 11, color: Colors.neutral[400], marginTop: 6 },
  empty: { alignItems: 'center', padding: 48, gap: 12 },
  emptyIconWrap: { width: 64, height: 64, borderRadius: 18, backgroundColor: Colors.neutral[100], alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.neutral[800] },
  emptyText: { fontSize: 14, color: Colors.neutral[500], textAlign: 'center', lineHeight: 22 },
});
