/**
 * CorrectionRequestScreen — DPDP Right to Correction (submit form)
 * Phase 7 Wave 2 | M3b (GAP-020)
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Colors } from '../../constants/colors';
import { submitDataCorrection } from '../../api/privacy';
import type { MoreStackParamList } from '../../navigation/MoreStack';

type NavProp = NativeStackNavigationProp<MoreStackParamList, 'CorrectionRequest'>;
interface Props { navigation: NavProp }

const DATA_CATEGORIES = [
  'name', 'businessName', 'gstin', 'panDisplay', 'phone', 'email', 'address', 'other',
] as const;

type DataCategory = typeof DATA_CATEGORIES[number];

export function CorrectionRequestScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [category, setCategory] = useState<DataCategory | ''>('');
  const [description, setDescription] = useState('');
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  const submitMutation = useMutation({
    mutationFn: () =>
      submitDataCorrection({
        dataCategory: category,
        description: description.trim(),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['privacy-corrections'] });
      Alert.alert(
        t('mobile.privacy.correction.toast.submitted'),
        '',
        [{ text: 'OK', onPress: () => navigation.navigate('MyCorrections') }],
      );
    },
    onError: () => {
      Alert.alert(t('mobile.common.error'), t('mobile.privacy.correction.error.submit'));
    },
  });

  const canSubmit = category !== '' && description.trim().length > 5;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={8} accessibilityLabel={t('mobile.common.back')}>
          <Ionicons name="arrow-back" size={22} color={Colors.neutral[800]} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('mobile.privacy.correction.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text style={styles.explainer}>Tell us what's wrong and we'll review it.</Text>

        {/* Category select */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>{t('mobile.privacy.correction.field.label')}</Text>
          <Pressable
            style={styles.selectRow}
            onPress={() => setShowCategoryPicker(true)}
            accessibilityRole="button"
          >
            <Text style={category ? styles.selectValue : styles.selectPlaceholder}>
              {category
                ? t(`mobile.privacy.correction.field.options.${category}`)
                : t('mobile.privacy.correction.field.label')}
            </Text>
            <Ionicons name="chevron-down" size={18} color={Colors.neutral[400]} />
          </Pressable>
        </View>

        {/* Description */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>{t('mobile.privacy.correction.field.description')}</Text>
          <TextInput
            style={styles.textarea}
            multiline
            numberOfLines={5}
            placeholder={t('mobile.privacy.correction.field.descriptionPlaceholder')}
            placeholderTextColor={Colors.neutral[400]}
            value={description}
            onChangeText={setDescription}
            maxLength={1000}
            textAlignVertical="top"
            accessibilityLabel={t('mobile.privacy.correction.field.description')}
          />
          <Text style={styles.charCount}>{description.length} / 1000</Text>
        </View>

        {/* Info banner */}
        <View style={styles.infoBanner}>
          <Ionicons name="information-circle-outline" size={16} color={Colors.accent[600]} />
          <Text style={styles.infoBannerText}>{t('mobile.privacy.correction.info.reverify')}</Text>
        </View>

        {/* Category picker modal-like sheet */}
        {showCategoryPicker && (
          <View style={styles.pickerOverlay}>
            <View style={styles.pickerCard}>
              <Text style={styles.pickerTitle}>{t('mobile.privacy.correction.field.label')}</Text>
              {DATA_CATEGORIES.map((cat) => (
                <Pressable
                  key={cat}
                  style={[styles.pickerOption, category === cat && styles.pickerOptionSelected]}
                  onPress={() => {
                    setCategory(cat);
                    setShowCategoryPicker(false);
                  }}
                  accessibilityRole="button"
                >
                  <Text style={[styles.pickerOptionText, category === cat && styles.pickerOptionTextSelected]}>
                    {t(`mobile.privacy.correction.field.options.${cat}`)}
                  </Text>
                  {category === cat && <Ionicons name="checkmark" size={16} color={Colors.brand[600]} />}
                </Pressable>
              ))}
              <Pressable style={styles.pickerCancel} onPress={() => setShowCategoryPicker(false)}>
                <Text style={styles.pickerCancelText}>{t('mobile.privacy.correction.cta.cancel')}</Text>
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Sticky footer */}
      <View style={styles.stickyFooter}>
        <Pressable
          style={styles.cancelBtn}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
        >
          <Text style={styles.cancelBtnText}>{t('mobile.privacy.correction.cta.cancel')}</Text>
        </Pressable>
        <Pressable
          style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
          onPress={() => { if (canSubmit) submitMutation.mutate(); }}
          disabled={!canSubmit || submitMutation.isPending}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSubmit }}
          accessibilityLabel={t('mobile.privacy.correction.cta.submit')}
        >
          {submitMutation.isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={[styles.submitBtnText, !canSubmit && styles.submitBtnTextDisabled]}>
              {t('mobile.privacy.correction.cta.submit')}
            </Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.base },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: Colors.surface.default, borderBottomWidth: 1, borderBottomColor: Colors.neutral[100],
  },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.neutral[100], alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.neutral[900] },

  scrollContent: { padding: 16, gap: 16, paddingBottom: 100 },
  explainer: { fontSize: 14, color: Colors.neutral[600], lineHeight: 21 },

  fieldGroup: { gap: 8 },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: Colors.neutral[700] },
  selectRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.surface.default, borderRadius: 12,
    borderWidth: 1.5, borderColor: Colors.neutral[200],
    paddingHorizontal: 14, paddingVertical: 14, minHeight: 52,
  },
  selectValue: { fontSize: 15, color: Colors.neutral[900] },
  selectPlaceholder: { fontSize: 15, color: Colors.neutral[400] },

  textarea: {
    backgroundColor: Colors.surface.default, borderRadius: 12,
    borderWidth: 1.5, borderColor: Colors.neutral[200],
    paddingHorizontal: 14, paddingVertical: 14,
    fontSize: 15, color: Colors.neutral[900], lineHeight: 22,
    minHeight: 140,
  },
  charCount: { fontSize: 12, color: Colors.neutral[400], textAlign: 'right' },

  infoBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: Colors.accent[50], borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: Colors.accent[100],
  },
  infoBannerText: { flex: 1, fontSize: 13, color: Colors.accent[700], lineHeight: 20 },

  pickerOverlay: {
    position: 'absolute', top: 0, left: -16, right: -16, bottom: -100,
    backgroundColor: Colors.surface.overlay, justifyContent: 'flex-end', zIndex: 100,
  },
  pickerCard: {
    backgroundColor: Colors.surface.default, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 16, gap: 4,
  },
  pickerTitle: { fontSize: 16, fontWeight: '700', color: Colors.neutral[900], marginBottom: 8, paddingHorizontal: 8 },
  pickerOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 8, paddingVertical: 14, borderRadius: 10, minHeight: 48,
  },
  pickerOptionSelected: { backgroundColor: Colors.brand[50] },
  pickerOptionText: { fontSize: 15, color: Colors.neutral[900] },
  pickerOptionTextSelected: { fontWeight: '700', color: Colors.brand[700] },
  pickerCancel: {
    marginTop: 8, paddingVertical: 14, alignItems: 'center', minHeight: 48,
    backgroundColor: Colors.neutral[100], borderRadius: 12,
  },
  pickerCancelText: { fontSize: 15, fontWeight: '600', color: Colors.neutral[700] },

  stickyFooter: {
    flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 12, paddingBottom: 20,
    backgroundColor: Colors.surface.default, borderTopWidth: 1, borderTopColor: Colors.neutral[100],
  },
  cancelBtn: {
    flex: 1, minHeight: 52, borderRadius: 14, borderWidth: 1.5, borderColor: Colors.neutral[200],
    alignItems: 'center', justifyContent: 'center',
  },
  cancelBtnText: { fontSize: 15, fontWeight: '600', color: Colors.neutral[600] },
  submitBtn: {
    flex: 2, minHeight: 52, borderRadius: 14, backgroundColor: Colors.brand[600],
    alignItems: 'center', justifyContent: 'center',
  },
  submitBtnDisabled: { backgroundColor: Colors.neutral[200] },
  submitBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  submitBtnTextDisabled: { color: Colors.neutral[400] },
});
