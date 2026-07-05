/**
 * Notification Center Screen — Phase 6E enhancements (DG-NOTIF-05).
 * Spec: docs/design/admin/notifications/notification-center-enhancements.md §4;
 *       docs/design/screens/mobile/notifications-profile.md Screen 47.
 *
 * §4 enhancements implemented:
 *   4.1 Day grouping (Today / Yesterday / This week / date) via SectionList.
 *   4.2 Swipe-to-dismiss (right) + swipe-to-mark-read (left) with undo toast.
 *   4.3 Horizontal category filter chip row + "Unread only" toggle.
 *   4.4 Long-press (500ms) deep-link preview bottom-sheet.
 *   4.5 "Manage preferences" shortcut.
 *   + Pressable rows navigate to the notification's deep-link target.
 *   + "Mark all read" wired to POST /notifications/read-all (was a stub Alert).
 *
 * Contract: matches the Wave 2 backend inbox DTO (status READ|UNREAD, category,
 * deepLinkUrl, linkedEntity*). Dismiss is client-side only (no backend dismiss
 * endpoint) — the row is hidden locally with a 5s undo.
 */

import React, { useMemo, useState, useCallback } from 'react';
import {
  Linking,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { ListSkeleton, EmptyState, ErrorState } from '../../components/shared/ListStates';
import { ImsUndoToast } from '../../components/gst/ImsUndoToast';
import { NotificationRow, type NotifTypeStyle } from '../../components/notifications/NotificationRow';
import {
  NotificationFilterChips,
  type FilterValue,
} from '../../components/notifications/NotificationFilterChips';
import { NotificationPreviewSheet } from '../../components/notifications/NotificationPreviewSheet';
import { groupNotificationsByDay } from '../../notifications/groupByDay';
import { resolveInboxDeepLink } from '../../notifications/inboxDeepLink';
import { useHaptics } from '../../hooks/useHaptics';
import {
  getNotificationInbox,
  markNotificationRead,
  markAllNotificationsRead,
  type InboxNotification,
  type NotificationCategory,
} from '../../api/notifications';
import type { MoreStackParamList } from '../../navigation/MoreStack';

type NavProp = NativeStackNavigationProp<MoreStackParamList, 'NotificationCenter'>;
interface Props { navigation: NavProp }

const INBOX_KEY = ['notifications', 'inbox'] as const;

/** Category → icon + tint. Falls back to a neutral system style. */
function typeStyleFor(
  category: NotificationCategory | null | undefined,
  tk: ThemeTokens,
): NotifTypeStyle {
  switch (category) {
    case 'GST':
      return { icon: 'receipt-outline', color: tk.gstAccent, bg: tk.gstAccent + '18' };
    case 'ITR':
      return { icon: 'document-text-outline', color: tk.itrAccent, bg: tk.itrAccent + '18' };
    case 'DOCS':
      return { icon: 'document-outline', color: tk.brand500, bg: tk.brandTint };
    case 'LOAN':
      return { icon: 'wallet-outline', color: tk.loanAccent, bg: tk.loanAccent + '18' };
    case 'CALLBACK':
      return { icon: 'call-outline', color: tk.brand500, bg: tk.brandTint };
    case 'BILLING':
      return { icon: 'card-outline', color: tk.infoFg, bg: tk.infoTint };
    case 'SYSTEM':
    default:
      return { icon: 'notifications-outline', color: tk.textSecondary, bg: tk.sunken };
  }
}

export function NotificationCenterScreen({ navigation }: Props) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const haptics = useHaptics();
  const qc = useQueryClient();

  // §4.3 filter state.
  const [filter, setFilter] = useState<FilterValue>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);

  // Client-side dismissed ids (no backend dismiss endpoint) + undo target.
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [undoItem, setUndoItem] = useState<InboxNotification | null>(null);

  // §4.4 long-press preview target.
  const [previewItem, setPreviewItem] = useState<InboxNotification | null>(null);

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: [...INBOX_KEY, filter, unreadOnly],
    queryFn: () =>
      getNotificationInbox({
        page: 1,
        pageSize: 50,
        category: filter ?? undefined,
        unreadOnly: unreadOnly || undefined,
      }),
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => {
      haptics.success();
      void qc.invalidateQueries({ queryKey: INBOX_KEY });
    },
  });

  const markAllMutation = useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: () => {
      haptics.success();
      void qc.invalidateQueries({ queryKey: INBOX_KEY });
    },
  });

  const items = useMemo(
    () => (data?.items ?? []).filter((n) => !dismissedIds.has(n.id)),
    [data?.items, dismissedIds],
  );
  const sections = useMemo(() => groupNotificationsByDay(items), [items]);
  const unreadCount = data?.unreadCount ?? 0;

  // §3.3 haptics: pull-to-refresh release → light impact.
  const handleRefresh = useCallback(() => {
    haptics.lightTap();
    void refetch();
  }, [haptics, refetch]);

  // Guarded cross-stack navigate (target may be unmounted for this persona).
  const navigateDeepLink = useCallback(
    (n: InboxNotification) => {
      const intent = resolveInboxDeepLink(n);
      if (!intent) return;
      try {
        if (intent.kind === 'url') {
          void Linking.openURL(intent.url);
        } else {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (navigation.navigate as (...a: any[]) => void)(intent.screen, intent.params);
        }
        // Tapping a notification implicitly reads it.
        if (n.status === 'UNREAD') markReadMutation.mutate(n.id);
      } catch {
        // Target not mounted for this persona — degrade to no-op.
      }
    },
    [navigation, markReadMutation],
  );

  const handleDismiss = useCallback(
    (n: InboxNotification) => {
      haptics.mediumTap();
      setDismissedIds((prev) => new Set(prev).add(n.id));
      setUndoItem(n);
    },
    [haptics],
  );

  const handleUndoDismiss = useCallback(() => {
    if (!undoItem) return;
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.delete(undoItem.id);
      return next;
    });
    setUndoItem(null);
  }, [undoItem]);

  const renderHeaderBar = (
    <View style={styles.header}>
      <Pressable
        onPress={() => navigation.goBack()}
        style={styles.backBtn}
        accessibilityRole="button"
        accessibilityLabel={t('mobile.common.back')}
      >
        <Ionicons name="arrow-back" size={22} color={tokens.textPrimary} />
      </Pressable>
      <View style={styles.titleWrap}>
        <Text style={styles.title}>{t('mobile.notifications.title')}</Text>
        {unreadCount > 0 ? (
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{unreadCount}</Text>
          </View>
        ) : null}
      </View>
      <Pressable
        onPress={() => markAllMutation.mutate()}
        disabled={unreadCount === 0 || markAllMutation.isPending}
        style={styles.markAllBtn}
        accessibilityRole="button"
        accessibilityLabel={t('mobile.notifications.markAll')}
        accessibilityState={{ disabled: unreadCount === 0 }}
      >
        <Text style={[styles.markAll, unreadCount === 0 && styles.markAllDisabled]}>
          {t('mobile.notifications.markAll')}
        </Text>
      </Pressable>
    </View>
  );

  // §4.3 filter bar + §4.5 manage-preferences shortcut + unread toggle.
  const renderFilterBar = (
    <View style={styles.filterBar}>
      <NotificationFilterChips selected={filter} onSelect={setFilter} />
      <View style={styles.filterControls}>
        <View style={styles.unreadToggle}>
          <Text style={styles.unreadToggleLabel}>
            {t('mobile.notifications.filter.unreadOnly')}
          </Text>
          <Switch
            value={unreadOnly}
            onValueChange={(v) => {
              haptics.lightTap();
              setUnreadOnly(v);
            }}
            trackColor={{ true: tokens.brand500, false: tokens.border }}
            accessibilityLabel={t('mobile.notifications.filter.unreadOnly')}
          />
        </View>
        <Pressable
          onPress={() => navigation.navigate('NotificationPreferences')}
          style={styles.manageBtn}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.notifications.managePreferences')}
        >
          <Ionicons name="settings-outline" size={16} color={tokens.brand500} />
          <Text style={styles.manageBtnText}>{t('mobile.notifications.managePreferences')}</Text>
        </Pressable>
      </View>
    </View>
  );

  const previewStyle = typeStyleFor(previewItem?.category, tokens);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {renderHeaderBar}
      {renderFilterBar}

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={handleRefresh}
            tintColor={tokens.brand500}
            colors={[tokens.brand500]}
          />
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionHeaderText}>
              {section.key === 'earlier' && section.dateLabel
                ? section.dateLabel
                : t(`mobile.notifications.group.${section.key}`)}
            </Text>
          </View>
        )}
        renderItem={({ item }) => (
          <NotificationRow
            item={item}
            style={typeStyleFor(item.category, tokens)}
            onPress={() => navigateDeepLink(item)}
            onLongPress={() => {
              haptics.lightTap();
              setPreviewItem(item);
            }}
            onMarkRead={() => markReadMutation.mutate(item.id)}
            onDismiss={() => handleDismiss(item)}
            testID={`notif-row-${item.id}`}
          />
        )}
        ListEmptyComponent={
          isLoading ? (
            <ListSkeleton variant="row" count={7} testID="notif-skeleton" />
          ) : isError ? (
            <ErrorState
              message={t('mobile.notifications.error.loadFailed')}
              retryLabel={t('mobile.common.retry')}
              onRetry={() => void refetch()}
              testID="notif-error-state"
            />
          ) : filter !== null || unreadOnly ? (
            <EmptyState
              icon="funnel-outline"
              title={t('mobile.notifications.empty.title')}
              body={t('mobile.notifications.emptyFiltered.body')}
              ctaLabel={t('mobile.notifications.filter.clear')}
              onCtaPress={() => {
                setFilter(null);
                setUnreadOnly(false);
              }}
              testID="notif-empty-filtered"
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
        contentContainerStyle={items.length === 0 ? styles.emptyContent : undefined}
      />

      {/* §4.4 long-press deep-link preview */}
      <NotificationPreviewSheet
        notification={previewItem}
        icon={previewStyle.icon}
        iconColor={previewStyle.color}
        iconBg={previewStyle.bg}
        breadcrumb={
          previewItem?.deepLinkLabel ?? previewItem?.linkedEntityLabel ?? previewItem?.title
        }
        onOpen={() => {
          if (previewItem) navigateDeepLink(previewItem);
          setPreviewItem(null);
        }}
        onMarkRead={() => {
          if (previewItem) markReadMutation.mutate(previewItem.id);
          setPreviewItem(null);
        }}
        onDismiss={() => {
          if (previewItem) handleDismiss(previewItem);
          setPreviewItem(null);
        }}
        onClose={() => setPreviewItem(null)}
      />

      {/* §4.2 swipe-to-dismiss undo toast */}
      <ImsUndoToast
        visible={undoItem !== null}
        message={t('mobile.notifications.swipe.undo')}
        onUndo={handleUndoDismiss}
        onDismiss={() => setUndoItem(null)}
        testID="notif-undo-toast"
      />
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
    backBtn: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: tk.sunken,
      alignItems: 'center',
      justifyContent: 'center',
    },
    titleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, marginLeft: 12 },
    title: { fontSize: 18, fontWeight: '700', color: tk.textPrimary, letterSpacing: -0.2 },
    countBadge: {
      minWidth: 22,
      height: 22,
      borderRadius: 11,
      paddingHorizontal: 6,
      backgroundColor: tk.brand500,
      alignItems: 'center',
      justifyContent: 'center',
    },
    countBadgeText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
    markAllBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
    markAll: { fontSize: 13, color: tk.brand500, fontWeight: '600' },
    markAllDisabled: { color: tk.textTertiary },
    filterBar: {
      backgroundColor: tk.raised,
      borderBottomWidth: 1,
      borderBottomColor: tk.border,
    },
    filterControls: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingBottom: 10,
    },
    unreadToggle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    unreadToggleLabel: { fontSize: 13, color: tk.textSecondary, fontWeight: '500' },
    manageBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      minHeight: 44,
      paddingHorizontal: 4,
    },
    manageBtnText: { fontSize: 13, color: tk.brand500, fontWeight: '600' },
    sectionHeader: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: tk.sunken,
    },
    sectionHeaderText: {
      fontSize: 12,
      fontWeight: '700',
      color: tk.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    emptyContent: { flexGrow: 1, justifyContent: 'center' },
  }),
);
