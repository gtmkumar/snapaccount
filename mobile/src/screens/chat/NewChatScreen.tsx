/**
 * NewChatScreen — start a new support conversation (BUG-W7-002).
 * docs/design/mobile/chat/chat-list-screen-refresh.md §4.6 — the new-thread
 * sheet: pick category → optional subject → first message → create.
 *
 * Opened (modal) from ChatListScreen's header "+" button and FAB. On success
 * the thread list is invalidated and we replace into ChatDetail so back
 * returns to the inbox, not this compose screen.
 *
 * Categories are the SERVER categories (GST/ITR/DOC/LOAN/BILLING/GENERAL) —
 * see src/api/chat.ts ServerThreadCategory wire-format note.
 */

import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import {
  createThread,
  type CreateThreadResponse,
  type ServerThreadCategory,
} from '../../api/chat';
import { newClientMessageId } from '../../lib/ids';
import { useHaptics } from '../../hooks/useHaptics';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import type { ChatStackParamList } from '../../navigation/ChatStack';

type NavProp = NativeStackNavigationProp<ChatStackParamList, 'NewChat'>;
interface Props { navigation: NavProp }

const SUBJECT_MAX = 200; // StartThreadCommandValidator: Subject max 200
const MESSAGE_MAX = 4000; // StartThreadCommandValidator: InitialMessage max 4000

interface CategoryOption {
  key: ServerThreadCategory;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}

const CATEGORY_OPTIONS: CategoryOption[] = [
  { key: 'GENERAL', icon: 'chatbubble-outline' },
  { key: 'GST', icon: 'receipt-outline' },
  { key: 'ITR', icon: 'calculator-outline' },
  { key: 'DOC', icon: 'document-text-outline' },
  { key: 'LOAN', icon: 'cash-outline' },
  { key: 'BILLING', icon: 'card-outline' },
];

export function NewChatScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { tokens } = useTheme();
  const styles = useStyles();
  const haptics = useHaptics();
  const queryClient = useQueryClient();

  const [category, setCategory] = useState<ServerThreadCategory>('GENERAL');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      createThread({
        category,
        subject: subject.trim() || undefined,
        initialMessage: message.trim(),
        clientMessageId: newClientMessageId(),
      }),
    onSuccess: async (res: CreateThreadResponse) => {
      haptics.success();
      await queryClient.invalidateQueries({ queryKey: ['chat-threads'] });
      // Replace so hardware/header back from the new thread returns to the inbox.
      navigation.replace('ChatDetail', { threadId: res.threadId, source: 'list' });
    },
    onError: () => {
      haptics.error();
    },
  });

  const canSubmit = message.trim().length > 0 && !mutation.isPending;

  const onSubmit = () => {
    if (!canSubmit) return;
    haptics.lightTap();
    mutation.mutate();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.common.back')}
          hitSlop={8}
          testID="new-chat-back"
        >
          <Ionicons name="close" size={22} color={tokens.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('mobile.chat.new.title')}</Text>
        <View style={{ width: 44 }} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          {/* Category picker */}
          <Text style={styles.sectionLabel}>{t('mobile.chat.new.category.label')}</Text>
          <View style={styles.categoryGrid}>
            {CATEGORY_OPTIONS.map((opt) => {
              const selected = category === opt.key;
              const label = t(`mobile.chat.new.category.${opt.key.toLowerCase()}`);
              return (
                <Pressable
                  key={opt.key}
                  style={[styles.categoryChip, selected && styles.categoryChipSelected]}
                  onPress={() => {
                    haptics.lightTap();
                    setCategory(opt.key);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={label}
                  testID={`new-chat-category-${opt.key}`}
                >
                  <Ionicons
                    name={opt.icon}
                    size={16}
                    color={selected ? tokens.textOnBrand : tokens.textSecondary}
                  />
                  <Text
                    style={[
                      styles.categoryChipText,
                      selected && styles.categoryChipTextSelected,
                    ]}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Subject (optional) */}
          <Text style={styles.sectionLabel}>{t('mobile.chat.new.subject.label')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('mobile.chat.new.subject.placeholder')}
            placeholderTextColor={tokens.textTertiary}
            value={subject}
            onChangeText={setSubject}
            maxLength={SUBJECT_MAX}
            returnKeyType="next"
            accessibilityLabel={t('mobile.chat.new.subject.label')}
            testID="new-chat-subject"
          />

          {/* First message (required) */}
          <Text style={styles.sectionLabel}>{t('mobile.chat.new.message.label')}</Text>
          <TextInput
            style={[styles.input, styles.messageInput]}
            placeholder={t('mobile.chat.new.message.placeholder')}
            placeholderTextColor={tokens.textTertiary}
            value={message}
            onChangeText={setMessage}
            maxLength={MESSAGE_MAX}
            multiline
            textAlignVertical="top"
            accessibilityLabel={t('mobile.chat.new.message.label')}
            testID="new-chat-message"
          />

          {/* Error */}
          {mutation.isError ? (
            <Text style={styles.errorText} testID="new-chat-error">
              {t('mobile.chat.new.error')}
            </Text>
          ) : null}

          {/* Submit */}
          <Pressable
            style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
            onPress={onSubmit}
            disabled={!canSubmit}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSubmit }}
            accessibilityLabel={t('mobile.chat.new.submit')}
            testID="new-chat-submit"
          >
            <Text style={styles.submitBtnText}>
              {mutation.isPending
                ? t('mobile.chat.new.submitting')
                : t('mobile.chat.new.submit')}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: tk.canvas },
    flex: { flex: 1 },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: tk.raised,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: tk.border,
    },
    backBtn: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '700',
      letterSpacing: -0.2,
      color: tk.textPrimary,
    },

    body: { padding: 16, gap: 8, paddingBottom: 32 },
    sectionLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: tk.textSecondary,
      marginTop: 10,
      marginBottom: 4,
    },

    categoryGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    categoryChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      borderRadius: 100,
      minHeight: 44,
      backgroundColor: tk.sunken,
      borderColor: tk.border,
      borderWidth: 1,
    },
    categoryChipSelected: {
      backgroundColor: tk.brand500,
      borderColor: tk.brand500,
    },
    categoryChipText: { fontSize: 13, fontWeight: '600', color: tk.textSecondary },
    categoryChipTextSelected: { color: tk.textOnBrand },

    input: {
      minHeight: 44,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: tk.border,
      backgroundColor: tk.raised,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
      color: tk.textPrimary,
    },
    messageInput: { minHeight: 120 },

    errorText: { fontSize: 13, color: '#DC2626', marginTop: 8 },

    submitBtn: {
      marginTop: 16,
      minHeight: 48,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: tk.brand500,
    },
    submitBtnDisabled: { opacity: 0.45 },
    submitBtnText: { fontSize: 15, fontWeight: '700', color: tk.textOnBrand },
  }),
);
