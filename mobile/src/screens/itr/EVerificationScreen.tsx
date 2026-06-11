/**
 * EVerificationScreen — Manual ack: upload ITR-V or confirm EVC. Day-30 countdown.
 * Phase 6D — docs/design/mobile/itr/e-verification-screen.md
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { CountdownCard } from '../../components/shared/CountdownCard';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { useSensitiveScreen } from '../../hooks/usePreventScreenCapture';
import { eVerifyFiling, getItrFiling } from '../../api/itr';
import type { EVerificationMethod } from '../../api/itr';
import type { ItrStackParamList } from '../../navigation/ItrStack';

type NavProp = NativeStackNavigationProp<ItrStackParamList, 'EVerification'>;
type RoutePropType = RouteProp<ItrStackParamList, 'EVerification'>;

interface Props {
  navigation: NavProp;
  route: RoutePropType;
}

interface VerificationOption {
  method: EVerificationMethod;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  titleKey: string;
  subKey: string;
  recommended?: boolean;
}

const VERIFICATION_OPTIONS: VerificationOption[] = [
  {
    method: 'AadhaarOtp',
    icon: 'phone-portrait-outline',
    titleKey: 'mobile.itr.eVerify.aadhaarOtp',
    subKey: 'mobile.itr.eVerify.aadhaarOtpSub',
    recommended: true,
  },
  {
    method: 'NetBanking',
    icon: 'globe-outline',
    titleKey: 'mobile.itr.eVerify.netBanking',
    subKey: 'mobile.itr.eVerify.netBankingSub',
  },
  {
    method: 'BankAccountEvc',
    icon: 'card-outline',
    titleKey: 'mobile.itr.eVerify.bankEvc',
    subKey: 'mobile.itr.eVerify.bankEvcSub',
  },
  {
    method: 'Demat',
    icon: 'trending-up-outline',
    titleKey: 'mobile.itr.eVerify.demat',
    subKey: 'mobile.itr.eVerify.dematSub',
  },
  {
    method: 'ItrV',
    icon: 'cloud-upload-outline',
    titleKey: 'mobile.itr.eVerify.itrV',
    subKey: 'mobile.itr.eVerify.itrVSub',
  },
];

// Day-30 deadline from filing date
function getVerificationDeadline(filedAt?: string): string {
  if (!filedAt) {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  }
  const d = new Date(filedAt);
  d.setDate(d.getDate() + 30);
  return d.toISOString().split('T')[0];
}

export function EVerificationScreen({ navigation, route }: Props) {
  const { tokens } = useTheme();
  const styles = useStyles();
  useSensitiveScreen();
  const { t } = useTranslation();
  const { filingId } = route.params;
  const [selectedMethod, setSelectedMethod] = useState<EVerificationMethod | null>(null);
  const [itrVUri, setItrVUri] = useState<string | null>(null);

  const { data: filing } = useQuery({
    queryKey: ['itr-filing', filingId],
    queryFn: () => getItrFiling(filingId),
  });

  const verifyMutation = useMutation({
    mutationFn: () =>
      eVerifyFiling(filingId, {
        verificationMethod: selectedMethod!,
        itrVObjectKey: itrVUri ?? undefined,
      }),
    onSuccess: () => {
      navigation.navigate('RefundTracker', { filingId });
    },
    onError: () => {
      Alert.alert(
        t('mobile.itr.eVerify.errorTitle'),
        t('mobile.itr.eVerify.errorBody'),
      );
    },
  });

  const handlePickItrV = async () => {
    // Use image picker as fallback — expo-document-picker not installed.
    // ITR-V PDFs can be selected as images; backend accepts GCS URI regardless.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      quality: 0.9,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      setItrVUri(result.assets[0].uri);
    }
  };

  const deadline = getVerificationDeadline(filing?.createdAt);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={8}
          accessibilityLabel={t('mobile.common.back')}>
          <Ionicons name="arrow-back" size={22} color={tokens.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('mobile.itr.eVerify.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Day-30 countdown */}
        <CountdownCard
          title={t('mobile.itr.eVerify.deadlineTitle')}
          dueDate={deadline}
          description={t('mobile.itr.eVerify.deadlineDesc')}
          testID="everify-countdown"
        />

        <Text style={styles.sectionTitle}>{t('mobile.itr.eVerify.chooseMethod')}</Text>

        {/* Method options */}
        {VERIFICATION_OPTIONS.map((opt) => (
          <Pressable
            key={opt.method}
            style={[
              styles.optionCard,
              selectedMethod === opt.method && styles.optionCardSelected,
            ]}
            onPress={() => setSelectedMethod(opt.method)}
            accessibilityRole="radio"
            accessibilityState={{ checked: selectedMethod === opt.method }}
            accessibilityLabel={t(opt.titleKey)}
          >
            <View style={[
              styles.optionIcon,
              selectedMethod === opt.method && styles.optionIconSelected,
            ]}>
              <Ionicons
                name={opt.icon}
                size={22}
                color={selectedMethod === opt.method ? tokens.textOnBrand : tokens.textSecondary}
              />
            </View>
            <View style={styles.optionText}>
              <View style={styles.optionTitleRow}>
                <Text style={styles.optionTitle}>{t(opt.titleKey)}</Text>
                {opt.recommended && (
                  <View style={styles.recBadge}>
                    <Text style={styles.recBadgeText}>Recommended</Text>
                  </View>
                )}
              </View>
              <Text style={styles.optionSub}>{t(opt.subKey)}</Text>
            </View>
            <View style={[
              styles.radio,
              selectedMethod === opt.method && styles.radioSelected,
            ]}>
              {selectedMethod === opt.method && <View style={styles.radioInner} />}
            </View>
          </Pressable>
        ))}

        {/* ITR-V upload when selected */}
        {selectedMethod === 'ItrV' && (
          <Pressable
            style={styles.itrVUpload}
            onPress={handlePickItrV}
            accessibilityRole="button"
            accessibilityLabel={t('mobile.itr.eVerify.uploadItrV')}
          >
            <Ionicons
              name={itrVUri ? 'document-text' : 'cloud-upload-outline'}
              size={24}
              color={itrVUri ? tokens.successFg : tokens.itrAccent}
            />
            <Text style={[styles.itrVText, itrVUri && styles.itrVTextDone]}>
              {itrVUri ? t('mobile.itr.eVerify.itrVPicked') : t('mobile.itr.eVerify.uploadItrV')}
            </Text>
          </Pressable>
        )}
      </ScrollView>

      {/* Verify button */}
      <View style={styles.footer}>
        <Pressable
          style={[
            styles.verifyBtn,
            (!selectedMethod || verifyMutation.isPending ||
              (selectedMethod === 'ItrV' && !itrVUri)) && styles.verifyBtnDisabled,
          ]}
          onPress={() => verifyMutation.mutate()}
          disabled={
            !selectedMethod ||
            verifyMutation.isPending ||
            (selectedMethod === 'ItrV' && !itrVUri)
          }
          accessibilityRole="button"
          accessibilityLabel={t('mobile.itr.eVerify.verifyCta')}
        >
          {verifyMutation.isPending ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.verifyBtnText}>{t('mobile.itr.eVerify.verifyCta')}</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: tk.canvas },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: tk.raised, borderBottomWidth: 1, borderBottomColor: tk.border,
  },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: tk.sunken, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: tk.textPrimary },
  scrollContent: { padding: 16, gap: 14 },

  sectionTitle: { fontSize: 16, fontWeight: '700', color: tk.textPrimary, marginTop: 4 },

  optionCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: tk.raised, borderRadius: 14, padding: 16,
    borderWidth: 1.5, borderColor: tk.border, minHeight: 72,
  },
  optionCardSelected: { borderColor: tk.itrAccent, backgroundColor: tk.itrAccent + '06' },
  optionIcon: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: tk.sunken, alignItems: 'center', justifyContent: 'center',
  },
  optionIconSelected: { backgroundColor: tk.itrAccent },
  optionText: { flex: 1, gap: 3 },
  optionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  optionTitle: { fontSize: 14, fontWeight: '700', color: tk.textPrimary },
  optionSub: { fontSize: 12, color: tk.textSecondary, lineHeight: 17 },
  recBadge: { backgroundColor: tk.successTint, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  recBadgeText: { fontSize: 10, fontWeight: '700', color: tk.successFg },
  radio: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: tk.border,
    alignItems: 'center', justifyContent: 'center',
  },
  radioSelected: { borderColor: tk.itrAccent },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: tk.itrAccent },

  itrVUpload: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: tk.itrAccent + '0D', borderRadius: 12, padding: 16,
    borderWidth: 1.5, borderColor: tk.itrAccent + '40', borderStyle: 'dashed',
    minHeight: 60,
  },
  itrVText: { fontSize: 14, fontWeight: '600', color: tk.itrAccent },
  itrVTextDone: { color: tk.successFg },

  footer: { padding: 16, borderTopWidth: 1, borderTopColor: tk.border, backgroundColor: tk.raised },
  verifyBtn: { backgroundColor: tk.itrAccent, borderRadius: 14, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  verifyBtnDisabled: { opacity: 0.4 },
  verifyBtnText: { fontSize: 16, fontWeight: '700', color: tk.textOnBrand },
  }),
);
