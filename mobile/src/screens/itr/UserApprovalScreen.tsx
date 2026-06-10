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
import type { RouteProp } from '@react-navigation/native';
import { Colors } from '../../constants/colors';
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
  useSensitiveScreen();
  const { t } = useTranslation();
  const { trigger: triggerBiometric } = useBiometricGate();
  const { filingId } = route.params;
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [biometricPassed, setBiometricPassed] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const submitMutation = useMutation({
    mutationFn: () => submitFilingForReview(filingId),
    onSuccess: () => {
      navigation.navigate('EVerification', { filingId });
    },
    onError: () => {
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
          <Ionicons name="arrow-back" size={22} color={Colors.neutral[800]} />
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
            color={hasScrolledToBottom ? Colors.success[600] : Colors.neutral[400]}
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
            color={biometricPassed ? Colors.success[600] : Colors.neutral[400]}
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
            <Ionicons name="arrow-down-circle" size={20} color={Colors.neutral[400]} />
            <Text style={styles.scrollHintText}>{t('mobile.itr.approval.scrollHint')}</Text>
          </View>
        )}
        {hasScrolledToBottom && (
          <View style={styles.readConfirm}>
            <Ionicons name="checkmark-circle" size={20} color={Colors.success[600]} />
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
            <Ionicons name="finger-print" size={20} color={Colors.brand[600]} />
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
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="shield-checkmark" size={20} color={canApprove ? '#FFFFFF' : Colors.neutral[400]} />
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.base },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: Colors.surface.default, borderBottomWidth: 1, borderBottomColor: Colors.neutral[100],
  },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.neutral[100], alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.neutral[900] },

  progressRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: Colors.surface.default, borderBottomWidth: 1, borderBottomColor: Colors.neutral[100],
  },
  progressStep: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  progressStepDone: {},
  progressLabel: { fontSize: 13, fontWeight: '600', color: Colors.neutral[400] },
  progressLabelDone: { color: Colors.success[700] },
  progressConnector: { width: 24, height: 1, backgroundColor: Colors.neutral[200] },

  disclaimerScroll: { flex: 1 },
  disclaimerContent: { padding: 20, gap: 16 },
  disclaimerHeading: { fontSize: 17, fontWeight: '800', color: Colors.neutral[900], letterSpacing: -0.2 },
  disclaimerPara: { fontSize: 14, color: Colors.neutral[700], lineHeight: 22 },
  scrollHint: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', paddingVertical: 16 },
  scrollHintText: { fontSize: 13, color: Colors.neutral[400] },
  readConfirm: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.success[50], borderRadius: 10, padding: 12 },
  readConfirmText: { fontSize: 13, fontWeight: '600', color: Colors.success[700] },

  footer: {
    padding: 16, gap: 12,
    borderTopWidth: 1, borderTopColor: Colors.neutral[100], backgroundColor: Colors.surface.default,
  },
  biometricBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    minHeight: 52, borderRadius: 14, borderWidth: 1.5, borderColor: Colors.brand[300],
    backgroundColor: Colors.brand[50],
  },
  biometricText: { fontSize: 15, fontWeight: '600', color: Colors.brand[700] },
  approveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    minHeight: 56, borderRadius: 14, backgroundColor: Colors.itr,
  },
  approveBtnDisabled: { opacity: 0.4 },
  approveBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  approveBtnTextDisabled: { color: Colors.neutral[400] },
});
