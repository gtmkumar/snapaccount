/**
 * GstNoticeInboxScreen — GST notice inbox with filter tabs, swipe actions, badge count.
 * Phase 6B — docs/design/mobile/gst/notice-inbox-screen.md
 * Deep-link target for notification.gst_notice_received events.
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
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { NoticeRowMobile } from '../../components/shared/NoticeRowMobile';
import { Colors } from '../../constants/colors';
import { useSensitiveScreen } from '../../hooks/usePreventScreenCapture';
import type { GstNoticeStatus } from '../../api/gst';
import { listGstNotices, respondToGstNotice } from '../../api/gst';
import type { GstStackParamList } from '../../navigation/GstStack';

type NavProp = NativeStackNavigationProp<GstStackParamList, 'GstNoticeInbox'>;
type RoutePropType = RouteProp<GstStackParamList, 'GstNoticeInbox'>;

interface Props {
  navigation: NavProp;
  route: RoutePropType;
}

const FILTER_TABS: { key: GstNoticeStatus | 'All'; label: string }[] = [
  { key: 'All', label: 'All' },
  { key: 'Open', label: 'Open' },
  { key: 'Overdue', label: 'Overdue' },
  { key: 'Responded', label: 'Responded' },
  { key: 'Closed', label: 'Closed' },
];

export function GstNoticeInboxScreen({ navigation, route }: Props) {
  useSensitiveScreen();
  const { t } = useTranslation();
  const { orgId } = route.params;
  const qc = useQueryClient();
  const [activeFilter, setActiveFilter] = useState<GstNoticeStatus | 'All'>('All');

  const { data, isLoading, isRefetching, refetch, error } = useQuery({
    queryKey: ['gst-notices', orgId, activeFilter],
    queryFn: () =>
      listGstNotices({
        orgId,
        status: activeFilter === 'All' ? undefined : activeFilter,
        page: 1,
        pageSize: 50,
      }),
  });

  const respondMutation = useMutation({
    mutationFn: ({ id, userId }: { id: string; userId: string }) =>
      respondToGstNotice(id, { noticeId: id, respondedByUserId: userId }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['gst-notices', orgId] });
    },
  });

  const notices = data?.items ?? [];
  const openCount = notices.filter((n) => n.status === 'Open' || n.status === 'Overdue').length;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          accessibilityLabel={t('mobile.common.back')}
          hitSlop={8}
        >
          <Ionicons name="arrow-back" size={22} color={Colors.neutral[800]} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{t('mobile.gst.notices.title')}</Text>
          {openCount > 0 && (
            <View style={styles.badgeWrap}>
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
              onPress={() => setActiveFilter(tab.key as GstNoticeStatus | 'All')}
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

      {/* Body */}
      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.gst} />
          <Text style={styles.loadingText}>{t('mobile.gst.notices.loading')}</Text>
        </View>
      ) : error ? (
        <View style={styles.errorWrap}>
          <Ionicons name="alert-circle-outline" size={40} color={Colors.error[400]} />
          <Text style={styles.errorText}>{t('mobile.gst.notices.error')}</Text>
          <Pressable style={styles.retryBtn} onPress={() => void refetch()}>
            <Text style={styles.retryText}>{t('mobile.gst.notices.retry')}</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />
          }
          showsVerticalScrollIndicator={false}
        >
          {notices.length === 0 ? (
            <View style={styles.emptyWrap}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="document-text-outline" size={40} color={Colors.gst} />
              </View>
              <Text style={styles.emptyTitle}>{t('mobile.gst.notices.emptyTitle')}</Text>
              <Text style={styles.emptyText}>{t('mobile.gst.notices.emptyBody')}</Text>
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
                description={notice.description}
                onPress={() =>
                  navigation.navigate('GstNoticeDetail', { noticeId: notice.id })
                }
                onMarkRead={
                  notice.status === 'Open'
                    ? () => respondMutation.mutate({ id: notice.id, userId: '' })
                    : undefined
                }
                archiveGated={notice.status === 'Open' || notice.status === 'Overdue'}
                testID={`notice-row-${notice.id}`}
              />
            ))
          )}
        </ScrollView>
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
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.neutral[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.neutral[900],
    letterSpacing: -0.2,
  },
  badgeWrap: {
    backgroundColor: Colors.error[500],
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  tabsContainer: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.neutral[100],
    backgroundColor: Colors.surface.default,
    maxHeight: 52,
  },
  tabsRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    alignItems: 'center',
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.neutral[100],
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: {
    backgroundColor: Colors.gst,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.neutral[600],
  },
  tabTextActive: {
    color: '#FFFFFF',
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 14,
    color: Colors.neutral[500],
  },
  errorWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 24,
  },
  errorText: {
    fontSize: 15,
    color: Colors.neutral[600],
    textAlign: 'center',
  },
  retryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: Colors.gst,
    borderRadius: 12,
    minHeight: 44,
  },
  retryText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  listContent: {
    padding: 16,
    gap: 2,
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    gap: 12,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: Colors.gst + '12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.neutral[800],
  },
  emptyText: {
    fontSize: 14,
    color: Colors.neutral[500],
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 24,
  },
});
