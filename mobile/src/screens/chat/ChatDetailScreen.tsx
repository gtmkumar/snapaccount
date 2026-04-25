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
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
  markThreadRead,
  postTypingPing,
  sendMessage,
  startChatHub,
  stopChatHub,
  subscribeChatHub,
  type ChatMessage,
  type ChatThread,
} from '../../api/chat';
import { Colors } from '../../constants/colors';
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
}

function ChatBubble({ message, isSelf, showAvatar }: BubbleProps) {
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

  const accessLabel = `${isSelf ? t('mobile.chat.detail.bubble.you') : message.senderUserId}, ${timeStr}: ${message.body}`;

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
            ? [styles.bubbleSelf, { backgroundColor: tokens.brand500 }]
            : [styles.bubbleOther, { backgroundColor: tokens.sunken, borderColor: tokens.border }],
          message.localStatus === 'failed' && styles.bubbleFailed,
        ]}
        accessible
        accessibilityLabel={accessLabel}
        accessibilityHint={t('mobile.chat.detail.bubble.longPressHint')}
      >
        <Text
          style={[
            styles.bubbleText,
            { color: isSelf ? '#FFFFFF' : tokens.textPrimary },
          ]}
        >
          {message.body}
        </Text>

        <View style={styles.bubbleMeta}>
          <Text
            style={[
              styles.bubbleTime,
              { color: isSelf ? 'rgba(255,255,255,0.7)' : tokens.textTertiary },
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
                  ? Colors.error[400]
                  : isSelf
                    ? 'rgba(255,255,255,0.7)'
                    : tokens.textTertiary
              }
            />
          )}
        </View>
      </Pressable>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TypingIndicator
// ─────────────────────────────────────────────────────────────────────────────

function TypingIndicator({ typingUserId }: { typingUserId: string }) {
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
  const { t } = useTranslation();
  return (
    <View style={styles.offlineBanner}>
      <Ionicons name="cloud-offline-outline" size={14} color={Colors.neutral[600]} />
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
  const { t } = useTranslation();
  const route = useRoute<RouteProps>();
  const { threadId } = route.params;
  const navigation = useNavigation<NavigationProp<Record<string, object | undefined>>>();
  const haptics = useHaptics();
  const { tokens } = useTheme();
  const queryClient = useQueryClient();
  const flatListRef = useRef<FlatList>(null);

  // Sensitive screen: prevent screenshot per SEC-015
  useSensitiveScreen();

  // ── Local state ────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [composerText, setComposerText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [typingUserId, setTypingUserId] = useState<string | null>(null);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const [isAtBottom, setIsAtBottom] = useState(true);

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
  const handleSend = useCallback(async () => {
    const text = composerText.trim();
    if (!text || isSending) return;

    const clientMessageId = `local_${Date.now()}`;
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

    try {
      const sent = await sendMessage(threadId, {
        body: text,
        clientMessageId,
      });
      setMessages((prev) =>
        prev.map((m) =>
          m.clientMessageId === clientMessageId
            ? { ...sent, localStatus: 'sent' as const }
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
  }, [composerText, isSending, isOffline, threadId, haptics, t]);

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
  const renderMessage = useCallback(
    ({ item, index }: { item: ChatMessage; index: number }) => {
      const isSelf = item.senderUserId === 'me';
      const prevMsg = messages[index - 1];
      const showAvatar = !isSelf && prevMsg?.senderUserId !== item.senderUserId;
      return (
        <ChatBubble message={item} isSelf={isSelf} showAvatar={showAvatar} />
      );
    },
    [messages],
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
          accessibilityRole="button"
          accessibilityLabel={t('mobile.chat.detail.header.menu')}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="ellipsis-vertical" size={20} color={tokens.textSecondary} />
        </Pressable>
      </View>

      {/* Offline banner */}
      {isOffline && <OfflineBanner />}

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
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
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
    color: '#FFFFFF',
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
    backgroundColor: Colors.neutral[100],
  },
  offlineBannerText: {
    fontSize: 12,
    color: Colors.neutral[600],
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
  avatarSmallText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
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
  bubbleFailed: { borderWidth: 1, borderColor: Colors.error[400] },
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
    color: '#FFFFFF',
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
});
