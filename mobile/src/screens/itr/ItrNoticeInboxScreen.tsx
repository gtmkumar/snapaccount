/**
 * ItrNoticeInboxScreen — ITR notice inbox, parallel pattern to GstNoticeInboxScreen.
 * Phase 6D — docs/design/mobile/itr/notice-inbox-and-detail-screens.md
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
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
import { NoticeRowMobile } from '../../components/shared/NoticeRowMobile';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { useSensitiveScreen } from '../../hooks/usePreventScreenCapture';
import { apiClient } from '../../lib/api';
import type { ItrNotice, ItrNoticeStatus } from '../../api/itr';
import type { ItrStackParamList } from '../../navigation/ItrStack';

type NavProp = NativeStackNavigationProp<ItrStackParamList, 'ItrNoticeInbox'>;
type RoutePropType = RouteProp<ItrStackParamList, 'ItrNoticeInbox'>;

interface Props {
  navigation: NavProp;
  route: RoutePropType;
}

const FILTER_TABS: { key: ItrNoticeStatus | 'All'; label: string }[] = [
  { key: 'All', label: 'All' },
  { key: 'Open', label: 'Open' },
  { key: 'Overdue', label: 'Overdue' },
  { key: 'Responded', label: 'Responded' },
  { key: 'Closed', label: 'Closed' },
];

export function ItrNoticeInboxScreen({ navigation, route }: Props) {
  const { tokens } = useTheme();
  const styles = useStyles();
  useSensitiveScreen();
  const { t } = useTranslation();
  const { filingId } = route.params;
  const [activeFilter, setActiveFilter] = useState<ItrNoticeStatus | 'All'>('All');

  const { data: notices = [], isLoading, refetch, isRefetching, error } = useQuery<ItrNotice[]>({
    queryKey: ['itr-notices', filingId, activeFilter],
    queryFn: async () => {
      const res = await apiClient.get<{ items: ItrNotice[] }>(`/itr/filings/${filingId}/notices`, {
        params: { status: activeFilter === 'All' ? undefined : activeFilter },
      });
      return res.data.items;
    },
    placeholderData: [],
  });

  const openCount = notices.filter(
    (n) => n.status === 'Open' || n.status === 'Overdue',
  ).length;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={8}
          accessibilityLabel={t('mobile.common.back')}>
          <Ionicons name="arrow-back" size={22} color={tokens.textPrimary} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{t('mobile.itr.notices.title')}</Text>
          {openCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{openCount}</Text>
            </View>
          )}
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Filter tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsRow}
        style={styles.tabsContainer}
      >
        {FILTER_TABS.map((tab) => {
          const isActive = activeFilter === tab.key;
          return (
            <Pressable
              key={tab.key}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => setActiveFilter(tab.key as ItrNoticeStatus | 'All')}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
            >
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={tokens.itrAccent} />
        </View>
      ) : error ? (
        <View style={styles.errorWrap}>
          <Ionicons name="alert-circle-outline" size={40} color={tokens.errorFg} />
          <Text style={styles.errorText}>{t('mobile.itr.notices.error')}</Text>
          <Pressable style={styles.retryBtn} onPress={() => void refetch()}>
            <Text style={styles.retryText}>{t('mobile.common.retry')}</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
          showsVerticalScrollIndicator={false}
        >
          {notices.length === 0 ? (
            <View style={styles.emptyWrap}>
              <View style={styles.emptyIcon}>
                <Ionicons name="mail-outline" size={40} color={tokens.itrAccent} />
              </View>
              <Text style={styles.emptyTitle}>{t('mobile.itr.notices.emptyTitle')}</Text>
              <Text style={styles.emptyText}>{t('mobile.itr.notices.emptyBody')}</Text>
            </View>
          ) : (
            notices.map((notice) => (
              <NoticeRowMobile
                key={notice.id}
                id={notice.id}
                noticeNumber={notice.noticeNumber}
                noticeType={notice.noticeType}
                status={notice.status}
                issuedDate={notice.issuedDate}
                dueDate={notice.dueDate}
                onPress={() =>
                  navigation.navigate('ItrNoticeDetail', { noticeId: notice.id, filingId })
                }
                archiveGated={notice.status === 'Open' || notice.status === 'Overdue'}
                testID={`itr-notice-${notice.id}`}
              />
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: tk.canvas },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: tk.raised, borderBottomWidth: 1, borderBottomColor: tk.border,
  },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: tk.sunken, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: tk.textPrimary },
  badge: { backgroundColor: tk.errorCta, borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeText: { fontSize: 11, fontWeight: '800', color: '#FFFFFF' }, // white on errorCta, AA both modes

  tabsContainer: { borderBottomWidth: 1, borderBottomColor: tk.border, backgroundColor: tk.raised, maxHeight: 52 },
  tabsRow: { paddingHorizontal: 16, paddingVertical: 10, gap: 8, alignItems: 'center' },
  tab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: tk.sunken, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  tabActive: { backgroundColor: tk.itrAccent },
  tabText: { fontSize: 13, fontWeight: '600', color: tk.textSecondary },
  tabTextActive: { color: tk.textOnBrand },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  errorText: { fontSize: 15, color: tk.textSecondary, textAlign: 'center' },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 12, backgroundColor: tk.itrAccent, borderRadius: 12, minHeight: 44 },
  retryText: { fontSize: 14, fontWeight: '700', color: tk.textOnBrand },

  listContent: { padding: 16, gap: 2 },
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 12 },
  emptyIcon: { width: 72, height: 72, borderRadius: 20, backgroundColor: tk.itrAccent + '12', alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: tk.textPrimary },
  emptyText: { fontSize: 14, color: tk.textSecondary, textAlign: 'center', lineHeight: 22, paddingHorizontal: 24 },
  }),
);
