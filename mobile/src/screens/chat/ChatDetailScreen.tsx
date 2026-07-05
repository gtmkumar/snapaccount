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
  Alert,
  FlatList,
  Image,
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
import * as ImagePicker from 'expo-image-picker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import type { NavigationProp, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { FirebaseAuth } from '../../lib/firebase';
import { CHAT_HUB_BASE_URL } from '../../lib/api';

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
import {
  listVaultDocuments,
  parseAttachments,
  serializeAttachments,
  uploadChatAttachment,
  vaultDocumentToAttachment,
  MAX_CHAT_ATTACHMENTS,
  type ChatAttachment,
  type LocalPickedFile,
  type VaultDocument,
} from '../../api/chatAttachments';
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

/** Icon for an attachment chip based on its MIME type. */
function attachmentIcon(
  mimeType: string,
): React.ComponentProps<typeof Ionicons>['name'] {
  if (mimeType.startsWith('image/')) return 'image-outline';
  if (mimeType === 'application/pdf') return 'document-text-outline';
  return 'document-outline';
}

function ChatBubble({ message, isSelf, showAvatar, onRetry, onLongPress, highlighted }: BubbleProps) {
  const styles = useStyles();
  const { tokens } = useTheme();
  const { t } = useTranslation();

  // DG-CHAT-04: attachments travel as a JSON string on the message; merge any
  // client-only local attachments (optimistic, pre-server-echo) for display.
  const attachments: ChatAttachment[] = React.useMemo(() => {
    const parsed = parseAttachments(message.attachmentsJson);
    if (parsed.length > 0) return parsed;
    if (message.localAttachments && message.localAttachments.length > 0) {
      return message.localAttachments.map((la) => ({
        documentId: '',
        storagePath: la.localUri,
        fileName: la.fileName ?? 'attachment',
        mimeType: la.mimeType ?? 'application/octet-stream',
        source: 'capture' as const,
      }));
    }
    return [];
  }, [message.attachmentsJson, message.localAttachments]);

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
        {message.body ? (
          <Text
            style={[
              styles.bubbleText,
              { color: isSelf ? tokens.textOnBrand : tokens.textPrimary },
            ]}
          >
            {message.body}
          </Text>
        ) : null}

        {attachments.length > 0 && (
          <View style={styles.bubbleAttachments} testID={`bubble-attachments-${message.messageId}`}>
            {attachments.map((att, i) => {
              const isImage = att.mimeType.startsWith('image/');
              const localPreview = att.storagePath.startsWith('file:') || att.storagePath.startsWith('content:');
              return (
                <View
                  key={`${att.documentId || att.fileName}-${i}`}
                  style={[
                    styles.attachmentChip,
                    {
                      backgroundColor: isSelf ? tokens.textOnBrand + '22' : tokens.raised,
                      borderColor: isSelf ? tokens.textOnBrand + '44' : tokens.border,
                    },
                  ]}
                  accessibilityLabel={t('mobile.chat.attach.attachmentLabel', {
                    name: att.fileName,
                  })}
                >
                  {isImage && localPreview ? (
                    <Image source={{ uri: att.storagePath }} style={styles.attachmentThumb} />
                  ) : (
                    <Ionicons
                      name={attachmentIcon(att.mimeType)}
                      size={18}
                      color={isSelf ? tokens.textOnBrand : tokens.brand500}
                    />
                  )}
                  <Text
                    style={[
                      styles.attachmentChipText,
                      { color: isSelf ? tokens.textOnBrand : tokens.textPrimary },
                    ]}
                    numberOfLines={1}
                  >
                    {att.fileName}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

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

// BUG-W7-IOS-001: hub negotiate must target the ChatService host (:5107) —
// extra.apiBaseUrl is the AuthService host and has no /hubs/chat endpoint.
const HUB_BASE_URL = CHAT_HUB_BASE_URL;

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

  // ── DG-CHAT-04: attachments (camera/gallery upload + Document Vault picker) ─
  const [attachSheetOpen, setAttachSheetOpen] = useState(false);
  const [vaultOpen, setVaultOpen] = useState(false);
  const [vaultSelected, setVaultSelected] = useState<Record<string, VaultDocument>>({});
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [attachBusy, setAttachBusy] = useState(false);

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

  // ── DG-CHAT-04: attachment handlers ────────────────────────────────────────
  // Capture / gallery files are streamed through the SAME GCS pipeline the
  // Document Vault uses (POST /documents/upload) so every chat attachment is a
  // first-class, org-scoped, retained document. The Vault picker references
  // existing documents by id without re-uploading.

  const remainingSlots = MAX_CHAT_ATTACHMENTS - pendingAttachments.length;

  // Vault documents (lazy — only fetched when the picker opens).
  const { data: vaultDocs = [], isLoading: vaultLoading } = useQuery<VaultDocument[]>({
    queryKey: ['chat-vault-documents'],
    queryFn: () => listVaultDocuments(),
    enabled: vaultOpen,
  });

  const addUploadedFile = useCallback(
    async (file: LocalPickedFile) => {
      setAttachBusy(true);
      try {
        const attachment = await uploadChatAttachment(file);
        setPendingAttachments((prev) =>
          prev.length >= MAX_CHAT_ATTACHMENTS ? prev : [...prev, attachment],
        );
        haptics.success();
      } catch {
        haptics.error();
        Alert.alert(
          t('mobile.chat.attach.uploadFailedTitle'),
          t('mobile.chat.attach.uploadFailedBody'),
        );
      } finally {
        setAttachBusy(false);
      }
    },
    [haptics, t],
  );

  const handleAttachCapture = useCallback(async () => {
    setAttachSheetOpen(false);
    if (remainingSlots <= 0) {
      Alert.alert(
        t('mobile.chat.attach.maxTitle'),
        t('mobile.chat.attach.maxBody', { max: MAX_CHAT_ATTACHMENTS }),
      );
      return;
    }
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        t('mobile.chat.attach.cameraPermTitle'),
        t('mobile.chat.attach.cameraPermBody'),
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: 'images',
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    await addUploadedFile({
      uri: asset.uri,
      fileName: asset.fileName ?? `photo_${Date.now()}.jpg`,
      mimeType: asset.mimeType ?? 'image/jpeg',
      sizeBytes: asset.fileSize,
      source: 'capture',
    });
  }, [remainingSlots, addUploadedFile, t]);

  const handleAttachGallery = useCallback(async () => {
    setAttachSheetOpen(false);
    if (remainingSlots <= 0) {
      Alert.alert(
        t('mobile.chat.attach.maxTitle'),
        t('mobile.chat.attach.maxBody', { max: MAX_CHAT_ATTACHMENTS }),
      );
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        t('mobile.chat.attach.galleryPermTitle'),
        t('mobile.chat.attach.galleryPermBody'),
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      quality: 0.85,
      allowsMultipleSelection: true,
      selectionLimit: remainingSlots,
    });
    if (result.canceled || result.assets.length === 0) return;
    // Upload sequentially so progress/error per file stays simple.
    for (const asset of result.assets.slice(0, remainingSlots)) {
      await addUploadedFile({
        uri: asset.uri,
        fileName: asset.fileName ?? `image_${Date.now()}.jpg`,
        mimeType: asset.mimeType ?? 'image/jpeg',
        sizeBytes: asset.fileSize,
        source: 'gallery',
      });
    }
  }, [remainingSlots, addUploadedFile, t]);

  const handleOpenVault = useCallback(() => {
    setAttachSheetOpen(false);
    if (remainingSlots <= 0) {
      Alert.alert(
        t('mobile.chat.attach.maxTitle'),
        t('mobile.chat.attach.maxBody', { max: MAX_CHAT_ATTACHMENTS }),
      );
      return;
    }
    setVaultSelected({});
    setVaultOpen(true);
  }, [remainingSlots, t]);

  const toggleVaultSelection = useCallback(
    (doc: VaultDocument) => {
      setVaultSelected((prev) => {
        const next = { ...prev };
        if (next[doc.documentId]) {
          delete next[doc.documentId];
        } else {
          if (Object.keys(next).length >= remainingSlots) {
            haptics.error();
            return prev;
          }
          next[doc.documentId] = doc;
        }
        return next;
      });
    },
    [remainingSlots, haptics],
  );

  const confirmVaultSelection = useCallback(() => {
    const chosen = Object.values(vaultSelected).map(vaultDocumentToAttachment);
    if (chosen.length === 0) {
      setVaultOpen(false);
      return;
    }
    setPendingAttachments((prev) => {
      const existingIds = new Set(prev.map((a) => a.documentId));
      const toAdd = chosen.filter((a) => !existingIds.has(a.documentId));
      return [...prev, ...toAdd].slice(0, MAX_CHAT_ATTACHMENTS);
    });
    haptics.success();
    setVaultSelected({});
    setVaultOpen(false);
  }, [vaultSelected, haptics]);

  const removePendingAttachment = useCallback((documentId: string, fileName: string) => {
    setPendingAttachments((prev) =>
      prev.filter((a) => !(a.documentId === documentId && a.fileName === fileName)),
    );
  }, []);

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
    async (body: string, clientMessageId: string, attachmentsJson?: string) => {
      try {
        const sent = await sendMessage(threadId, {
          body,
          attachmentsJson,
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
    // DG-CHAT-04: allow sending an attachment-only message (no body text).
    const attachments = pendingAttachments;
    if ((!text && attachments.length === 0) || isSending) return;

    const attachmentsJson = serializeAttachments(attachments);
    const clientMessageId = newClientMessageId();
    const optimisticMsg: ChatMessage = {
      messageId: clientMessageId,
      threadId,
      senderUserId: 'me',
      body: text,
      attachmentsJson,
      createdAt: new Date().toISOString(),
      clientMessageId,
      localStatus: isOffline ? 'queued' : 'sending',
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    setComposerText('');
    setPendingAttachments([]);
    setIsSending(true);

    if (typingDebounceTimer.current) {
      clearTimeout(typingDebounceTimer.current);
    }

    if (isOffline) {
      // Queued — will flush on reconnect
      setIsSending(false);
      return;
    }

    await performSend(text, clientMessageId, attachmentsJson);
  }, [composerText, pendingAttachments, isSending, isOffline, threadId, performSend]);

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
      // Preserve the original attachments on retry (same clientMessageId dedupe).
      await performSend(failed.body, clientMessageId, failed.attachmentsJson);
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

        {/* DG-CHAT-04: pending attachments strip (above the composer) */}
        {(pendingAttachments.length > 0 || attachBusy) && (
          <View
            style={[styles.pendingStrip, { backgroundColor: tokens.sunken, borderTopColor: tokens.border }]}
            testID="chat-pending-attachments"
          >
            <FlatList
              data={pendingAttachments}
              keyExtractor={(a, i) => `${a.documentId || a.fileName}-${i}`}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.pendingList}
              ListFooterComponent={
                attachBusy ? (
                  <View style={[styles.pendingChip, styles.pendingChipBusy, { borderColor: tokens.border }]}>
                    <ActivityIndicator size="small" color={tokens.brand500} />
                  </View>
                ) : null
              }
              renderItem={({ item }) => {
                const isImage = item.mimeType.startsWith('image/');
                const hasLocalPreview =
                  item.storagePath.startsWith('file:') || item.storagePath.startsWith('content:');
                return (
                  <View style={[styles.pendingChip, { backgroundColor: tokens.raised, borderColor: tokens.border }]}>
                    {isImage && hasLocalPreview ? (
                      <Image source={{ uri: item.storagePath }} style={styles.pendingThumb} />
                    ) : (
                      <Ionicons name={attachmentIcon(item.mimeType)} size={20} color={tokens.brand500} />
                    )}
                    <Text style={[styles.pendingChipText, { color: tokens.textPrimary }]} numberOfLines={1}>
                      {item.fileName}
                    </Text>
                    <Pressable
                      style={styles.pendingRemove}
                      onPress={() => removePendingAttachment(item.documentId, item.fileName)}
                      accessibilityRole="button"
                      accessibilityLabel={t('mobile.chat.attach.remove', { name: item.fileName })}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="close-circle" size={18} color={tokens.textSecondary} />
                    </Pressable>
                  </View>
                );
              }}
            />
          </View>
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
            onPress={() => setAttachSheetOpen(true)}
            disabled={attachBusy}
            accessibilityRole="button"
            accessibilityLabel={t('mobile.chat.attach.open')}
            hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
            testID="chat-attach-button"
          >
            <Ionicons name="add-circle-outline" size={24} color={tokens.brand500} />
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
                  composerText.trim() || pendingAttachments.length > 0
                    ? tokens.brand500
                    : tokens.border,
              },
            ]}
            onPress={() => void handleSend()}
            disabled={(!composerText.trim() && pendingAttachments.length === 0) || isSending}
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

      {/* DG-CHAT-04: attach options bottom sheet */}
      <Modal
        visible={attachSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setAttachSheetOpen(false)}
      >
        <View style={styles.sheetBackdrop}>
          <Pressable
            style={styles.sheetBackdropTouch}
            onPress={() => setAttachSheetOpen(false)}
            accessibilityLabel={t('mobile.common.close')}
          />
          <View style={styles.sheet} accessibilityViewIsModal testID="chat-attach-sheet">
            <Text style={styles.sheetHint}>{t('mobile.chat.attach.sheetHint')}</Text>
            <Pressable
              style={styles.sheetAction}
              onPress={() => void handleAttachCapture()}
              accessibilityRole="button"
              accessibilityLabel={t('mobile.chat.attach.camera')}
              testID="chat-attach-camera"
            >
              <Ionicons name="camera-outline" size={20} color={tokens.brand500} />
              <Text style={styles.sheetActionText}>{t('mobile.chat.attach.camera')}</Text>
            </Pressable>
            <Pressable
              style={styles.sheetAction}
              onPress={() => void handleAttachGallery()}
              accessibilityRole="button"
              accessibilityLabel={t('mobile.chat.attach.gallery')}
              testID="chat-attach-gallery"
            >
              <Ionicons name="image-outline" size={20} color={tokens.brand500} />
              <Text style={styles.sheetActionText}>{t('mobile.chat.attach.gallery')}</Text>
            </Pressable>
            <Pressable
              style={styles.sheetAction}
              onPress={handleOpenVault}
              accessibilityRole="button"
              accessibilityLabel={t('mobile.chat.attach.vault')}
              testID="chat-attach-vault"
            >
              <Ionicons name="folder-open-outline" size={20} color={tokens.brand500} />
              <Text style={styles.sheetActionText}>{t('mobile.chat.attach.vault')}</Text>
            </Pressable>
            <Pressable
              style={styles.sheetAction}
              onPress={() => setAttachSheetOpen(false)}
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

      {/* DG-CHAT-04: Document Vault picker (multi-select, max 10) */}
      <Modal
        visible={vaultOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setVaultOpen(false)}
      >
        <View style={styles.sheetBackdrop}>
          <Pressable
            style={styles.sheetBackdropTouch}
            onPress={() => setVaultOpen(false)}
            accessibilityLabel={t('mobile.common.close')}
          />
          <View style={[styles.vaultSheet, { backgroundColor: tokens.raised }]} accessibilityViewIsModal testID="chat-vault-sheet">
            <View style={styles.vaultHeader}>
              <Text style={[styles.vaultTitle, { color: tokens.textPrimary }]}>
                {t('mobile.chat.attach.vaultTitle')}
              </Text>
              <Pressable
                onPress={() => setVaultOpen(false)}
                accessibilityRole="button"
                accessibilityLabel={t('mobile.common.close')}
                style={styles.vaultClose}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={22} color={tokens.textSecondary} />
              </Pressable>
            </View>

            {vaultLoading ? (
              <View style={styles.vaultLoading}>
                <ActivityIndicator color={tokens.brand500} />
              </View>
            ) : vaultDocs.length === 0 ? (
              <View style={styles.vaultEmpty}>
                <Ionicons name="folder-outline" size={40} color={tokens.textTertiary} />
                <Text style={[styles.vaultEmptyText, { color: tokens.textSecondary }]}>
                  {t('mobile.chat.attach.vaultEmpty')}
                </Text>
              </View>
            ) : (
              <FlatList
                data={vaultDocs}
                keyExtractor={(d) => d.documentId}
                style={styles.vaultList}
                renderItem={({ item }) => {
                  const selected = !!vaultSelected[item.documentId];
                  return (
                    <Pressable
                      style={[styles.vaultRow, selected && { backgroundColor: tokens.brandTint }]}
                      onPress={() => toggleVaultSelection(item)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      accessibilityLabel={item.fileName}
                      testID={`vault-row-${item.documentId}`}
                    >
                      <Ionicons
                        name={attachmentIcon(item.mimeType)}
                        size={22}
                        color={tokens.brand500}
                      />
                      <View style={styles.vaultRowMid}>
                        <Text style={[styles.vaultRowName, { color: tokens.textPrimary }]} numberOfLines={1}>
                          {item.fileName}
                        </Text>
                        {item.category ? (
                          <Text style={[styles.vaultRowMeta, { color: tokens.textTertiary }]} numberOfLines={1}>
                            {item.category}
                          </Text>
                        ) : null}
                      </View>
                      <Ionicons
                        name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                        size={22}
                        color={selected ? tokens.brand500 : tokens.border}
                      />
                    </Pressable>
                  );
                }}
              />
            )}

            <Pressable
              style={[
                styles.vaultConfirm,
                {
                  backgroundColor:
                    Object.keys(vaultSelected).length > 0 ? tokens.brand500 : tokens.border,
                },
              ]}
              onPress={confirmVaultSelection}
              disabled={Object.keys(vaultSelected).length === 0}
              accessibilityRole="button"
              accessibilityLabel={t('mobile.chat.attach.vaultConfirm', {
                count: Object.keys(vaultSelected).length,
              })}
              testID="chat-vault-confirm"
            >
              <Text style={styles.vaultConfirmText}>
                {t('mobile.chat.attach.vaultConfirm', {
                  count: Object.keys(vaultSelected).length,
                })}
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

  // DG-CHAT-04: attachment chips inside a message bubble
  bubbleAttachments: { gap: 4, marginTop: 2 },
  attachmentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 8,
    paddingVertical: 6,
    maxWidth: 220,
  },
  attachmentThumb: { width: 28, height: 28, borderRadius: 6 },
  attachmentChipText: { fontSize: 13, fontWeight: '500', flexShrink: 1 },

  // DG-CHAT-04: pending-attachments strip above the composer
  pendingStrip: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
  },
  pendingList: { paddingHorizontal: 8, gap: 8 },
  pendingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingLeft: 8,
    paddingRight: 4,
    paddingVertical: 6,
    maxWidth: 180,
  },
  pendingChipBusy: {
    width: 56,
    height: 44,
    justifyContent: 'center',
    paddingHorizontal: 0,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pendingThumb: { width: 28, height: 28, borderRadius: 6 },
  pendingChipText: { fontSize: 12, fontWeight: '500', flexShrink: 1 },
  pendingRemove: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // DG-CHAT-04: Document Vault picker sheet
  vaultSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 16,
    paddingBottom: 24,
    maxHeight: '80%',
  },
  vaultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  vaultTitle: { fontSize: 17, fontWeight: '700' },
  vaultClose: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  vaultLoading: { paddingVertical: 48, alignItems: 'center' },
  vaultEmpty: { paddingVertical: 48, alignItems: 'center', gap: 12, paddingHorizontal: 24 },
  vaultEmptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  vaultList: { paddingHorizontal: 12 },
  vaultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  vaultRowMid: { flex: 1, gap: 2 },
  vaultRowName: { fontSize: 14, fontWeight: '600' },
  vaultRowMeta: { fontSize: 12 },
  vaultConfirm: {
    marginHorizontal: 16,
    marginTop: 12,
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vaultConfirmText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  }),
);
