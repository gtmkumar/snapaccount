/**
 * AskAiScreen — lightweight "Ask AI" quick-answer surface (DG-CHAT-06).
 * docs/design/screens/mobile/expert-chat.md Screen 42 (AI Quick Answer) + 43 (starter prompts).
 *
 * Calls POST /ai/chat (org-scoped RAG). Renders the grounded answer plus a
 * source-chunk count footer (0 sources → "answer is general, not from your
 * data"). Starter prompts seed the input. This is a single-shot Q&A, not a
 * threaded conversation — the human Expert Chat remains the threaded surface.
 *
 * SEC: the prompt block on sensitive screens is unnecessary here (no tokens /
 * PII rendered); org scoping + redaction happen server-side.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { Ionicons } from '@expo/vector-icons';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { askAi, type AiChatResponse } from '../../api/ai';
import { getApiError } from '../../lib/api';
import { normalizeLocale } from '../../i18n/locale';
import { useHaptics } from '../../hooks/useHaptics';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import type { ChatStackParamList } from '../../navigation/ChatStack';

type NavProp = NativeStackNavigationProp<ChatStackParamList, 'AskAi'>;
interface Props { navigation: NavProp }

const STARTER_KEYS = ['gstDue', 'itc', 'lateFee', 'itrRegime'] as const;
const MAX_MESSAGE_LENGTH = 2000; // mirror backend AiChatQueryValidator guardrail

export function AskAiScreen({ navigation }: Props) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const { t, i18n } = useTranslation();
  const haptics = useHaptics();
  const [input, setInput] = useState('');
  const inputRef = useRef<TextInput>(null);

  const locale = useMemo(() => normalizeLocale(i18n.language), [i18n.language]);

  const mutation = useMutation<AiChatResponse, unknown, string>({
    mutationFn: (message: string) => askAi({ message: message.trim(), locale }),
    onSuccess: () => haptics.success(),
    onError: () => haptics.error(),
  });

  const submit = useCallback(
    (raw?: string) => {
      const message = (raw ?? input).trim();
      if (message.length === 0 || mutation.isPending) return;
      haptics.lightTap();
      mutation.mutate(message);
    },
    [input, mutation, haptics],
  );

  const onStarter = useCallback(
    (prompt: string) => {
      setInput(prompt);
      submit(prompt);
    },
    [submit],
  );

  const errorMessage = mutation.isError
    ? (() => {
        const err = getApiError(mutation.error);
        if (err.code === 'Ai.DailyBudgetExceeded' || err.statusCode === 429) {
          return t('mobile.ai.error.rateLimited');
        }
        return err.message || t('mobile.ai.error.generic');
      })()
    : null;

  const answer = mutation.data;
  const noSources = answer != null && answer.sourceChunkCount === 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.common.back')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="arrow-back" size={22} color={tokens.textPrimary} />
        </Pressable>
        <View style={styles.headerTitleWrap}>
          <Ionicons name="sparkles" size={16} color={tokens.brand500} />
          <Text style={styles.title}>{t('mobile.ai.title')}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.subtitle}>{t('mobile.ai.subtitle')}</Text>

          {/* Starter prompts — only when no answer yet */}
          {!answer && !mutation.isPending && (
            <View style={styles.startersWrap} testID="ask-ai-starters">
              <Text style={styles.startersLabel}>{t('mobile.ai.startersLabel')}</Text>
              {STARTER_KEYS.map((key) => {
                const prompt = t(`mobile.ai.starters.${key}`);
                return (
                  <Pressable
                    key={key}
                    style={styles.starterChip}
                    onPress={() => onStarter(prompt)}
                    accessibilityRole="button"
                    accessibilityLabel={prompt}
                    testID={`ask-ai-starter-${key}`}
                  >
                    <Ionicons
                      name="help-circle-outline"
                      size={18}
                      color={tokens.brand500}
                    />
                    <Text style={styles.starterText}>{prompt}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {/* Loading */}
          {mutation.isPending && (
            <View style={styles.loadingWrap} testID="ask-ai-loading">
              <ActivityIndicator color={tokens.brand500} />
              <Text style={styles.loadingText}>{t('mobile.ai.thinking')}</Text>
            </View>
          )}

          {/* Error */}
          {errorMessage && (
            <View style={styles.errorCard} testID="ask-ai-error">
              <Ionicons name="alert-circle-outline" size={20} color={tokens.errorFg} />
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          )}

          {/* Answer */}
          {answer && !mutation.isPending && (
            <View style={styles.answerCard} testID="ask-ai-answer">
              <View style={styles.answerHeader}>
                <View style={styles.aiBadge}>
                  <Ionicons name="sparkles" size={14} color={tokens.textOnBrand} />
                </View>
                <Text style={styles.answerHeaderText}>{t('mobile.ai.answerLabel')}</Text>
              </View>
              <Text style={styles.answerText} selectable>
                {answer.answer}
              </Text>
              <View style={styles.sourceRow}>
                <Ionicons
                  name={noSources ? 'information-circle-outline' : 'documents-outline'}
                  size={14}
                  color={tokens.textTertiary}
                />
                <Text style={styles.sourceText}>
                  {noSources
                    ? t('mobile.ai.sources.none')
                    : t('mobile.ai.sources.count', { count: answer.sourceChunkCount })}
                </Text>
              </View>
              <Text style={styles.disclaimer}>{t('mobile.ai.disclaimer')}</Text>
            </View>
          )}
        </ScrollView>

        {/* Composer */}
        <View style={styles.composer}>
          <TextInput
            ref={inputRef}
            style={styles.composerInput}
            placeholder={t('mobile.ai.inputPlaceholder')}
            placeholderTextColor={tokens.textTertiary}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={MAX_MESSAGE_LENGTH}
            returnKeyType="send"
            blurOnSubmit
            onSubmitEditing={() => submit()}
            testID="ask-ai-input"
          />
          <Pressable
            style={[
              styles.sendBtn,
              (input.trim().length === 0 || mutation.isPending) && styles.sendBtnDisabled,
            ]}
            onPress={() => submit()}
            disabled={input.trim().length === 0 || mutation.isPending}
            accessibilityRole="button"
            accessibilityLabel={t('mobile.ai.send')}
            testID="ask-ai-send"
          >
            <Ionicons name="arrow-up" size={20} color={tokens.textOnBrand} />
          </Pressable>
        </View>
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
      borderBottomWidth: 1,
      borderBottomColor: tk.border,
    },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: tk.sunken,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    title: { fontSize: 18, fontWeight: '700', color: tk.textPrimary, letterSpacing: -0.2 },
    scrollContent: { padding: 16, gap: 12 },
    subtitle: { fontSize: 14, color: tk.textSecondary, lineHeight: 20 },
    startersWrap: { gap: 10, marginTop: 4 },
    startersLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: tk.textTertiary,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    starterChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: tk.raised,
      borderWidth: 1,
      borderColor: tk.border,
      borderRadius: 14,
      paddingHorizontal: 14,
      minHeight: 52,
    },
    starterText: { flex: 1, fontSize: 14, color: tk.textPrimary, lineHeight: 19 },
    loadingWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 16 },
    loadingText: { fontSize: 14, color: tk.textSecondary },
    errorCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      backgroundColor: tk.errorTint,
      borderRadius: 14,
      padding: 14,
    },
    errorText: { flex: 1, fontSize: 14, color: tk.errorFg, lineHeight: 19 },
    answerCard: {
      backgroundColor: tk.raised,
      borderWidth: 1,
      borderColor: tk.border,
      borderRadius: 16,
      padding: 16,
      gap: 12,
    },
    answerHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    aiBadge: {
      width: 26,
      height: 26,
      borderRadius: 8,
      backgroundColor: tk.brand500,
      alignItems: 'center',
      justifyContent: 'center',
    },
    answerHeaderText: { fontSize: 13, fontWeight: '700', color: tk.textSecondary },
    answerText: { fontSize: 15, color: tk.textPrimary, lineHeight: 23 },
    sourceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderTopWidth: 1,
      borderTopColor: tk.border,
      paddingTop: 10,
    },
    sourceText: { fontSize: 12, color: tk.textTertiary },
    disclaimer: { fontSize: 11, color: tk.textTertiary, lineHeight: 16, fontStyle: 'italic' },
    composer: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: tk.raised,
      borderTopWidth: 1,
      borderTopColor: tk.border,
    },
    composerInput: {
      flex: 1,
      minHeight: 44,
      maxHeight: 120,
      backgroundColor: tk.sunken,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingTop: Platform.OS === 'ios' ? 12 : 8,
      paddingBottom: Platform.OS === 'ios' ? 12 : 8,
      fontSize: 15,
      color: tk.textPrimary,
    },
    sendBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: tk.brand500,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sendBtnDisabled: { opacity: 0.4 },
  }),
);
