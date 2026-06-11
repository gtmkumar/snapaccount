/**
 * DocChecklistScreen — Document checklist with ProgressRing, upload affordance per item.
 * Checklist varies by salaried vs business (fetched from backend).
 * Phase 6D — docs/design/mobile/itr/doc-checklist-screen.md
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
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { ProgressRing } from '../../components/shared/ProgressRing';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { useSensitiveScreen } from '../../hooks/usePreventScreenCapture';
import { apiClient } from '../../lib/api';
import type { ItrStackParamList } from '../../navigation/ItrStack';

type NavProp = NativeStackNavigationProp<ItrStackParamList, 'DocChecklist'>;
type RoutePropType = RouteProp<ItrStackParamList, 'DocChecklist'>;

interface Props {
  navigation: NavProp;
  route: RoutePropType;
}

interface DocChecklistItem {
  id: string;
  label: string;
  description?: string;
  required: boolean;
  uploaded: boolean;
  category: 'income' | 'tax' | 'investment' | 'bank' | 'other';
}

const categoryColors = (tk: ThemeTokens): Record<DocChecklistItem['category'], string> => ({
  income: tk.brand500,
  tax: tk.itrAccent,
  investment: tk.successFg,
  bank: tk.loanAccent,
  other: tk.textSecondary,
});

export function DocChecklistScreen({ navigation, route }: Props) {
  const { tokens } = useTheme();
  const styles = useStyles();
  useSensitiveScreen();
  const { t } = useTranslation();
  const { assesseeId, filingId } = route.params;

  const [localUploaded, setLocalUploaded] = useState<Set<string>>(new Set());

  const { data: items = [], isLoading, refetch, isRefetching } = useQuery<DocChecklistItem[]>({
    queryKey: ['doc-checklist', assesseeId],
    queryFn: async () => {
      const res = await apiClient.get<DocChecklistItem[]>('/itr/doc-checklist', {
        params: { assesseeId },
      });
      return res.data;
    },
    placeholderData: [],
  });

  const allItems = items.map((item) => ({
    ...item,
    uploaded: item.uploaded || localUploaded.has(item.id),
  }));

  const requiredItems = allItems.filter((i) => i.required);
  const uploadedRequired = requiredItems.filter((i) => i.uploaded).length;
  const progress = requiredItems.length > 0 ? uploadedRequired / requiredItems.length : 0;

  const grouped = allItems.reduce<Record<string, DocChecklistItem[]>>((acc, item) => {
    const cat = item.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  const allRequiredDone = requiredItems.length > 0 && uploadedRequired === requiredItems.length;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={8}
          accessibilityLabel={t('mobile.common.back')}>
          <Ionicons name="arrow-back" size={22} color={tokens.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('mobile.itr.docChecklist.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Progress ring summary */}
        <View style={styles.progressCard}>
          <ProgressRing
            progress={progress}
            size={88}
            color={tokens.itrAccent}
            label={t('mobile.itr.docChecklist.required')}
            testID="doc-checklist-progress"
          />
          <View style={styles.progressText}>
            <Text style={styles.progressTitle}>
              {uploadedRequired}/{requiredItems.length} {t('mobile.itr.docChecklist.required')}
            </Text>
            <Text style={styles.progressSub}>{t('mobile.itr.docChecklist.progressSub')}</Text>
            {allRequiredDone && (
              <View style={styles.allDoneBadge}>
                <Ionicons name="checkmark-circle" size={14} color={tokens.successFg} />
                <Text style={styles.allDoneText}>{t('mobile.itr.docChecklist.allDone')}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Form 16 fast-track */}
        {filingId && (
          <Pressable
            style={styles.form16Cta}
            onPress={() => navigation.navigate('Form16Upload', { filingId })}
            accessibilityRole="button"
            accessibilityLabel={t('mobile.itr.docChecklist.uploadForm16')}
          >
            <View style={styles.form16Icon}>
              <Ionicons name="document-attach" size={24} color={tokens.itrAccent} />
            </View>
            <View style={styles.form16Text}>
              <Text style={styles.form16Title}>{t('mobile.itr.docChecklist.uploadForm16')}</Text>
              <Text style={styles.form16Sub}>{t('mobile.itr.docChecklist.form16Sub')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={tokens.textTertiary} />
          </Pressable>
        )}

        {/* Checklist groups */}
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <View key={i} style={styles.skeleton} />
          ))
        ) : (
          Object.entries(grouped).map(([category, catItems]) => (
            <View key={category} style={styles.categoryGroup}>
              <View style={styles.categoryHeader}>
                <View
                  style={[
                    styles.categoryDot,
                    { backgroundColor: categoryColors(tokens)[category as DocChecklistItem['category']] },
                  ]}
                />
                <Text style={styles.categoryLabel}>
                  {t(`mobile.itr.docChecklist.categories.${category}`)}
                </Text>
              </View>
              {catItems.map((item) => (
                <ChecklistRow
                  key={item.id}
                  item={item}
                  onUpload={() => {
                    // Navigate to document capture
                    setLocalUploaded((prev) => {
                      const next = new Set(prev);
                      next.add(item.id);
                      return next;
                    });
                    navigation.navigate('Form16Upload', { filingId: filingId ?? '' });
                  }}
                />
              ))}
            </View>
          ))
        )}
      </ScrollView>

      {/* Continue button */}
      {allRequiredDone && (
        <View style={styles.footer}>
          <Pressable
            style={styles.continueBtn}
            onPress={() =>
              navigation.navigate('RegimeComparison', { filingId: filingId ?? '' })
            }
            accessibilityRole="button"
            accessibilityLabel={t('mobile.itr.docChecklist.continue')}
          >
            <Text style={styles.continueBtnText}>{t('mobile.itr.docChecklist.continue')}</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

function ChecklistRow({
  item,
  onUpload,
}: {
  item: DocChecklistItem;
  onUpload: () => void;
}) {
  const { tokens } = useTheme();
  const styles = useStyles();
  return (
    <View style={[styles.checkRow, item.uploaded && styles.checkRowDone]}>
      <View
        style={[
          styles.checkCircle,
          item.uploaded && styles.checkCircleDone,
          !item.uploaded && !item.required && styles.checkCircleOptional,
        ]}
      >
        {item.uploaded ? (
          <Ionicons name="checkmark" size={14} color="#FFFFFF" />
        ) : (
          <Ionicons
            name={item.required ? 'ellipse-outline' : 'remove-outline'}
            size={14}
            color={item.required ? tokens.textTertiary : tokens.textTertiary}
          />
        )}
      </View>
      <View style={styles.checkContent}>
        <Text style={[styles.checkLabel, item.uploaded && styles.checkLabelDone]}>
          {item.label}
          {item.required && !item.uploaded && (
            <Text style={styles.requiredStar}> *</Text>
          )}
        </Text>
        {item.description && (
          <Text style={styles.checkDesc}>{item.description}</Text>
        )}
      </View>
      {!item.uploaded && (
        <Pressable
          style={styles.uploadBtn}
          onPress={onUpload}
          accessibilityRole="button"
          accessibilityLabel={`Upload ${item.label}`}
        >
          <Ionicons name="cloud-upload-outline" size={16} color={tokens.itrAccent} />
        </Pressable>
      )}
    </View>
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
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: tk.sunken, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: tk.textPrimary, letterSpacing: -0.2 },
  scrollContent: { padding: 16, gap: 16 },

  progressCard: {
    flexDirection: 'row',
    gap: 20,
    alignItems: 'center',
    backgroundColor: tk.raised,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: tk.border,
  },
  progressText: { flex: 1, gap: 4 },
  progressTitle: { fontSize: 18, fontWeight: '800', color: tk.textPrimary, letterSpacing: -0.2 },
  progressSub: { fontSize: 13, color: tk.textSecondary },
  allDoneBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  allDoneText: { fontSize: 13, fontWeight: '700', color: tk.successFg },

  form16Cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: tk.itrAccent + '0D',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: tk.itrAccent + '30',
    minHeight: 68,
  },
  form16Icon: { width: 44, height: 44, borderRadius: 12, backgroundColor: tk.itrAccent + '18', alignItems: 'center', justifyContent: 'center' },
  form16Text: { flex: 1, gap: 2 },
  form16Title: { fontSize: 14, fontWeight: '700', color: tk.itrAccent },
  form16Sub: { fontSize: 12, color: tk.textSecondary },

  categoryGroup: { gap: 8 },
  categoryHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  categoryDot: { width: 8, height: 8, borderRadius: 4 },
  categoryLabel: { fontSize: 13, fontWeight: '700', color: tk.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },

  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: tk.raised,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: tk.border,
    minHeight: 52,
  },
  checkRowDone: { backgroundColor: tk.successTint, borderColor: tk.successTintBorder },
  checkCircle: { width: 24, height: 24, borderRadius: 12, backgroundColor: tk.sunken, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkCircleDone: { backgroundColor: tk.successFg },
  checkCircleOptional: { backgroundColor: tk.canvas },
  checkContent: { flex: 1, gap: 2 },
  checkLabel: { fontSize: 14, fontWeight: '600', color: tk.textPrimary },
  checkLabelDone: { color: tk.successFg, textDecorationLine: 'line-through' },
  requiredStar: { color: tk.errorFg },
  checkDesc: { fontSize: 12, color: tk.textSecondary, lineHeight: 17 },
  uploadBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },

  skeleton: { height: 56, backgroundColor: tk.sunken, borderRadius: 12 },

  footer: { padding: 16, borderTopWidth: 1, borderTopColor: tk.border, backgroundColor: tk.raised },
  continueBtn: { backgroundColor: tk.itrAccent, borderRadius: 14, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  continueBtnText: { fontSize: 16, fontWeight: '700', color: tk.textOnBrand },
  }),
);
