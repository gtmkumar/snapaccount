/**
 * ChatDetailScreen — real-time message thread with SignalR.
 * Phase 6F · Track F2 · docs/design/mobile/chat/chat-detail-screen.md
 *
 * - Inverted FlatList (newest at bottom).
 * - SignalR connection on mount; disconnect on blur/unmount.
 * - Typing indicator ephemeral (3s timeout after last event).
 * - Offline composing: messages enqueue with QUEUED status.
 * - Deep-link target: snapaccount://chat/{threadId}
 * - Haptics: send success = Success, send error = Error, receive = Light.
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useReducedMotion } from 'react-native-reanimated';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { NavigationProp, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import Constants from 'expo-constants';
import { FirebaseAuth } from '../../lib/firebase';

import {
  buildChatHubConnection,
  getMessages,
  getThread,
  getThreadExportDownloadUrl,
  getThreadExportJob,
  markThreadRead,
  postTypingPing,
  sendMessage,
  startChatHub,
  startThreadExport,
  stopChatHub,
  subscribeChatHub,
  toggleBookmark,
  type ChatMessage,
  type ChatThread,
} from '../../api/chat';
import { createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { newClientMessageId } from '../../lib/ids';
import { useHaptics } from '../../hooks/useHaptics';
import { useTheme } from '../../contexts/ThemeContext';
import { useSensitiveScreen } from '../../hooks/usePreventScreenCapture';
import type { ChatStackParamList } from '../../navigation/ChatStack';

type RouteProps = RouteProp<ChatStackParamList, 'ChatDetail'>;

// ─────────────────────────────────────────────────────────────────────────────
// ChatBubble
// ─────────────────────────────────────────────────────────────────────────────

interface BubbleProps {
  message: ChatMessage;
  isSelf: boolean;
  showAvatar: boolean;
  /** NEW-D08: tapping a failed bubble retries the send with the SAME clientMessageId. */
  onRetry?: (message: ChatMessage) => void;
  /** GAP-043: long-press (or a11y action) opens the bookmark action sheet. */
  onLongPress?: (message: ChatMessage) => void;
  /** GAP-043 jump-to-message transient highlight. */
  highlighted?: boolean;
}

function ChatBubble({ message, isSelf, showAvatar, onRetry, onLongPress, highlighted }: BubbleProps) {
  const styles = useStyles();
  const { tokens } = useTheme();
  const { t } = useTranslation();

  const statusIcon: React.ComponentProps<typeof Ionicons>['name'] =
    message.localStatus === 'queued'
      ? 'time-outline'
      : message.localStatus === 'failed'
        ? 'alert-circle-outline'
        : 'checkmark-done-outline';

  const timeStr = new Date(message.createdAt).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const isFailed = message.localStatus === 'failed';
  const isBookmarked = message.isBookmarked === true;
  const accessLabel = `${isSelf ? t('mobile.chat.detail.bubble.you') : message.senderUserId}, ${timeStr}: ${message.body}${
    isBookmarked ? `. ${t('mobile.chat.bookmark.added')}` : ''
  }${isFailed ? `. ${t('mobile.chat.mobile.failed.tapRetry')}` : ''}`;

  return (
    <View
      style={[
        styles.bubbleRow,
        isSelf ? styles.bubbleRowSelf : styles.bubbleRowOther,
      ]}
    >
      {!isSelf && showAvatar && (
        <View style={[styles.avatarSmall, { backgroundColor: tokens.brand500 }]}>
          <Text style={styles.avatarSmallText}>
            {message.senderUserId.charAt(0).toUpperCase()}
          </Text>
        </View>
      )}
      {!isSelf && !showAvatar && <View style={styles.avatarSpacer} />}

      <Pressable
        style={[
          styles.bubble,
          isSelf
            ? [styles.bubbleSelf, { backgroundColor: tokens.brandCta }]
            : [styles.bubbleOther, { backgroundColor: tokens.sunken, borderColor: tokens.border }],
          message.localStatus === 'failed' && styles.bubbleFailed,
          // Jump-to-message highlight (info tint — visible on both bubbles).
          highlighted && { backgroundColor: tokens.infoTint },
        ]}
        onPress={isFailed && onRetry ? () => onRetry(message) : undefined}
        onLongPress={onLongPress ? () => onLongPress(message) : undefined}
        testID={isFailed ? `chat-bubble-retry-${message.clientMessageId ?? message.messageId}` : `chat-bubble-${message.messageId}`}
        accessible
        accessibilityRole={isFailed ? 'button' : undefined}
        accessibilityLabel={accessLabel}
        accessibilityHint={
          isFailed
            ? t('mobile.chat.mobile.failed.tapRetry')
            : t('mobile.chat.detail.bubble.longPressHint')
        }
        // A11y: bookmark must NOT be long-press-only (spec §3.4) — expose it as
        // a custom accessibility action too.
        accessibilityActions={
          onLongPress
            ? [
                {
                  name: 'bookmark',
                  label: isBookmarked
                    ? t('mobile.chat.bookmark.remove')
                    : t('mobile.chat.bookmark.add'),
                },
              ]
            : undefined
        }
        onAccessibilityAction={
          onLongPress
            ? (e) => {
                if (e.nativeEvent.actionName === 'bookmark') onLongPress(message);
              }
            : undefined
        }
      >
        {isBookmarked && (
          <View style={styles.bookmarkGlyph} testID={`bookmark-glyph-${message.messageId}`}>
            <Ionicons name="bookmark" size={12} color={tokens.brand500} />
          </View>
        )}
        <Text
          style={[
            styles.bubbleText,
            { color: isSelf ? tokens.textOnBrand : tokens.textPrimary },
          ]}
        >
          {message.body}
        </Text>

        <View style={styles.bubbleMeta}>
          <Text
            style={[
              styles.bubbleTime,
              { color: isSelf ? tokens.textOnBrand + 'B3' : tokens.textTertiary },
            ]}
          >
            {timeStr}
          </Text>
          {isSelf && (
            <Ionicons
              name={statusIcon}
              size={12}
              color={
                message.localStatus === 'failed'
                  ? tokens.errorFg
                  : isSelf
                    ? tokens.textOnBrand + 'B3'
                    : tokens.textTertiary
              }
            />
          )}
        </View>
        {isFailed && (
          <Text style={[styles.bubbleFailedCaption, { color: isSelf ? '#FFE4E6' : tokens.errorFg }]}>
            {t('mobile.chat.mobile.failed.tapRetry')}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TypingIndicator
// ─────────────────────────────────────────────────────────────────────────────

function TypingIndicator({ typingUserId }: { typingUserId: string }) {
  const styles = useStyles();
  const { tokens } = useTheme();
  const { t } = useTranslation();

  return (
    <View
      style={styles.typingRow}
      accessibilityLiveRegion="polite"
      accessibilityLabel={t('mobile.chat.detail.typing.label', { name: typingUserId })}
    >
      <View style={[styles.typingBubble, { backgroundColor: tokens.sunken }]}>
        <Text style={[styles.typingDots, { color: tokens.textSecondary }]}>
          ···
        </Text>
      </View>
      <Text style={[styles.typingName, { color: tokens.textTertiary }]}>
        {t('mobile.chat.detail.typing.label', { name: typingUserId })}
      </Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Offline banner
// ─────────────────────────────────────────────────────────────────────────────

function OfflineBanner() {
  const { tokens } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  return (
    <View style={styles.offlineBanner}>
      <Ionicons name="cloud-offline-outline" size={14} color={tokens.textSecondary} />
      <Text style={styles.offlineBannerText}>
        {t('mobile.chat.mobile.offline.banner')}
      </Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────────────────────────────────

const HUB_BASE_URL =
  (Constants.expoConfig?.extra?.apiBaseUrl as string | undefined) ??
  'http://localhost:5000';

const TYPING_DEBOUNCE_MS = 600;
const TYPING_STOP_TIMEOUT_MS = 3_000;

export function ChatDetailScreen() {
  const styles = useStyles();
  const { t } = useTranslation();
  const route = useRoute<RouteProps>();
  const { threadId, highlightMessageId } = route.params;
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const haptics = useHaptics();
  const { tokens } = useTheme();
  const queryClient = useQueryClient();
  const flatListRef = useRef<FlatList>(null);
  const reduceMotion = useReducedMotion();

  // Sensitive screen: prevent screenshot per SEC-015
  useSensitiveScreen();

  // ── Local state ────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [composerText, setComposerText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isOffline] = useState(false);
  const [typingUserId, setTypingUserId] = useState<string | null>(null);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const [isAtBottom, setIsAtBottom] = useState(true);

  // ── GAP-043: bookmarks, overflow menu, export ──────────────────────────────
  const [actionSheetMessage, setActionSheetMessage] = useState<ChatMessage | null>(null);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [exportState, setExportState] = useState<'idle' | 'preparing' | 'failed'>('idle');
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const exportCancelledRef = useRef(false);

  const typingStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingDebounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hubRef = useRef(
    buildChatHubConnection(HUB_BASE_URL, () => FirebaseAuth.getIdToken()), // SEC-054: use real JWT from FirebaseAuth
  );
  const [hubConnected, setHubConnected] = useState(false);

  // ── REST: thread detail ────────────────────────────────────────────────────
  const { data: thread, isLoading: threadLoading } = useQuery<ChatThread>({
    queryKey: ['chat-thread', threadId],
    queryFn: () => getThread(threadId),
  });

  // ── REST: initial messages ─────────────────────────────────────────────────
  const { isLoading: messagesLoading } = useQuery({
    queryKey: ['chat-messages', threadId],
    queryFn: async () => {
      const res = await getMessages(threadId, { pageSize: 50 });
      setMessages(res.items.slice().reverse()); // chronological
      return res;
    },
  });

  // ── GAP-043: jump-to-message (from ChatBookmarksScreen) ────────────────────
  useEffect(() => {
    if (!highlightMessageId || messages.length === 0) return;
    const index = messages.findIndex((m) => m.messageId === highlightMessageId);
    if (index < 0) return;
    // Deferred (next tick) so the list has laid out — also keeps setState out
    // of the synchronous effect body (react-hooks/set-state-in-effect).
    const startTimer = setTimeout(() => {
      setHighlightedId(highlightMessageId);
      flatListRef.current?.scrollToIndex({ index, animated: !reduceMotion, viewPosition: 0.5 });
      AccessibilityInfo.announceForAccessibility(t('mobile.chat.bookmarks.jumped'));
    }, 0);
    // Flash ~800ms; reduce-motion keeps a static highlight a little longer.
    const clearTimer = setTimeout(
      () => setHighlightedId(null),
      reduceMotion ? 4000 : 800,
    );
    return () => {
      clearTimeout(startTimer);
      clearTimeout(clearTimer);
    };
    // Re-run only when the target or the loaded set changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightMessageId, messages.length]);

  // ── GAP-043: bookmark toggle (optimistic; server toggles create/soft-delete) ──
  const handleBookmarkToggle = useCallback(
    async (message: ChatMessage) => {
      setActionSheetMessage(null);
      const next = !(message.isBookmarked === true);
      setMessages((prev) =>
        prev.map((m) =>
          m.messageId === message.messageId ? { ...m, isBookmarked: next } : m,
        ),
      );
      haptics.lightTap();
      try {
        const result = await toggleBookmark(message.messageId);
        // Server is source of truth for the resulting state.
        setMessages((prev) =>
          prev.map((m) =>
            m.messageId === message.messageId
              ? { ...m, isBookmarked: result.isBookmarked }
              : m,
          ),
        );
        void queryClient.invalidateQueries({ queryKey: ['chat-bookmarks'] });
      } catch {
        // Roll back the optimistic flip.
        setMessages((prev) =>
          prev.map((m) =>
            m.messageId === message.messageId ? { ...m, isBookmarked: !next } : m,
          ),
        );
        haptics.error();
      }
    },
    [haptics, queryClient],
  );

  // ── GAP-043: export thread as PDF (async job → OS share sheet) ─────────────
  // expo-sharing is not installed in this app; the existing share path for
  // generated PDFs is the OS-level RN Share / signed-URL open (see
  // ReportDetailScreen + PdfViewerMobile) — reuse that pattern here.
  const handleExport = useCallback(async () => {
    setOverflowOpen(false);
    setExportState('preparing');
    exportCancelledRef.current = false;
    try {
      let job = await startThreadExport(threadId);
      const startedAt = Date.now();
      while (
        job.status !== 'COMPLETED' &&
        job.status !== 'FAILED' &&
        Date.now() - startedAt < 90_000 &&
        !exportCancelledRef.current
      ) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        job = await getThreadExportJob(job.jobId);
      }
      if (exportCancelledRef.current) return;
      if (job.status === 'COMPLETED') {
        // ReportService: the file travels via a signed URL (15-min TTL).
        const url = await getThreadExportDownloadUrl(job.jobId);
        setExportState('idle');
        haptics.success();
        AccessibilityInfo.announceForAccessibility(t('mobile.chat.export.ready'));
        await Share.share(Platform.OS === 'ios' ? { url } : { message: url });
      } else {
        setExportState('failed');
        haptics.error();
      }
    } catch {
      if (!exportCancelledRef.current) {
        setExportState('failed');
        haptics.error();
      }
    }
  }, [threadId, haptics, t]);

  useEffect(
    () => () => {
      exportCancelledRef.current = true;
    },
    [],
  );

  // ── SignalR lifecycle (focus/blur aware) ───────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      const hub = hubRef.current;

      const unsub = subscribeChatHub(hub, {
        onMessageReceived: (msg) => {
          setMessages((prev) => [...prev, msg]);
          haptics.lightTap();
          if (!isAtBottom) {
            setNewMessageCount((n) => n + 1);
          }
          void queryClient.invalidateQueries({ queryKey: ['chat-threads'] });
        },
        onTypingStarted: (uid) => {
          setTypingUserId(uid);
          if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
          typingStopTimer.current = setTimeout(() => {
            setTypingUserId(null);
          }, TYPING_STOP_TIMEOUT_MS);
        },
        onTypingStopped: () => {
          if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
          setTypingUserId(null);
        },
        onReconnecting: () => setHubConnected(false),
        onReconnected: () => setHubConnected(true),
        onDisconnected: () => setHubConnected(false),
      });

      startChatHub(hub)
        .then(() => setHubConnected(true))
        .catch(() => setHubConnected(false));

      void markThreadRead(threadId).catch(() => undefined);

      return () => {
        unsub();
        void stopChatHub(hub);
        setHubConnected(false);
        if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
        if (typingDebounceTimer.current) clearTimeout(typingDebounceTimer.current);
      };
    }, [threadId, haptics, queryClient, isAtBottom]),
  );

  // ── Composer typing events ─────────────────────────────────────────────────
  const handleComposerChange = useCallback(
    (text: string) => {
      setComposerText(text);
      if (typingDebounceTimer.current) clearTimeout(typingDebounceTimer.current);
      typingDebounceTimer.current = setTimeout(() => {
        void postTypingPing(threadId).catch(() => undefined);
      }, TYPING_DEBOUNCE_MS);
    },
    [threadId],
  );

  // ── Send message ───────────────────────────────────────────────────────────
  // NEW-D08: `clientMessageId` is a client-generated UUID created ONCE per
  // logical message and persisted in the optimistic message state. A retry of
  // a failed send MUST reuse the same id — that is the backend dedupe key.
  const performSend = useCallback(
    async (body: string, clientMessageId: string) => {
      try {
        const sent = await sendMessage(threadId, {
          body,
          clientMessageId,
        });
        setMessages((prev) =>
          prev.map((m) =>
            m.clientMessageId === clientMessageId
              ? { ...sent, clientMessageId, localStatus: 'sent' as const }
              : m,
          ),
        );
        haptics.success();
        AccessibilityInfo.announceForAccessibility(
          t('mobile.chat.detail.sent.accessibility'),
        );
      } catch {
        setMessages((prev) =>
          prev.map((m) =>
            m.clientMessageId === clientMessageId
              ? { ...m, localStatus: 'failed' as const }
              : m,
          ),
        );
        haptics.error();
      } finally {
        setIsSending(false);
      }
    },
    [threadId, haptics, t],
  );

  const handleSend = useCallback(async () => {
    const text = composerText.trim();
    if (!text || isSending) return;

    const clientMessageId = newClientMessageId();
    const optimisticMsg: ChatMessage = {
      messageId: clientMessageId,
      threadId,
      senderUserId: 'me',
      body: text,
      createdAt: new Date().toISOString(),
      clientMessageId,
      localStatus: isOffline ? 'queued' : 'sending',
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    setComposerText('');
    setIsSending(true);

    if (typingDebounceTimer.current) {
      clearTimeout(typingDebounceTimer.current);
    }

    if (isOffline) {
      // Queued — will flush on reconnect
      setIsSending(false);
      return;
    }

    await performSend(text, clientMessageId);
  }, [composerText, isSending, isOffline, threadId, performSend]);

  // ── Retry failed send (reuses the persisted clientMessageId — dedupe point) ─
  const handleRetry = useCallback(
    async (failed: ChatMessage) => {
      const clientMessageId = failed.clientMessageId;
      if (!clientMessageId || isSending) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.clientMessageId === clientMessageId
            ? { ...m, localStatus: 'sending' as const }
            : m,
        ),
      );
      setIsSending(true);
      await performSend(failed.body, clientMessageId);
    },
    [isSending, performSend],
  );

  // ── Scroll to bottom ───────────────────────────────────────────────────────
  const scrollToBottom = useCallback(() => {
    flatListRef.current?.scrollToEnd({ animated: true });
    setNewMessageCount(0);
    setIsAtBottom(true);
  }, []);

  const handleScroll = useCallback((event: { nativeEvent: { contentOffset: { y: number }, contentSize: { height: number }, layoutMeasurement: { height: number } } }) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const atBottom =
      contentOffset.y + layoutMeasurement.height >= contentSize.height - 20;
    setIsAtBottom(atBottom);
    if (atBottom) setNewMessageCount(0);
  }, []);

  // ── Render item ────────────────────────────────────────────────────────────
  const handleBubbleLongPress = useCallback((message: ChatMessage) => {
    setActionSheetMessage(message);
  }, []);

  const renderMessage = useCallback(
    ({ item, index }: { item: ChatMessage; index: number }) => {
      const isSelf = item.senderUserId === 'me';
      const prevMsg = messages[index - 1];
      const showAvatar = !isSelf && prevMsg?.senderUserId !== item.senderUserId;
      return (
        <ChatBubble
          message={item}
          isSelf={isSelf}
          showAvatar={showAvatar}
          onRetry={handleRetry}
          onLongPress={handleBubbleLongPress}
          highlighted={item.messageId === highlightedId}
        />
      );
    },
    [messages, handleRetry, handleBubbleLongPress, highlightedId],
  );

  const isLoading = threadLoading || messagesLoading;

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: tokens.canvas }]}
      edges={['top', 'bottom']}
    >
      {/* Header */}
      <View style={[styles.header, { backgroundColor: tokens.raised, borderBottomColor: tokens.border }]}>
        <Pressable
          style={styles.headerBack}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={22} color={tokens.textPrimary} />
        </Pressable>
        <View style={styles.headerMid}>
          <View style={[styles.headerAvatar, { backgroundColor: tokens.brand500 }]}>
            <Text style={styles.headerAvatarText}>
              {thread?.category?.charAt(0).toUpperCase() ?? 'C'}
            </Text>
          </View>
          <View>
            <Text style={[styles.headerName, { color: tokens.textPrimary }]} numberOfLines={1}>
              {thread?.subject ?? t('mobile.chat.detail.header.defaultTitle')}
            </Text>
            <Text style={[styles.headerSub, { color: tokens.textSecondary }]}>
              {hubConnected
                ? t('mobile.chat.detail.header.online')
                : t('mobile.chat.detail.header.offline')}
            </Text>
          </View>
        </View>
        <Pressable
          style={styles.headerMenu}
          onPress={() => (navigation.navigate as (route: string) => void)('ChatBookmarks')}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.chat.bookmarks.title')}
          hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
          testID="chat-header-bookmarks"
        >
          <Ionicons name="bookmark-outline" size={20} color={tokens.textSecondary} />
        </Pressable>
        <Pressable
          style={styles.headerMenu}
          onPress={() => setOverflowOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.chat.detail.header.menu')}
          hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
          testID="chat-header-overflow"
        >
          <Ionicons name="ellipsis-vertical" size={20} color={tokens.textSecondary} />
        </Pressable>
      </View>

      {/* Offline banner */}
      {isOffline && <OfflineBanner />}

      {/* GAP-043: export progress / failure (live region) */}
      {exportState !== 'idle' && (
        <View
          style={[
            styles.exportBanner,
            exportState === 'failed' && { backgroundColor: tokens.errorTint },
          ]}
          accessibilityLiveRegion="polite"
          testID="chat-export-banner"
        >
          {exportState === 'preparing' ? (
            <>
              <ActivityIndicator size="small" color={tokens.brand500} />
              <Text style={styles.exportBannerText}>
                {t('mobile.chat.export.preparing')}
              </Text>
            </>
          ) : (
            <>
              <Ionicons name="alert-circle-outline" size={16} color={tokens.errorFg} />
              <Text style={[styles.exportBannerText, { color: tokens.errorFg }]}>
                {t('mobile.chat.export.failed')}
              </Text>
              <Pressable
                onPress={() => void handleExport()}
                accessibilityRole="button"
                accessibilityLabel={t('mobile.common.retry')}
                style={styles.exportRetryBtn}
                testID="chat-export-retry"
              >
                <Text style={styles.exportRetryText}>{t('mobile.common.retry')}</Text>
              </Pressable>
            </>
          )}
        </View>
      )}

      {/* Message list */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        {isLoading ? (
          <View style={styles.loadingCenter}>
            <ActivityIndicator color={tokens.brand500} />
          </View>
        ) : messages.length === 0 ? (
          <View style={styles.emptyCenter}>
            <Ionicons name="chatbubbles-outline" size={48} color={tokens.brand500} />
            <Text style={[styles.emptyTitle, { color: tokens.textPrimary }]}>
              {t('mobile.chat.detail.empty.title')}
            </Text>
            <Text style={[styles.emptyBody, { color: tokens.textSecondary }]}>
              {t('mobile.chat.detail.empty.body')}
            </Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(m) => m.messageId}
            renderItem={renderMessage}
            contentContainerStyle={styles.messageList}
            onScroll={handleScroll}
            scrollEventThrottle={100}
            onContentSizeChange={() => {
              if (isAtBottom) {
                flatListRef.current?.scrollToEnd({ animated: false });
              }
            }}
            ListFooterComponent={
              typingUserId ? (
                <TypingIndicator typingUserId={typingUserId} />
              ) : null
            }
          />
        )}

        {/* New message pill */}
        {newMessageCount > 0 && !isAtBottom && (
          <Pressable
            style={[styles.newMessagesPill, { backgroundColor: tokens.brand500 }]}
            onPress={scrollToBottom}
            accessibilityRole="button"
          >
            <Ionicons name="arrow-down" size={14} color="#FFFFFF" />
            <Text style={styles.newMessagesPillText}>
              {t('mobile.chat.mobile.newMessages', { count: newMessageCount })}
            </Text>
          </Pressable>
        )}

        {/* Composer */}
        <View
          style={[
            styles.composer,
            { backgroundColor: tokens.raised, borderTopColor: tokens.border },
          ]}
        >
          <Pressable
            style={styles.composerAction}
            accessibilityRole="button"
            accessibilityLabel={t('mobile.chat.mobile.attach.camera')}
            hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
          >
            <Ionicons name="camera-outline" size={22} color={tokens.brand500} />
          </Pressable>

          <TextInput
            style={[
              styles.composerInput,
              {
                color: tokens.textPrimary,
                backgroundColor: tokens.sunken,
                borderColor: tokens.border,
              },
            ]}
            placeholder={t('mobile.chat.mobile.composer.placeholder')}
            placeholderTextColor={tokens.textTertiary}
            value={composerText}
            onChangeText={handleComposerChange}
            multiline
            maxLength={4000}
            accessibilityLabel={t('mobile.chat.mobile.composer.placeholder')}
          />

          <Pressable
            style={[
              styles.sendBtn,
              {
                backgroundColor:
                  composerText.trim() ? tokens.brand500 : tokens.border,
              },
            ]}
            onPress={() => void handleSend()}
            disabled={!composerText.trim() || isSending}
            accessibilityRole="button"
            accessibilityLabel={t('mobile.chat.detail.send')}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            {isSending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="send" size={18} color="#FFFFFF" />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      {/* GAP-043: message action sheet (bookmark toggle) — also reachable via
          the bubble's custom accessibility action, never long-press-only. */}
      <Modal
        visible={actionSheetMessage !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setActionSheetMessage(null)}
      >
        <View style={styles.sheetBackdrop}>
          <Pressable
            style={styles.sheetBackdropTouch}
            onPress={() => setActionSheetMessage(null)}
            accessibilityLabel={t('mobile.common.close')}
          />
          <View style={styles.sheet} accessibilityViewIsModal testID="message-action-sheet">
            <Pressable
              style={styles.sheetAction}
              onPress={() => {
                if (actionSheetMessage) void handleBookmarkToggle(actionSheetMessage);
              }}
              accessibilityRole="button"
              accessibilityLabel={
                actionSheetMessage?.isBookmarked
                  ? t('mobile.chat.bookmark.remove')
                  : t('mobile.chat.bookmark.add')
              }
              testID="message-action-bookmark"
            >
              <Ionicons
                name={actionSheetMessage?.isBookmarked ? 'bookmark' : 'bookmark-outline'}
                size={20}
                color={tokens.brand500}
              />
              <Text style={styles.sheetActionText}>
                {actionSheetMessage?.isBookmarked
                  ? t('mobile.chat.bookmark.remove')
                  : t('mobile.chat.bookmark.add')}
              </Text>
            </Pressable>
            <Pressable
              style={styles.sheetAction}
              onPress={() => setActionSheetMessage(null)}
              accessibilityRole="button"
              accessibilityLabel={t('mobile.common.cancel')}
            >
              <Ionicons name="close-outline" size={20} color={tokens.textSecondary} />
              <Text style={[styles.sheetActionText, { color: tokens.textSecondary }]}>
                {t('mobile.common.cancel')}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* GAP-043: thread overflow menu → export confirm */}
      <Modal
        visible={overflowOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setOverflowOpen(false)}
      >
        <View style={styles.sheetBackdrop}>
          <Pressable
            style={styles.sheetBackdropTouch}
            onPress={() => setOverflowOpen(false)}
            accessibilityLabel={t('mobile.common.close')}
          />
          <View style={styles.sheet} accessibilityViewIsModal testID="thread-overflow-sheet">
            <Text style={styles.sheetHint}>{t('mobile.chat.export.hint')}</Text>
            <Pressable
              style={styles.sheetAction}
              onPress={() => void handleExport()}
              accessibilityRole="button"
              accessibilityLabel={t('mobile.chat.export.action')}
              testID="thread-export-action"
            >
              <Ionicons name="document-outline" size={20} color={tokens.brand500} />
              <Text style={styles.sheetActionText}>{t('mobile.chat.export.action')}</Text>
            </Pressable>
            <Pressable
              style={styles.sheetAction}
              onPress={() => setOverflowOpen(false)}
              accessibilityRole="button"
              accessibilityLabel={t('mobile.common.cancel')}
            >
              <Ionicons name="close-outline" size={20} color={tokens.textSecondary} />
              <Text style={[styles.sheetActionText, { color: tokens.textSecondary }]}>
                {t('mobile.common.cancel')}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 56,
    gap: 8,
  },
  headerBack: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerMid: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarText: {
    color: tk.textOnBrand,
    fontSize: 14,
    fontWeight: '700',
  },
  headerName: { fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },
  headerSub: { fontSize: 11 },
  headerMenu: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Offline banner
  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: tk.sunken,
  },
  offlineBannerText: {
    fontSize: 12,
    color: tk.textSecondary,
    fontWeight: '500',
  },

  // Loading / empty
  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptyBody: { fontSize: 14, textAlign: 'center', lineHeight: 20 },

  // Message list
  messageList: { paddingHorizontal: 12, paddingVertical: 12, gap: 4 },

  // Bubbles
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 4 },
  bubbleRowSelf: { justifyContent: 'flex-end' },
  bubbleRowOther: { justifyContent: 'flex-start' },
  avatarSmall: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  avatarSmallText: { color: tk.textOnBrand, fontSize: 11, fontWeight: '700' },
  avatarSpacer: { width: 34 },
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    gap: 4,
  },
  bubbleSelf: { borderBottomRightRadius: 4 },
  bubbleOther: { borderBottomLeftRadius: 4, borderWidth: StyleSheet.hairlineWidth },
  bubbleFailed: { borderWidth: 1, borderColor: tk.errorFg },
  // GAP-043: bookmark glyph in the bubble corner.
  bookmarkGlyph: {
    position: 'absolute',
    top: -6,
    right: -4,
    backgroundColor: tk.raised,
    borderRadius: 8,
    padding: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tk.border,
  },

  // GAP-043: export banner + bottom sheets
  exportBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: tk.brandTint,
  },
  exportBannerText: {
    flex: 1,
    fontSize: 12,
    color: tk.brandFg,
    fontWeight: '600',
  },
  exportRetryBtn: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  exportRetryText: { fontSize: 12, fontWeight: '700', color: tk.errorFg },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'flex-end',
  },
  sheetBackdropTouch: { flex: 1 },
  sheet: {
    backgroundColor: tk.raised,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
    paddingBottom: 32,
    gap: 4,
  },
  sheetHint: {
    fontSize: 12,
    color: tk.textSecondary,
    lineHeight: 18,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  sheetAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  sheetActionText: { fontSize: 15, fontWeight: '600', color: tk.textPrimary },
  bubbleFailedCaption: { fontSize: 11, fontWeight: '600', marginTop: 4 },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  bubbleMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },
  bubbleTime: { fontSize: 10 },

  // Typing indicator
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  typingBubble: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  typingDots: { fontSize: 18, letterSpacing: 2 },
  typingName: { fontSize: 11 },

  // New messages pill
  newMessagesPill: {
    position: 'absolute',
    bottom: 72,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
  },
  newMessagesPillText: {
    color: tk.textOnBrand,
    fontSize: 12,
    fontWeight: '700',
  },

  // Composer
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  composerAction: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 100,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  }),
);
