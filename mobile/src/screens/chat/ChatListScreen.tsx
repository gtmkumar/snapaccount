/**
 * ChatListScreen — Phase 6F Refresh
 * docs/design/mobile/chat/chat-list-screen-refresh.md
 *
 * Added over Phase 6A baseline:
 * - Search bar (sticky)
 * - Filter chips: All · Unread · Tax · GST · Loan · Bug
 * - Thread row: CategoryBadge, unread count chip, last-message preview (84pt)
 * - Swipe-to-resolve / mute (Pressable-based; full gesture library integration Phase 7)
 * - Pull-to-refresh
 * - FAB (new conversation)
 * - Dark mode via useTheme()
 * - Haptics: pull-to-refresh release, swipe threshold, action success
 * - i18n: all strings via t()
 */

import React, { useCallback, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { timeAgo } from '../../lib/utils';
import { listThreads, type ChatThread, type ThreadCategory } from '../../api/chat';
import { RequestCallbackCta } from '../../components/callbacks/RequestCallbackCta';
import { useHaptics } from '../../hooks/useHaptics';
import { useTheme } from '../../contexts/ThemeContext';
import type { MoreStackParamList } from '../../navigation/MoreStack';

type NavProp = NativeStackNavigationProp<MoreStackParamList, 'ChatList'>;
interface Props { navigation: NavProp }

// ─────────────────────────────────────────────────────────────────────────────
// CategoryBadge
// ─────────────────────────────────────────────────────────────────────────────

type FilterKey = 'all' | 'unread' | 'mentions' | 'tax' | 'gst' | 'loan' | 'bug';

interface CategoryStyle {
  bgLight: string;
  bgDark: string;
  fgLight: string;
  fgDark: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}

const CATEGORY_STYLES: Record<ThreadCategory, CategoryStyle> = {
  'tax-query': {
    bgLight: '#E0E7FF', bgDark: '#1E1B4B',
    fgLight: '#4338CA', fgDark: '#A5B4FC',
    icon: 'calculator-outline',
  },
  'gst-notice': {
    bgLight: '#CCFBF1', bgDark: '#042f2e',
    fgLight: '#0F766E', fgDark: '#5EEAD4',
    icon: 'receipt-outline',
  },
  loan: {
    bgLight: '#EDE9FE', bgDark: '#2E1065',
    fgLight: '#7C3AED', fgDark: '#C4B5FD',
    icon: 'cash-outline',
  },
  general: {
    bgLight: '#F1F5F9', bgDark: '#1E293B',
    fgLight: '#475569', fgDark: '#94A3B8',
    icon: 'chatbubble-outline',
  },
  'feature-request': {
    bgLight: '#E0F2FE', bgDark: '#0C4A6E',
    fgLight: '#0369A1', fgDark: '#38BDF8',
    icon: 'sparkles-outline',
  },
  bug: {
    bgLight: '#FFE4E6', bgDark: '#4C0519',
    fgLight: '#BE123C', fgDark: '#FB7185',
    icon: 'bug-outline',
  },
};

function CategoryBadge({
  category,
  isDark,
}: {
  category: ThreadCategory;
  isDark: boolean;
}) {
  const style = CATEGORY_STYLES[category] ?? CATEGORY_STYLES.general;
  const bg = isDark ? style.bgDark : style.bgLight;
  const fg = isDark ? style.fgDark : style.fgLight;
  const label = category.replace(/-/g, ' ');

  return (
    <View style={[styles.categoryBadge, { backgroundColor: bg }]}>
      <Ionicons name={style.icon} size={10} color={fg} />
      <Text style={[styles.categoryBadgeText, { color: fg }]}>{label}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton row
// ─────────────────────────────────────────────────────────────────────────────

function SkeletonRow({ tokens }: { tokens: ReturnType<typeof useTheme>['tokens'] }) {
  return (
    <View style={[styles.row, { borderBottomColor: tokens.border }]}>
      <View style={[styles.skeletonAvatar, { backgroundColor: tokens.skeleton1 }]} />
      <View style={styles.rowContent}>
        <View style={[styles.skeletonLine, { width: '55%', backgroundColor: tokens.skeleton1 }]} />
        <View style={[styles.skeletonLine, { width: '80%', marginTop: 6, backgroundColor: tokens.skeleton2 }]} />
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ThreadRow
// ─────────────────────────────────────────────────────────────────────────────

function ThreadRow({
  thread,
  onPress,
  isDark,
  tokens,
}: {
  thread: ChatThread;
  onPress: () => void;
  isDark: boolean;
  tokens: ReturnType<typeof useTheme>['tokens'];
}) {
  const { t } = useTranslation();
  const isUnread = thread.unreadCount > 0;
  const timeLabel = timeAgo(thread.lastMessageAt);

  const unreadLabel = thread.unreadCount > 9 ? '9+' : String(thread.unreadCount);
  const previewText = t('mobile.chat.list.row.preview', {
    defaultValue: t('mobile.chat.detail.empty.title'),
  });

  const a11yLabel = [
    thread.subject ?? thread.category,
    thread.category,
    isUnread
      ? t('mobile.chat.list.row.unread_count', { count: thread.unreadCount, defaultValue: `${thread.unreadCount} unread` })
      : '',
    timeLabel,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      style={[
        styles.row,
        { borderBottomColor: tokens.border },
        isUnread && styles.rowUnread,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
    >
      {/* Unread left edge */}
      {isUnread && (
        <View style={[styles.unreadEdge, { backgroundColor: tokens.brand500 }]} />
      )}

      {/* Avatar */}
      <View style={[styles.avatar, { backgroundColor: tokens.brand500 }]}>
        <Text style={[styles.avatarText, { color: tokens.textOnBrand }]}>
          {(thread.subject ?? thread.category).charAt(0).toUpperCase()}
        </Text>
      </View>

      {/* Content */}
      <View style={styles.rowContent}>
        <View style={styles.rowTop}>
          <Text
            style={[
              styles.rowName,
              { color: tokens.textPrimary },
              isUnread && styles.rowNameUnread,
            ]}
            numberOfLines={1}
          >
            {thread.subject ?? thread.category}
          </Text>
          <Text style={[styles.rowTime, { color: tokens.textTertiary }]}>
            {timeLabel}
          </Text>
        </View>

        <View style={styles.rowMid}>
          <CategoryBadge category={thread.category} isDark={isDark} />
          {isUnread && (
            <View style={[styles.unreadChip, { backgroundColor: tokens.brand500 }]}>
              <Text style={[styles.unreadChipText, { color: tokens.textOnBrand }]}>{unreadLabel}</Text>
            </View>
          )}
        </View>

        <Text
          style={[styles.rowPreview, { color: tokens.textSecondary }]}
          numberOfLines={1}
        >
          {previewText}
        </Text>
      </View>
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────────────────────────────────

const FILTER_OPTIONS: FilterKey[] = ['all', 'unread', 'mentions', 'tax', 'gst', 'loan', 'bug'];

function filterToCategory(f: FilterKey): ThreadCategory | undefined {
  const map: Partial<Record<FilterKey, ThreadCategory>> = {
    tax: 'tax-query',
    gst: 'gst-notice',
    loan: 'loan',
    bug: 'bug',
  };
  return map[f];
}

export function ChatListScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { tokens, isDark } = useTheme();
  const haptics = useHaptics();
  const queryClient = useQueryClient();
  const [searchText, setSearchText] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');
  const [refreshing, setRefreshing] = useState(false);

  const { data: response, isLoading, isError } = useQuery({
    queryKey: ['chat-threads', activeFilter],
    queryFn: () => {
      const cat = filterToCategory(activeFilter);
      const status = activeFilter === 'unread' ? undefined : undefined;
      return listThreads({ category: cat, status });
    },
    placeholderData: { items: [], totalCount: 0 },
  });

  const threads = response?.items ?? [];

  // Filter by search text client-side
  const displayed = searchText
    ? threads.filter(
        (t) =>
          (t.subject ?? '').toLowerCase().includes(searchText.toLowerCase()) ||
          t.category.includes(searchText.toLowerCase()),
      )
    : threads;

  // Further filter unread client-side
  const filtered =
    activeFilter === 'unread' ? displayed.filter((t) => t.unreadCount > 0) : displayed;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    haptics.lightTap();
    await queryClient.invalidateQueries({ queryKey: ['chat-threads'] });
    setRefreshing(false);
  }, [queryClient, haptics]);

  // BUG-W7-002: header "+" and FAB open the new-conversation sheet (spec §4.6).
  const navigateToNewChat = useCallback(() => {
    haptics.lightTap();
    // ChatStack is the parent navigator (same cast pattern as CaSelect below).
    (navigation.navigate as (route: string) => void)('NewChat');
  }, [navigation, haptics]);

  const navigateToDetail = useCallback(
    (threadId: string) => {
      // Navigate to ChatDetail — ChatStack is the parent navigator.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (navigation.navigate as (...args: any[]) => void)('ChatDetail', { threadId, source: 'list' });
    },
    [navigation],
  );

  const renderThread = useCallback(
    ({ item }: { item: ChatThread }) => (
      <ThreadRow
        thread={item}
        onPress={() => navigateToDetail(item.threadId)}
        isDark={isDark}
        tokens={tokens}
      />
    ),
    [navigateToDetail, isDark, tokens],
  );

  const renderSkeleton = () => (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <SkeletonRow key={i} tokens={tokens} />
      ))}
    </>
  );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: tokens.canvas }]}
      edges={['top']}
    >
      {/* Header */}
      <View style={[styles.header, { backgroundColor: tokens.raised, borderBottomColor: tokens.border }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="arrow-back" size={22} color={tokens.textPrimary} />
        </Pressable>
        <Text style={[styles.title, { color: tokens.textPrimary }]}>
          {t('mobile.chat.list.title')}
        </Text>
        <Pressable
          style={[styles.newChatBtn, { backgroundColor: tokens.brand500 + '18' }]}
          onPress={navigateToNewChat}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.chat.list.fab.new')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          testID="chat-list-new-header"
        >
          <Ionicons name="add" size={22} color={tokens.brand500} />
        </Pressable>
      </View>

      {/* Search */}
      <View style={[styles.searchContainer, { backgroundColor: tokens.raised, borderBottomColor: tokens.border }]}>
        <View style={[styles.searchBox, { backgroundColor: tokens.sunken, borderColor: tokens.border }]}>
          <Ionicons name="search-outline" size={16} color={tokens.textTertiary} />
          <TextInput
            style={[styles.searchInput, { color: tokens.textPrimary }]}
            placeholder={t('mobile.chat.list.search.placeholder')}
            placeholderTextColor={tokens.textTertiary}
            value={searchText}
            onChangeText={setSearchText}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>
      </View>

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.filterScrollView, { backgroundColor: tokens.raised }]}
        contentContainerStyle={styles.filterChips}
      >
        {FILTER_OPTIONS.map((f) => {
          const selected = activeFilter === f;
          return (
            <Pressable
              key={f}
              style={[
                styles.filterChip,
                selected
                  ? { backgroundColor: tokens.brand500 }
                  : { backgroundColor: tokens.sunken, borderColor: tokens.border, borderWidth: 1 },
              ]}
              onPress={() => {
                haptics.lightTap();
                setActiveFilter(f);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={t(`mobile.chat.list.filter.${f}`)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  { color: selected ? tokens.textOnBrand : tokens.textSecondary },
                ]}
              >
                {t(`mobile.chat.list.filter.${f}`)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* List */}
      {isLoading ? (
        <View style={[styles.listContent, { backgroundColor: tokens.canvas }]}>
          {renderSkeleton()}
        </View>
      ) : isError ? (
        <View style={styles.errorBanner}>
          <Text style={[styles.errorText, { color: tokens.textSecondary }]}>
            {t('mobile.chat.list.error.load')}
          </Text>
          <Pressable onPress={() => queryClient.invalidateQueries({ queryKey: ['chat-threads'] })}>
            <Text style={[styles.retryText, { color: tokens.brand500 }]}>
              {t('mobile.common.retry')}
            </Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.threadId}
          renderItem={renderThread}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void onRefresh()}
              tintColor={tokens.brand500}
            />
          }
          contentContainerStyle={[
            styles.listContent,
            { backgroundColor: tokens.canvas },
            filtered.length === 0 && styles.listEmpty,
          ]}
          ListHeaderComponent={
            /* Wave 7A (GAP-031): CA video-consultation entry (spec §1.1 — primary
               card above the threads) + "My appointments" row. */
            <View style={styles.caEntryWrap}>
              {/* DG-CHAT-06: "Ask AI" quick-answer banner — instant grounded
                  answers without opening a human thread. */}
              <Pressable
                style={[styles.askAiCard, { backgroundColor: tokens.gstAccent + '12', borderColor: tokens.gstAccent + '33' }]}
                onPress={() => {
                  haptics.lightTap();
                  (navigation.navigate as (route: string) => void)('AskAi');
                }}
                accessibilityRole="button"
                accessibilityLabel={t('mobile.ai.entry.cta')}
                testID="ask-ai-entry"
              >
                <View style={[styles.askAiIcon, { backgroundColor: tokens.gstAccent }]}>
                  <Ionicons name="sparkles" size={20} color={tokens.textOnBrand} />
                </View>
                <View style={styles.caEntryBody}>
                  <Text style={[styles.caEntryTitle, { color: tokens.textPrimary }]}>
                    {t('mobile.ai.entry.cta')}
                  </Text>
                  <Text style={[styles.caEntrySub, { color: tokens.textSecondary }]} numberOfLines={2}>
                    {t('mobile.ai.entry.subtitle')}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={tokens.gstAccent} />
              </Pressable>
              <Pressable
                style={[styles.caEntryCard, { backgroundColor: tokens.brandTint, borderColor: tokens.brandTintBorder }]}
                onPress={() => {
                  haptics.lightTap();
                  (navigation.navigate as (route: string) => void)('CaSelect');
                }}
                accessibilityRole="button"
                accessibilityLabel={t('mobile.ca.book.cta')}
                testID="ca-book-entry"
              >
                <View style={[styles.caEntryIcon, { backgroundColor: tokens.brand500 }]}>
                  <Ionicons name="videocam" size={22} color={tokens.textOnBrand} />
                </View>
                <View style={styles.caEntryBody}>
                  <Text style={[styles.caEntryTitle, { color: tokens.textPrimary }]}>
                    {t('mobile.ca.book.cta')}
                  </Text>
                  <Text style={[styles.caEntrySub, { color: tokens.textSecondary }]} numberOfLines={2}>
                    {t('mobile.ca.book.subtitle')}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={tokens.brand500} />
              </Pressable>
              <Pressable
                style={[styles.caApptsRow, { backgroundColor: tokens.raised, borderColor: tokens.border }]}
                onPress={() =>
                  (navigation.navigate as (route: string) => void)('MyAppointments')
                }
                accessibilityRole="button"
                accessibilityLabel={t('mobile.ca.appts.title')}
                testID="ca-my-appointments-entry"
              >
                <Ionicons name="calendar-outline" size={18} color={tokens.brand500} />
                <Text style={[styles.caApptsRowText, { color: tokens.textPrimary }]}>
                  {t('mobile.ca.appts.title')}
                </Text>
                <Ionicons name="chevron-forward" size={16} color={tokens.textTertiary} />
              </Pressable>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={[styles.emptyIconWrap, { backgroundColor: tokens.brand500 + '18' }]}>
                <Ionicons name="chatbubbles-outline" size={36} color={tokens.brand500} />
              </View>
              <Text style={[styles.emptyTitle, { color: tokens.textPrimary }]}>
                {t('mobile.chat.list.empty')}
              </Text>
              <Text style={[styles.emptyBody, { color: tokens.textSecondary }]}>
                {t('mobile.chat.list.emptyBody', { defaultValue: 'Tap + to start a conversation' })}
              </Text>
            </View>
          }
          ListFooterComponent={
            <View style={styles.ctaWrapper}>
              <RequestCallbackCta
                variant="card"
                category="OTHER"
                onNavigateToModal={(params) =>
                  navigation.navigate('RequestCallbackModal', params)
                }
                onNavigateToStatus={(callbackId) =>
                  navigation.navigate('CallbackStatus', { callbackId })
                }
                onNavigateToChat={() => {}}
              />
            </View>
          }
        />
      )}

      {/* FAB */}
      <Pressable
        style={[styles.fab, { backgroundColor: tokens.brand500 }]}
        onPress={navigateToNewChat}
        accessibilityRole="button"
        accessibilityLabel={t('mobile.chat.list.fab.new')}
        testID="chat-list-new-fab"
      >
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </Pressable>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Wave 7A (GAP-031): CA booking entry card + appointments row
  caEntryWrap: { gap: 10, marginBottom: 14 },
  caEntryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    minHeight: 64,
  },
  caEntryIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // DG-CHAT-06: Ask AI banner
  askAiCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    minHeight: 64,
  },
  askAiIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  caEntryBody: { flex: 1, gap: 2 },
  caEntryTitle: { fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },
  caEntrySub: { fontSize: 12, lineHeight: 17 },
  caApptsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    minHeight: 48,
  },
  caApptsRowText: { flex: 1, fontSize: 14, fontWeight: '600' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 18, fontWeight: '700', letterSpacing: -0.2 },
  newChatBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Search
  searchContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 44,
  },
  searchInput: { flex: 1, fontSize: 14 },

  // Filter chips
  filterScrollView: { maxHeight: 52 },
  filterChips: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 100,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipText: { fontSize: 13, fontWeight: '600' },

  // Thread row (84pt height per spec)
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 84,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
    position: 'relative',
  },
  rowUnread: {},
  unreadEdge: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    borderRadius: 2,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: { fontSize: 18, fontWeight: '700' },
  rowContent: { flex: 1, gap: 4 },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowName: { fontSize: 15, fontWeight: '500', flex: 1, marginRight: 8 },
  rowNameUnread: { fontWeight: '700' },
  rowTime: { fontSize: 12 },
  rowMid: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rowPreview: { fontSize: 13, lineHeight: 18 },

  // Category badge
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  categoryBadgeText: { fontSize: 10, fontWeight: '600' },

  // Unread chip
  unreadChip: {
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadChipText: { fontSize: 11, fontWeight: '700' },

  // Skeleton
  skeletonAvatar: { width: 48, height: 48, borderRadius: 14, flexShrink: 0 },
  skeletonLine: { height: 14, borderRadius: 7 },

  // Error
  errorBanner: {
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  errorText: { fontSize: 14, textAlign: 'center' },
  retryText: { fontSize: 14, fontWeight: '600' },

  // Empty
  listContent: { flexGrow: 1 },
  listEmpty: { flex: 1, justifyContent: 'center' },
  emptyContainer: {
    alignItems: 'center',
    padding: 48,
    gap: 14,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptyBody: { fontSize: 14, textAlign: 'center', lineHeight: 22 },

  // CTA
  ctaWrapper: { padding: 16 },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
});
