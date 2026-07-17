/**
 * ChatBookmarksScreen — bookmarked messages list (Wave 7A / GAP-043).
 * Tap a row → jump back into the thread scrolled to + highlighting the
 * message. Trailing icon / accessibility action un-bookmarks.
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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { ListSkeleton, EmptyState, ErrorState } from '../../components/shared/ListStates';
import { BookmarkRow } from '../../components/chat/BookmarkRow';
import { ImsUndoToast } from '../../components/gst/ImsUndoToast';
import { useHaptics } from '../../hooks/useHaptics';
import { listBookmarks, toggleBookmark, type BookmarkedMessage } from '../../api/chat';
import type { ChatStackParamList } from '../../navigation/ChatStack';

type NavProp = NativeStackNavigationProp<ChatStackParamList, 'ChatBookmarks'>;
interface Props { navigation: NavProp }

export function ChatBookmarksScreen({ navigation }: Props) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const haptics = useHaptics();
  const qc = useQueryClient();

  const [removeFailed, setRemoveFailed] = useState(false);

  const { data, isLoading, isRefetching, error, refetch } = useQuery({
    queryKey: ['chat-bookmarks'],
    queryFn: listBookmarks,
  });

  const removeMutation = useMutation({
    // Server toggle: calling it on a bookmarked message un-bookmarks it.
    mutationFn: ({ messageId }: { messageId: string }) => toggleBookmark(messageId),
    onMutate: async ({ messageId }) => {
      await qc.cancelQueries({ queryKey: ['chat-bookmarks'] });
      const previous = qc.getQueryData<{ items: BookmarkedMessage[] }>(['chat-bookmarks']);
      qc.setQueryData<{ items: BookmarkedMessage[] }>(['chat-bookmarks'], (old) =>
        old ? { ...old, items: old.items.filter((bm) => bm.messageId !== messageId) } : old,
      );
      haptics.warning();
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(['chat-bookmarks'], context.previous);
      haptics.error();
      setRemoveFailed(true);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['chat-bookmarks'] });
      void qc.invalidateQueries({ queryKey: ['chat-messages'] });
    },
  });

  const items = data?.items ?? [];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.common.back')}
          hitSlop={8}
        >
          <Ionicons name="arrow-back" size={22} color={tokens.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('mobile.chat.bookmarks.title')}</Text>
        <View style={{ width: 44 }} />
      </View>

      {isLoading ? (
        <View style={styles.body}>
          <ListSkeleton variant="row" count={6} testID="bookmarks-skeleton" />
        </View>
      ) : error ? (
        <ErrorState
          message={t('mobile.chat.bookmarks.error')}
          retryLabel={t('mobile.common.retry')}
          onRetry={() => void refetch()}
          secondaryLabel={t('mobile.common.goBack')}
          onSecondaryPress={() => navigation.goBack()}
          testID="bookmarks-error"
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon="bookmark-outline"
          title={t('mobile.chat.bookmarks.empty.title')}
          body={t('mobile.chat.bookmarks.empty.guidance')}
          testID="bookmarks-empty"
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.body}
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
          {items.map((bm) => (
            <BookmarkRow
              key={bm.messageId}
              bookmark={bm}
              onPress={() =>
                navigation.navigate('ChatDetail', {
                  threadId: bm.threadId,
                  source: 'bookmark',
                  highlightMessageId: bm.messageId,
                })
              }
              onRemove={() => removeMutation.mutate({ messageId: bm.messageId })}
            />
          ))}
        </ScrollView>
      )}

      {/* Optimistic-removal failure toast (row already restored) */}
      <ImsUndoToast
        visible={removeFailed}
        message={t('mobile.chat.bookmarks.removeFailed')}
        onDismiss={() => setRemoveFailed(false)}
        testID="bookmarks-remove-error-toast"
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
    headerTitle: { fontSize: 18, fontWeight: '700', color: tk.textPrimary },
    body: { padding: 16 },
  }),
);
