/**
 * UserApprovalScreen — Scroll-to-bottom-before-approve gate, biometric re-auth, disclaimer.
 * Phase 6D — docs/design/mobile/itr/user-approval-screen.md
 */

import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useBiometricGate } from '../../hooks/useBiometricGate';
import { useHaptics } from '../../hooks/useHaptics';
import type { RouteProp } from '@react-navigation/native';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { useSensitiveScreen } from '../../hooks/usePreventScreenCapture';
import { submitFilingForReview } from '../../api/itr';
import type { ItrStackParamList } from '../../navigation/ItrStack';

type NavProp = NativeStackNavigationProp<ItrStackParamList, 'UserApproval'>;
type RoutePropType = RouteProp<ItrStackParamList, 'UserApproval'>;

interface Props {
  navigation: NavProp;
  route: RoutePropType;
}

const DISCLAIMER_PARAGRAPHS = [
  'mobile.itr.approval.disclaimerPara1',
  'mobile.itr.approval.disclaimerPara2',
  'mobile.itr.approval.disclaimerPara3',
  'mobile.itr.approval.disclaimerPara4',
  'mobile.itr.approval.disclaimerPara5',
];

export function UserApprovalScreen({ navigation, route }: Props) {
  const { tokens } = useTheme();
  const styles = useStyles();
  useSensitiveScreen();
  const { t } = useTranslation();
  const { trigger: triggerBiometric } = useBiometricGate();
  const haptics = useHaptics();
  const { filingId } = route.params;
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [biometricPassed, setBiometricPassed] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const submitMutation = useMutation({
    mutationFn: () => submitFilingForReview(filingId),
    onSuccess: () => {
      haptics.success(); // §3.3: primary action success
      navigation.navigate('EVerification', { filingId });
    },
    onError: () => {
      haptics.error(); // §3.3: submit failure
      Alert.alert(
        t('mobile.itr.approval.errorTitle'),
        t('mobile.itr.approval.errorBody'),
      );
    },
  });

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const isAtBottom =
      layoutMeasurement.height + contentOffset.y >= contentSize.height - 40;
    if (isAtBottom && !hasScrolledToBottom) {
      setHasScrolledToBottom(true);
    }
  };

  const handleBiometric = async () => {
    // GAP-063 / M4: Use centralized useBiometricGate hook.
    const passed = await triggerBiometric({
      promptMessage: t('mobile.biometric.prompt'),
    });
    if (passed) {
      setBiometricPassed(true);
    }
    // On failure/cancel: do nothing — user must re-tap the biometric button
  };

  const handleApprove = () => {
    if (!hasScrolledToBottom) {
      Alert.alert(
        t('mobile.itr.approval.scrollFirst'),
        t('mobile.itr.approval.scrollFirstBody'),
      );
      return;
    }
    if (!biometricPassed) {
      Alert.alert(
        t('mobile.itr.approval.verifyFirst'),
        t('mobile.itr.approval.verifyFirstBody'),
      );
      return;
    }
    submitMutation.mutate();
  };

  const canApprove = hasScrolledToBottom && biometricPassed;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={8}
          accessibilityLabel={t('mobile.common.back')}>
          <Ionicons name="arrow-back" size={22} color={tokens.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('mobile.itr.approval.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Progress indicators */}
      <View style={styles.progressRow}>
        <View style={[styles.progressStep, hasScrolledToBottom && styles.progressStepDone]}>
          <Ionicons
            name={hasScrolledToBottom ? 'checkmark-circle' : 'document-text-outline'}
            size={18}
            color={hasScrolledToBottom ? tokens.successFg : tokens.textTertiary}
          />
          <Text style={[styles.progressLabel, hasScrolledToBottom && styles.progressLabelDone]}>
            {t('mobile.itr.approval.stepRead')}
          </Text>
        </View>
        <View style={styles.progressConnector} />
        <View style={[styles.progressStep, biometricPassed && styles.progressStepDone]}>
          <Ionicons
            name={biometricPassed ? 'checkmark-circle' : 'finger-print-outline'}
            size={18}
            color={biometricPassed ? tokens.successFg : tokens.textTertiary}
          />
          <Text style={[styles.progressLabel, biometricPassed && styles.progressLabelDone]}>
            {t('mobile.itr.approval.stepVerify')}
          </Text>
        </View>
      </View>

      {/* Disclaimer scroll area */}
      <ScrollView
        ref={scrollRef}
        style={styles.disclaimerScroll}
        contentContainerStyle={styles.disclaimerContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator
      >
        <Text style={styles.disclaimerHeading}>
          {t('mobile.itr.approval.disclaimerHeading')}
        </Text>
        {DISCLAIMER_PARAGRAPHS.map((key) => (
          <Text key={key} style={styles.disclaimerPara}>
            {t(key)}
          </Text>
        ))}
        {!hasScrolledToBottom && (
          <View style={styles.scrollHint}>
            <Ionicons name="arrow-down-circle" size={20} color={tokens.textTertiary} />
            <Text style={styles.scrollHintText}>{t('mobile.itr.approval.scrollHint')}</Text>
          </View>
        )}
        {hasScrolledToBottom && (
          <View style={styles.readConfirm}>
            <Ionicons name="checkmark-circle" size={20} color={tokens.successFg} />
            <Text style={styles.readConfirmText}>{t('mobile.itr.approval.readConfirmed')}</Text>
          </View>
        )}
      </ScrollView>

      {/* Biometric + Approve */}
      <View style={styles.footer}>
        {!biometricPassed && hasScrolledToBottom && (
          <Pressable
            style={styles.biometricBtn}
            onPress={handleBiometric}
            accessibilityRole="button"
            accessibilityLabel={t('mobile.itr.approval.biometricCta')}
          >
            <Ionicons name="finger-print" size={20} color={tokens.brandCta} />
            <Text style={styles.biometricText}>{t('mobile.itr.approval.biometricCta')}</Text>
          </Pressable>
        )}

        <Pressable
          style={[styles.approveBtn, (!canApprove || submitMutation.isPending) && styles.approveBtnDisabled]}
          onPress={handleApprove}
          disabled={submitMutation.isPending}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.itr.approval.approveCta')}
        >
          {submitMutation.isPending ? (
            <ActivityIndicator color={tokens.textOnBrand} />
          ) : (
            <>
              <Ionicons name="shield-checkmark" size={20} color={canApprove ? tokens.textOnBrand : tokens.textTertiary} />
              <Text style={[styles.approveBtnText, !canApprove && styles.approveBtnTextDisabled]}>
                {t('mobile.itr.approval.approveCta')}
              </Text>
            </>
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

  progressRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: tk.raised, borderBottomWidth: 1, borderBottomColor: tk.border,
  },
  progressStep: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  progressStepDone: {},
  progressLabel: { fontSize: 13, fontWeight: '600', color: tk.textTertiary },
  progressLabelDone: { color: tk.successFg },
  progressConnector: { width: 24, height: 1, backgroundColor: tk.border },

  disclaimerScroll: { flex: 1 },
  disclaimerContent: { padding: 20, gap: 16 },
  disclaimerHeading: { fontSize: 17, fontWeight: '800', color: tk.textPrimary, letterSpacing: -0.2 },
  disclaimerPara: { fontSize: 14, color: tk.textSecondary, lineHeight: 22 },
  scrollHint: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', paddingVertical: 16 },
  scrollHintText: { fontSize: 13, color: tk.textTertiary },
  readConfirm: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: tk.successTint, borderRadius: 10, padding: 12 },
  readConfirmText: { fontSize: 13, fontWeight: '600', color: tk.successFg },

  footer: {
    padding: 16, gap: 12,
    borderTopWidth: 1, borderTopColor: tk.border, backgroundColor: tk.raised,
  },
  biometricBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    minHeight: 52, borderRadius: 14, borderWidth: 1.5, borderColor: tk.brand400,
    backgroundColor: tk.brandTint,
  },
  biometricText: { fontSize: 15, fontWeight: '600', color: tk.brandFg },
  approveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    minHeight: 56, borderRadius: 14, backgroundColor: tk.itrAccent,
  },
  approveBtnDisabled: { opacity: 0.4 },
  approveBtnText: { fontSize: 16, fontWeight: '700', color: tk.textOnBrand },
  approveBtnTextDisabled: { color: tk.textTertiary },
  }),
);
