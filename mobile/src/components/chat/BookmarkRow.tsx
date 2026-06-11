/**
 * BookmarkRow — row in ChatBookmarksScreen (Wave 7A / GAP-043).
 * Avatar + sender + 2-line snippet + ORIGINAL-message timestamp
 * (DD/MM/YYYY HH:mm, Wave 7 recon: messageCreatedAt) + thread subject.
 * senderDisplayName is intentionally absent from the server DTO (schema
 * isolation) — the sender line is a role-based fallback ("You" for the
 * caller's own messages, else CA / SnapAccount team / System / AI assistant).
 * Tap → jump-to-message; trailing icon (≥44pt) un-bookmarks (also exposed as
 * an accessibility action — never swipe/long-press-only).
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { formatIstDateTime } from '../../lib/ist';
import { useAuthStore } from '../../store/authStore';
import type { BookmarkedMessage } from '../../api/chat';

const ROLE_KEYS: Record<string, string> = {
  USER: 'mobile.chat.bookmarks.sender.member',
  CA: 'mobile.chat.bookmarks.sender.ca',
  ADMIN: 'mobile.chat.bookmarks.sender.admin',
  SYSTEM: 'mobile.chat.bookmarks.sender.system',
  AI: 'mobile.chat.bookmarks.sender.ai',
};

interface BookmarkRowProps {
  bookmark: BookmarkedMessage;
  onPress: () => void;
  onRemove: () => void;
  testID?: string;
}

export function BookmarkRow({ bookmark, onPress, onRemove, testID }: BookmarkRowProps) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const myUserId = useAuthStore((s) => s.user?.id);

  // Role-based sender fallback (senderDisplayName intentionally absent —
  // schema isolation). Own messages render as "You".
  const isMe =
    bookmark.senderRole === 'USER' &&
    !!bookmark.senderUserId &&
    bookmark.senderUserId === myUserId;
  const senderLabel = isMe
    ? t('mobile.chat.bookmarks.sender.you')
    : t(ROLE_KEYS[bookmark.senderRole] ?? ROLE_KEYS.USER);

  return (
    <View style={styles.card} testID={testID ?? `bookmark-row-${bookmark.messageId}`}>
      <Pressable
        style={styles.main}
        onPress={onPress}
        testID={`${testID ?? bookmark.messageId}-open`}
        accessibilityRole="button"
        accessibilityLabel={t('mobile.chat.bookmarks.rowA11y', {
          sender: senderLabel,
          snippet: bookmark.body,
        })}
        accessibilityHint={t('mobile.chat.bookmarks.rowHint')}
        accessibilityActions={[{ name: 'remove', label: t('mobile.chat.bookmark.remove') }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'remove') onRemove();
        }}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(senderLabel || bookmark.body).charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.mid}>
          <View style={styles.topLine}>
            <Text style={styles.sender} numberOfLines={1}>
              {senderLabel}
            </Text>
            {/* Original-message time (messageCreatedAt — Wave 7 recon). */}
            <Text style={styles.time}>{formatIstDateTime(bookmark.createdAt)}</Text>
          </View>
          <Text style={styles.snippet} numberOfLines={2}>
            {bookmark.body}
          </Text>
          {bookmark.threadSubject ? (
            <Text style={styles.thread} numberOfLines={1}>
              {bookmark.threadSubject}
            </Text>
          ) : null}
        </View>
      </Pressable>
      <Pressable
        style={styles.removeBtn}
        onPress={onRemove}
        accessibilityRole="button"
        accessibilityLabel={t('mobile.chat.bookmark.remove')}
        hitSlop={6}
        testID={`${testID ?? bookmark.messageId}-remove`}
      >
        <Ionicons name="bookmark" size={20} color={tokens.brand500} />
      </Pressable>
    </View>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: tk.raised,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: tk.border,
      marginBottom: 10,
    },
    main: {
      flex: 1,
      flexDirection: 'row',
      gap: 10,
      padding: 12,
    },
    avatar: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: tk.brand500,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: { color: tk.textOnBrand, fontSize: 14, fontWeight: '700' },
    mid: { flex: 1, gap: 2 },
    topLine: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    sender: { fontSize: 13, fontWeight: '700', color: tk.textPrimary, flexShrink: 1 },
    time: { fontSize: 11, color: tk.textTertiary },
    snippet: { fontSize: 13, color: tk.textSecondary, lineHeight: 18 },
    thread: { fontSize: 11, color: tk.textTertiary, marginTop: 2 },
    removeBtn: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 4,
    },
  }),
);
