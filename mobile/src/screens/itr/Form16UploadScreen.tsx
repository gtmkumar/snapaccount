/**
 * Form16UploadScreen — Capture/upload Form 16 + OCR extraction review with editable fields.
 * Phase 6D — docs/design/mobile/itr/form-16-upload-screen.md
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
import { useMutation } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { useSensitiveScreen } from '../../hooks/usePreventScreenCapture';
import { uploadForm16 } from '../../api/itr';
import type { ItrStackParamList } from '../../navigation/ItrStack';

type NavProp = NativeStackNavigationProp<ItrStackParamList, 'Form16Upload'>;
type RoutePropType = RouteProp<ItrStackParamList, 'Form16Upload'>;

interface Props {
  navigation: NavProp;
  route: RoutePropType;
}

interface ExtractedFields {
  employeeName: string;
  panLast4: string;
  grossSalary: string;
  tdsDeducted: string;
  assessmentYear: string;
}

type UploadPhase = 'pick' | 'uploading' | 'review' | 'done';

export function Form16UploadScreen({ navigation, route }: Props) {
  const { tokens } = useTheme();
  const styles = useStyles();
  useSensitiveScreen();
  const { t } = useTranslation();
  const { filingId, assesseeId } = route.params;
  const [phase, setPhase] = useState<UploadPhase>('pick');
  const [selectedUri, setSelectedUri] = useState<string | null>(null);
  const [extractId, setExtractId] = useState<string | null>(null);
  const [fields, setFields] = useState<ExtractedFields>({
    employeeName: '',
    panLast4: '',
    grossSalary: '',
    tdsDeducted: '',
    assessmentYear: '',
  });

  const uploadMutation = useMutation({
    mutationFn: () =>
      uploadForm16(filingId, {
        assesseeId: assesseeId ?? '',
        gcsUri: selectedUri ?? '',
        employeePanCipher: '',
        employeePanLast4: fields.panLast4,
      }),
    onSuccess: (result) => {
      setExtractId(result.form16ExtractId);
      // Simulate OCR extraction for review
      setFields((prev) => ({
        ...prev,
        employeeName: prev.employeeName || 'Extracted from Form 16',
      }));
      setPhase('review');
    },
    onError: () => {
      Alert.alert(
        t('mobile.itr.form16.errorTitle'),
        t('mobile.itr.form16.errorBody'),
      );
      setPhase('pick');
    },
  });

  const pickDocument = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      quality: 0.85,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      setSelectedUri(result.assets[0].uri);
      setPhase('uploading');
      uploadMutation.mutate();
    }
  };

  const captureDocument = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        t('mobile.itr.form16.cameraPermissionTitle'),
        t('mobile.itr.form16.cameraPermissionBody'),
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: 'images',
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      setSelectedUri(result.assets[0].uri);
      setPhase('uploading');
      uploadMutation.mutate();
    }
  };

  const handleConfirmExtraction = () => {
    setPhase('done');
    navigation.navigate('RegimeComparison', { filingId });
  };

  const setField = (key: keyof ExtractedFields, value: string) =>
    setFields((prev) => ({ ...prev, [key]: value }));

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={8}
          accessibilityLabel={t('mobile.common.back')}>
          <Ionicons name="arrow-back" size={22} color={tokens.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('mobile.itr.form16.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {phase === 'pick' && (
          <>
            <View style={styles.illustrationWrap}>
              <View style={styles.illustrationIcon}>
                <Ionicons name="document-text" size={52} color={tokens.itrAccent} />
              </View>
              <Text style={styles.illustrationTitle}>{t('mobile.itr.form16.pickTitle')}</Text>
              <Text style={styles.illustrationSub}>{t('mobile.itr.form16.pickSub')}</Text>
            </View>

            <View style={styles.pickOptionsRow}>
              <Pressable
                style={styles.pickOption}
                onPress={captureDocument}
                accessibilityRole="button"
                accessibilityLabel={t('mobile.itr.form16.camera')}
              >
                <View style={styles.pickOptionIcon}>
                  <Ionicons name="camera" size={28} color={tokens.itrAccent} />
                </View>
                <Text style={styles.pickOptionLabel}>{t('mobile.itr.form16.camera')}</Text>
                <Text style={styles.pickOptionSub}>{t('mobile.itr.form16.cameraSub')}</Text>
              </Pressable>
              <Pressable
                style={styles.pickOption}
                onPress={pickDocument}
                accessibilityRole="button"
                accessibilityLabel={t('mobile.itr.form16.gallery')}
              >
                <View style={styles.pickOptionIcon}>
                  <Ionicons name="images" size={28} color={tokens.brand500} />
                </View>
                <Text style={styles.pickOptionLabel}>{t('mobile.itr.form16.gallery')}</Text>
                <Text style={styles.pickOptionSub}>{t('mobile.itr.form16.gallerySub')}</Text>
              </Pressable>
            </View>

            <View style={styles.tipsCard}>
              <Text style={styles.tipsTitle}>{t('mobile.itr.form16.tipsTitle')}</Text>
              {['mobile.itr.form16.tip1', 'mobile.itr.form16.tip2', 'mobile.itr.form16.tip3'].map((key) => (
                <View key={key} style={styles.tipRow}>
                  <Ionicons name="checkmark-circle-outline" size={14} color={tokens.successFg} />
                  <Text style={styles.tipText}>{t(key)}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {phase === 'uploading' && (
          <View style={styles.uploadingWrap}>
            <ActivityIndicator size="large" color={tokens.itrAccent} />
            <Text style={styles.uploadingTitle}>{t('mobile.itr.form16.uploading')}</Text>
            <Text style={styles.uploadingSub}>{t('mobile.itr.form16.uploadingSub')}</Text>
          </View>
        )}

        {phase === 'review' && (
          <>
            <View style={styles.reviewHeader}>
              <Ionicons name="checkmark-circle" size={28} color={tokens.successFg} />
              <View style={styles.reviewHeaderText}>
                <Text style={styles.reviewTitle}>{t('mobile.itr.form16.reviewTitle')}</Text>
                <Text style={styles.reviewSub}>{t('mobile.itr.form16.reviewSub')}</Text>
              </View>
            </View>

            {extractId && (
              <View style={styles.extractIdBadge}>
                <Text style={styles.extractIdText}>Extract ID: {extractId}</Text>
              </View>
            )}

            {(
              [
                { key: 'employeeName' as keyof ExtractedFields, label: t('mobile.itr.form16.employeeName') },
                { key: 'panLast4' as keyof ExtractedFields, label: t('mobile.itr.form16.panLast4') },
                { key: 'grossSalary' as keyof ExtractedFields, label: t('mobile.itr.form16.grossSalary') },
                { key: 'tdsDeducted' as keyof ExtractedFields, label: t('mobile.itr.form16.tdsDeducted') },
                { key: 'assessmentYear' as keyof ExtractedFields, label: t('mobile.itr.form16.assessmentYear') },
              ] as const
            ).map(({ key, label }) => (
              <View key={key} style={styles.reviewField}>
                <Text style={styles.reviewFieldLabel}>{label}</Text>
                <TextInput
                  style={styles.reviewFieldInput}
                  value={fields[key]}
                  onChangeText={(v) => setField(key, v)}
                  placeholderTextColor={tokens.textTertiary}
                  placeholder={t('mobile.itr.form16.notExtracted')}
                  accessibilityLabel={label}
                />
              </View>
            ))}

            <Pressable
              style={styles.confirmBtn}
              onPress={handleConfirmExtraction}
              accessibilityRole="button"
              accessibilityLabel={t('mobile.itr.form16.confirmExtraction')}
            >
              <Text style={styles.confirmBtnText}>{t('mobile.itr.form16.confirmExtraction')}</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
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
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: tk.sunken, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: tk.textPrimary, letterSpacing: -0.2 },
  scrollContent: { padding: 16, gap: 20 },

  illustrationWrap: { alignItems: 'center', paddingTop: 20, gap: 12 },
  illustrationIcon: { width: 96, height: 96, borderRadius: 24, backgroundColor: tk.itrAccent + '12', alignItems: 'center', justifyContent: 'center' },
  illustrationTitle: { fontSize: 20, fontWeight: '800', color: tk.textPrimary, textAlign: 'center', letterSpacing: -0.3 },
  illustrationSub: { fontSize: 14, color: tk.textSecondary, textAlign: 'center', lineHeight: 21, paddingHorizontal: 16 },

  pickOptionsRow: { flexDirection: 'row', gap: 12 },
  pickOption: {
    flex: 1,
    backgroundColor: tk.raised,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderColor: tk.border,
    minHeight: 130,
    justifyContent: 'center',
  },
  pickOptionIcon: { width: 56, height: 56, borderRadius: 16, backgroundColor: tk.canvas, alignItems: 'center', justifyContent: 'center' },
  pickOptionLabel: { fontSize: 14, fontWeight: '700', color: tk.textPrimary, textAlign: 'center' },
  pickOptionSub: { fontSize: 12, color: tk.textSecondary, textAlign: 'center' },

  tipsCard: { backgroundColor: tk.successTint, borderRadius: 14, padding: 16, gap: 10, borderWidth: 1, borderColor: tk.successTintBorder },
  tipsTitle: { fontSize: 14, fontWeight: '700', color: tk.successFg },
  tipRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  tipText: { flex: 1, fontSize: 13, color: tk.successFg, lineHeight: 18 },

  uploadingWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 16 },
  uploadingTitle: { fontSize: 18, fontWeight: '700', color: tk.textPrimary },
  uploadingSub: { fontSize: 14, color: tk.textSecondary },

  reviewHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: tk.successTint, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: tk.successTintBorder },
  reviewHeaderText: { flex: 1, gap: 2 },
  reviewTitle: { fontSize: 16, fontWeight: '700', color: tk.successFg },
  reviewSub: { fontSize: 13, color: tk.successFg },

  extractIdBadge: { backgroundColor: tk.sunken, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start' },
  extractIdText: { fontSize: 12, color: tk.textSecondary, fontFamily: 'monospace' },

  reviewField: { gap: 6 },
  reviewFieldLabel: { fontSize: 13, fontWeight: '600', color: tk.textSecondary },
  reviewFieldInput: {
    height: 48,
    borderWidth: 1.5,
    borderColor: tk.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    color: tk.textPrimary,
    backgroundColor: tk.raised,
  },

  confirmBtn: { backgroundColor: tk.itrAccent, borderRadius: 14, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  confirmBtnText: { fontSize: 16, fontWeight: '700', color: tk.textOnBrand },
  }),
);
