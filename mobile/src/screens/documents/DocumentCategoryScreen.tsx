/**
 * Document Category Selection Screen (DG-DOC-05)
 * Assign a category to a newly captured/uploaded document, then hand off to the
 * offline-first upload queue.
 * Matches docs/design/screens/mobile/document-vault.md §Screen 16.
 *
 * Reached from CameraScreen after capture ("Use Photo") or gallery pick. On
 * category tap we enqueue() through useDocumentQueue (which owns the QUEUED →
 * UPLOADING → PROCESSING → READY state machine, offline retry, and OCR kickoff)
 * and return to the Document List — no blocking inline upload.
 *
 * The value sent to the backend is the canonical document.document_category.code
 * (UPPERCASE), which the upload endpoint resolves to a category Guid (DG-DOC-02).
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import type { DocumentStackParamList } from '../../navigation/DocumentStack';
import { useDocumentQueue } from '../../hooks/useDocumentQueue';
import {
  classifyDocumentCategory,
  AI_SUGGESTION_MIN_CONFIDENCE,
  type CategorySuggestion,
  type DocumentCategoryCode,
} from '../../api/documentClassify';

type NavProp = NativeStackNavigationProp<DocumentStackParamList, 'DocumentCategory'>;
type RoutePropType = RouteProp<DocumentStackParamList, 'DocumentCategory'>;
interface Props { navigation: NavProp; route: RoutePropType }

type CategoryItem = {
  /** Canonical backend code (document.document_category.code, UPPERCASE). */
  code: DocumentCategoryCode;
  /** i18n key suffix under mobile.docCategory.options.* */
  i18nKey: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
};

const buildCategories = (tk: ThemeTokens): CategoryItem[] => [
  { code: 'SALES_BILL', i18nKey: 'salesBill', icon: 'receipt-outline', color: tk.successFg },
  { code: 'PURCHASE_BILL', i18nKey: 'purchaseBill', icon: 'cart-outline', color: tk.brandCta },
  { code: 'EXPENSE_RECEIPT', i18nKey: 'expense', icon: 'wallet-outline', color: tk.warningFg },
  { code: 'BANK_STATEMENT', i18nKey: 'bankStatement', icon: 'business-outline', color: tk.infoFg },
  { code: 'SALARY_SLIP', i18nKey: 'salarySlip', icon: 'person-outline', color: tk.gstAccent },
  { code: 'OTHER', i18nKey: 'other', icon: 'document-outline', color: tk.textSecondary },
];

export function DocumentCategoryScreen({ navigation, route }: Props) {
  const styles = useStyles();
  const { tokens } = useTheme();
  const { t } = useTranslation();
  const categories = useMemo(() => buildCategories(tokens), [tokens]);
  const { documentUri, filename } = route.params;
  const { enqueue } = useDocumentQueue();

  const [submitting, setSubmitting] = useState(false);
  const [suggestion, setSuggestion] = useState<CategorySuggestion | null>(null);
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);

  // ── AI auto-classify: ask backend (mock-first fallback) for a suggested category ──
  useEffect(() => {
    let active = true;
    classifyDocumentCategory({ localUri: documentUri, filename })
      .then((s) => { if (active) setSuggestion(s); })
      .catch(() => { /* never blocks the flow */ });
    return () => { active = false; };
  }, [documentUri, filename]);

  // Enqueue with the chosen category code, then return to the list (queue uploads
  // in the background / offline-first). Never an inline blocking upload.
  const handleSelectCategory = async (code: DocumentCategoryCode) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await enqueue({ localUri: documentUri, filename, category: code });
      navigation.navigate('DocumentList');
    } catch {
      // enqueue persists locally even if the immediate upload kick fails; still
      // return to the list so the user sees the queued item.
      navigation.navigate('DocumentList');
    } finally {
      setSubmitting(false);
    }
  };

  const suggestedCategory =
    suggestion?.categoryCode != null
      ? categories.find((c) => c.code === suggestion.categoryCode)
      : undefined;

  const showSuggestionBanner =
    !suggestionDismissed &&
    !!suggestedCategory &&
    (suggestion?.confidence ?? 0) > AI_SUGGESTION_MIN_CONFIDENCE;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.docCategory.back')}
          hitSlop={8}
        >
          <Ionicons name="arrow-back" size={22} color={tokens.brand500} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('mobile.docCategory.title')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <Text style={styles.subtext}>{t('mobile.docCategory.subtitle')}</Text>

      {/* Document thumbnail preview (Screen 16) */}
      {!!documentUri && (
        <View style={styles.thumbWrap}>
          <Image source={{ uri: documentUri }} style={styles.thumb} resizeMode="cover" />
        </View>
      )}

      {/* AI suggestion banner — shown if AI/heuristic confidence > 70% (Screen 16) */}
      {showSuggestionBanner && suggestedCategory && (
        <View style={styles.aiBanner} accessibilityRole="summary">
          <Ionicons name="sparkles-outline" size={18} color={tokens.infoFg} />
          <Text style={styles.aiBannerText}>
            {t('mobile.docCategory.ai.detected', {
              category: t(`mobile.docCategory.options.${suggestedCategory.i18nKey}.label`),
            })}
          </Text>
          <View style={styles.aiBannerActions}>
            <Pressable
              style={styles.aiBannerBtn}
              onPress={() => handleSelectCategory(suggestedCategory.code)}
              accessibilityRole="button"
              accessibilityLabel={t('mobile.docCategory.ai.confirm')}
              hitSlop={6}
            >
              <Text style={styles.aiBannerBtnText}>{t('mobile.docCategory.ai.confirm')}</Text>
            </Pressable>
            <Pressable
              style={styles.aiBannerBtnGhost}
              onPress={() => setSuggestionDismissed(true)}
              accessibilityRole="button"
              accessibilityLabel={t('mobile.docCategory.ai.dismiss')}
              hitSlop={6}
            >
              <Text style={styles.aiBannerBtnGhostText}>{t('mobile.docCategory.ai.dismiss')}</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Category grid */}
      <FlatList
        data={categories}
        numColumns={2}
        keyExtractor={(item) => item.code}
        renderItem={({ item }) => {
          const isSuggested = suggestedCategory?.code === item.code && showSuggestionBanner;
          return (
            <Pressable
              style={[
                styles.categoryCard,
                isSuggested && styles.categoryCardSuggested,
                submitting && styles.categoryCardDisabled,
              ]}
              onPress={() => handleSelectCategory(item.code)}
              disabled={submitting}
              accessibilityRole="button"
              accessibilityLabel={`${t(`mobile.docCategory.options.${item.i18nKey}.label`)}: ${t(`mobile.docCategory.options.${item.i18nKey}.hint`)}`}
            >
              {isSuggested && (
                <View style={styles.suggestedBadge}>
                  <Ionicons name="sparkles" size={10} color={tokens.textOnBrand} />
                </View>
              )}
              <View style={[styles.categoryIcon, { backgroundColor: item.color + '20' }]}>
                <Ionicons name={item.icon} size={22} color={item.color} />
              </View>
              <Text style={styles.categoryLabel}>
                {t(`mobile.docCategory.options.${item.i18nKey}.label`)}
              </Text>
              <Text style={styles.categoryHint} numberOfLines={2}>
                {t(`mobile.docCategory.options.${item.i18nKey}.hint`)}
              </Text>
            </Pressable>
          );
        }}
        columnWrapperStyle={styles.columnWrapper}
        contentContainerStyle={styles.gridContent}
      />

      {submitting && (
        <View style={styles.uploadingOverlay}>
          <Text style={styles.uploadingText}>{t('mobile.docCategory.queuing')}</Text>
        </View>
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: tk.raised,
    borderBottomWidth: 1,
    borderBottomColor: tk.border,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '700', color: tk.textPrimary },
  headerSpacer: { width: 44 },
  subtext: { fontSize: 14, color: tk.textSecondary, paddingHorizontal: 16, paddingTop: 12 },

  thumbWrap: {
    alignSelf: 'center',
    marginTop: 12,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: tk.border,
  },
  thumb: { width: 96, height: 120, backgroundColor: tk.raised },

  // AI suggestion banner
  aiBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: tk.infoTint,
    borderWidth: 1,
    borderColor: tk.infoFg,
  },
  aiBannerText: { flex: 1, minWidth: 160, fontSize: 13, color: tk.infoFg, fontWeight: '600' },
  aiBannerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  aiBannerBtn: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: tk.infoFg,
  },
  aiBannerBtnText: { fontSize: 13, fontWeight: '700', color: tk.textOnBrand },
  aiBannerBtnGhost: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  aiBannerBtnGhostText: { fontSize: 13, fontWeight: '600', color: tk.infoFg },

  gridContent: { padding: 16 },
  columnWrapper: { gap: 12, marginBottom: 12 },
  categoryCard: {
    flex: 1,
    backgroundColor: tk.raised,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: tk.border,
    alignItems: 'flex-start',
    minHeight: 44,
  },
  categoryCardSuggested: { borderColor: tk.infoFg, borderWidth: 2 },
  categoryCardDisabled: { opacity: 0.5 },
  suggestedBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: tk.infoFg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  categoryLabel: { fontSize: 14, fontWeight: '700', color: tk.textPrimary, marginBottom: 4 },
  categoryHint: { fontSize: 11, color: tk.textSecondary, lineHeight: 15 },
  uploadingOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: tk.brand500,
    padding: 16,
    alignItems: 'center',
  },
  uploadingText: { color: tk.textOnBrand, fontSize: 14, fontWeight: '600' },
  }),
);
