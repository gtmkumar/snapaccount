/**
 * GstNoticeInboxScreen — GST notice inbox with filter tabs, swipe actions, badge count.
 * Phase 6B — docs/design/mobile/gst/notice-inbox-screen.md
 * Deep-link target for notification.gst_notice_received events.
 */

import React, { useState } from 'react';
import {
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
import { ListSkeleton, ErrorState } from '../../components/shared/ListStates';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { useHaptics } from '../../hooks/useHaptics';
import { useSensitiveScreen } from '../../hooks/usePreventScreenCapture';
import type { GstNoticeStatus } from '../../api/gst';
import { listGstNotices, respondToGstNotice } from '../../api/gst';
import { isNoticeOverdue, isNoticeSettled } from '../../lib/noticeStatus';
import type { GstStackParamList } from '../../navigation/GstStack';

type NavProp = NativeStackNavigationProp<GstStackParamList, 'GstNoticeInbox'>;
type RoutePropType = RouteProp<GstStackParamList, 'GstNoticeInbox'>;

interface Props {
  navigation: NavProp;
  route: RoutePropType;
}

/**
 * Filter vocabulary = canonical server statuses + two client-side views:
 * "All" (no status param) and "Overdue" (derived — deadline passed and not
 * RESPONDED/CLOSED; never sent to the server).
 */
type NoticeFilter = GstNoticeStatus | 'All' | 'Overdue';

const FILTER_TABS: { key: NoticeFilter; labelKey: string }[] = [
  { key: 'All', labelKey: 'mobile.gst.notices.filter.all' },
  { key: 'RECEIVED', labelKey: 'mobile.gst.notices.filter.received' },
  { key: 'UNDER_REVIEW', labelKey: 'mobile.gst.notices.filter.underReview' },
  { key: 'Overdue', labelKey: 'mobile.gst.notices.filter.overdue' },
  { key: 'RESPONDED', labelKey: 'mobile.gst.notices.filter.responded' },
  { key: 'CLOSED', labelKey: 'mobile.gst.notices.filter.closed' },
];

export function GstNoticeInboxScreen({ navigation, route }: Props) {
  const { tokens } = useTheme();
  const styles = useStyles();
  useSensitiveScreen();
  const { t } = useTranslation();
  const haptics = useHaptics();
  const { orgId } = route.params;
  const qc = useQueryClient();
  const [activeFilter, setActiveFilter] = useState<NoticeFilter>('All');

  // "Overdue" is a client-side derived filter — fetch unfiltered, then
  // narrow locally. Only canonical statuses are ever sent as a status param.
  const serverStatus: GstNoticeStatus | undefined =
    activeFilter === 'All' || activeFilter === 'Overdue' ? undefined : activeFilter;

  const { data, isLoading, isRefetching, refetch, error } = useQuery({
    queryKey: ['gst-notices', orgId, activeFilter],
    queryFn: () =>
      listGstNotices({
        orgId,
        status: serverStatus,
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

  const fetched = data?.items ?? [];
  const notices =
    activeFilter === 'Overdue'
      ? fetched.filter((n) =>
          isNoticeOverdue(n.status, n.statutoryDeadline ?? n.dueDate),
        )
      : fetched;
  const openCount = fetched.filter((n) => !isNoticeSettled(n.status)).length;

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
          <Ionicons name="arrow-back" size={22} color={tokens.textPrimary} />
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
              onPress={() => setActiveFilter(tab.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
            >
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
                {t(tab.labelKey)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Body */}
      {isLoading ? (
        // §3.1: shaped skeleton matching notice rows
        <View style={styles.listContent}>
          <ListSkeleton variant="card" count={6} cardHeight={96} testID="gst-notices-skeleton" />
        </View>
      ) : error ? (
        <ErrorState
          message={t('mobile.gst.notices.error')}
          retryLabel={t('mobile.gst.notices.retry')}
          onRetry={() => void refetch()}
          secondaryLabel={t('mobile.common.goBack')}
          onSecondaryPress={() => navigation.goBack()}
          testID="gst-notices-error-state"
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => {
                haptics.lightTap();
                void refetch();
              }}
              tintColor={tokens.brand500}
              colors={[tokens.brand500]}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {notices.length === 0 ? (
            <View style={styles.emptyWrap}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="document-text-outline" size={40} color={tokens.gstAccent} />
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
                // Wave 7B/7C (GAP-108): taxonomy badge + statutory deadline + GSTAT stage
                formType={notice.formType}
                statutoryDeadline={notice.statutoryDeadline}
                gstatStage={notice.appealStage}
                onPress={() =>
                  navigation.navigate('GstNoticeDetail', { noticeId: notice.id })
                }
                onMarkRead={
                  !isNoticeSettled(notice.status)
                    ? () => respondMutation.mutate({ id: notice.id, userId: '' })
                    : undefined
                }
                archiveGated={!isNoticeSettled(notice.status)}
                testID={`notice-row-${notice.id}`}
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: tk.raised,
    borderBottomWidth: 1,
    borderBottomColor: tk.border,
  },
  // P6-QA-MOBILE-04: 44×44pt minimum touch target (was 40×40).
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: tk.sunken,
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
    color: tk.textPrimary,
    letterSpacing: -0.2,
  },
  badgeWrap: {
    backgroundColor: tk.errorCta,
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
    color: '#FFFFFF', // white on errorCta, AA both modes
  },
  tabsContainer: {
    borderBottomWidth: 1,
    borderBottomColor: tk.border,
    backgroundColor: tk.raised,
    // P6-QA-MOBILE-04: fits the 44pt tabs + 10pt vertical padding (was 52).
    maxHeight: 66,
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
    backgroundColor: tk.sunken,
    // P6-QA-MOBILE-04: 44pt minimum touch target (was 36).
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: {
    backgroundColor: tk.gstAccent,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: tk.textSecondary,
  },
  tabTextActive: {
    color: tk.textOnBrand,
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
    backgroundColor: tk.gstAccent + '12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: tk.textPrimary,
  },
  emptyText: {
    fontSize: 14,
    color: tk.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 24,
  },
  }),
);
