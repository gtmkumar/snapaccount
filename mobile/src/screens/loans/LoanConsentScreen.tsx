/**
 * LoanConsentScreen — 3-step DPDP-compliant consent capture.
 * Phase 6C — docs/design/mobile/loans/loan-consent-screen.md
 *
 * Steps: CREDIT_BUREAU → DATA_SHARE_WITH_BANK → DISBURSEMENT_MANDATE
 * Gate: scroll-to-bottom-before-enable (identical pattern to UserApprovalScreen)
 * Biometric: expo-local-authentication (SEC-048); Alert fallback on no-hardware devices.
 * Security: useSensitiveScreen — consent screen is a legal commitment
 *
 * Telemetry: loan.consent.opened, loan.consent.scrolledToEnd,
 *            loan.consent.signed, loan.consent.declined
 */

import React, { useRef, useState } from 'react';
import {
  Alert,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
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
import * as LocalAuthentication from 'expo-local-authentication';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { Colors } from '../../constants/colors';
import { useSensitiveScreen } from '../../hooks/usePreventScreenCapture';
import {
  recordLoanConsent,
  getConsentCatalog,
  type ConsentType,
  type ConsentCatalogEntry,
} from '../../api/loans';
import { ConsentSignatureBlock } from '../../components/loans/ConsentSignatureBlock';
import { ScrollHintBanner } from '../../components/loans/ScrollHintBanner';
import { Stepper } from '../../components/shared/Stepper';
import type { LoanStackParamList } from '../../navigation/LoanStack';

type NavProp = NativeStackNavigationProp<LoanStackParamList, 'LoanConsent'>;
type RoutePropType = RouteProp<LoanStackParamList, 'LoanConsent'>;
interface Props { navigation: NavProp; route: RoutePropType }

// SEC-050: Fallback version used ONLY when backend catalog endpoint is unavailable
// (e.g., during P6-HANDOFF-25 window). Remove once GET /loans/consents/catalog ships.
const FALLBACK_CONSENT_VERSION = '1.4';
const CONSENT_DATE = '12 Apr 2026';

const CONSENT_STEPS: {
  type: ConsentType;
  titleKey: string;
  bodyKey: string;
  flagKey: string;
  stepLabelKey: string;
}[] = [
  {
    type: 'CREDIT_BUREAU',
    titleKey: 'mobile.loan.consent.docTitle.bureau',
    bodyKey: 'mobile.loan.consent.body.bureau',
    flagKey: 'mobile.loan.consent.sig.flag.bureau',
    stepLabelKey: 'mobile.loan.consent.step.bureau',
  },
  {
    type: 'DATA_SHARE_WITH_BANK',
    titleKey: 'mobile.loan.consent.docTitle.dataShare',
    bodyKey: 'mobile.loan.consent.body.dataShare',
    flagKey: 'mobile.loan.consent.sig.flag.dataShare',
    stepLabelKey: 'mobile.loan.consent.step.dataShare',
  },
  {
    type: 'DISBURSEMENT_MANDATE',
    titleKey: 'mobile.loan.consent.docTitle.mandate',
    bodyKey: 'mobile.loan.consent.body.mandate',
    flagKey: 'mobile.loan.consent.sig.flag.mandate',
    stepLabelKey: 'mobile.loan.consent.step.mandate',
  },
];

export function LoanConsentScreen({ navigation, route }: Props) {
  useSensitiveScreen();
  const { t } = useTranslation();
  const { applicationId, userName = 'User', acctMask = 'XXXX' } = route.params;

  const [currentStep, setCurrentStep] = useState(0);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [checked, setChecked] = useState(false);
  const [biometricPassed, setBiometricPassed] = useState(false);
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // SEC-050: Fetch consent versions from backend catalog.
  // Falls back to FALLBACK_CONSENT_VERSION if endpoint not yet available (P6-HANDOFF-25).
  const { data: catalogData } = useQuery({
    queryKey: ['loan-consent-catalog'],
    queryFn: getConsentCatalog,
    staleTime: 5 * 60 * 1000, // 5 min — version doesn't change mid-session
    retry: false, // Don't retry 404 — fall through to fallback
  });

  const getConsentVersion = (consentType: ConsentType): string => {
    const entry: ConsentCatalogEntry | undefined = catalogData?.items.find(
      (item) => item.consentType === consentType,
    );
    return entry?.textVersion ?? FALLBACK_CONSENT_VERSION;
  };

  const step = CONSENT_STEPS[currentStep];
  const now = new Date().toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const signMutation = useMutation({
    mutationFn: () =>
      recordLoanConsent(applicationId, {
        // SEC-050: version sourced from backend catalog, not hardcoded
        consentVersion: getConsentVersion(step.type),
        consentType: step.type,
      }),
    onSuccess: () => {
      if (currentStep < CONSENT_STEPS.length - 1) {
        // Advance to next step
        setCurrentStep((s) => s + 1);
        setHasScrolledToBottom(false);
        setChecked(false);
        setBiometricPassed(false);
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      } else {
        // All 3 signed — navigate to application screen
        navigation.navigate('LoanApplication', {
          productId: route.params.productId ?? '',
          productName: route.params.productName ?? '',
          applicationId,
        });
      }
    },
    onError: () => {
      Alert.alert(
        t('mobile.common.retry'),
        t('mobile.loan.consent.error.network'),
      );
    },
  });

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
    const isAtBottom =
      layoutMeasurement.height + contentOffset.y >= contentSize.height - 24;
    if (isAtBottom && !hasScrolledToBottom) {
      setHasScrolledToBottom(true);
    }
  };

  const handleSign = async () => {
    if (!checked) return;
    if (!biometricPassed) {
      // SEC-048: Real biometric via expo-local-authentication.
      // Graceful fallback to Alert PIN confirm on devices with no biometric hardware.
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      if (!hasHardware) {
        Alert.alert(
          t('mobile.loan.consent.bio.prompt'),
          t('mobile.common.usePin'),
          [
            { text: t('mobile.common.cancel'), style: 'cancel' },
            {
              text: t('common.confirm'),
              onPress: () => {
                setBiometricPassed(true);
                signMutation.mutate();
              },
            },
          ],
        );
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: t('mobile.biometric.confirm'),
        fallbackLabel: t('common.usePin'),
        disableDeviceFallback: false,
      });

      if (!result.success) {
        // Bio cancelled or failed — do not proceed
        return;
      }

      setBiometricPassed(true);
      signMutation.mutate();
    } else {
      signMutation.mutate();
    }
  };

  const handleDeclineConfirm = () => {
    setShowDeclineModal(false);
    navigation.goBack();
  };

  const stepLabels = CONSENT_STEPS.map((s) => t(s.stepLabelKey));

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={8}
          accessibilityLabel={t('mobile.common.back')}
        >
          <Ionicons name="arrow-back" size={22} color={Colors.neutral[800]} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('mobile.loan.consent.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Stepper */}
      <Stepper steps={stepLabels} currentStep={currentStep} testID="consent-stepper" />

      {/* Consent document */}
      <ScrollView
        ref={scrollRef}
        style={styles.docScroll}
        contentContainerStyle={styles.docContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator
      >
        {/* Document header */}
        <View style={styles.docHeader}>
          <Text style={styles.docTitle}>{t(step.titleKey)}</Text>
          <Text style={styles.docVersion}>
            {t('mobile.loan.consent.version', {
              version: getConsentVersion(step.type),
              date: CONSENT_DATE,
            })}
          </Text>
        </View>

        <View style={styles.divider} />

        {/* Legal body */}
        <Text style={styles.docBody}>
          {t(step.bodyKey, { acctMask })}
        </Text>

        {/* Extra padding to ensure scrollable */}
        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Scroll hint */}
      <ScrollHintBanner visible={!hasScrolledToBottom} testID="scroll-hint-banner" />

      {/* Signature block */}
      <ConsentSignatureBlock
        flagText={t(step.flagKey, { name: userName, dateTime: now })}
        scrolledToBottom={hasScrolledToBottom}
        checked={checked}
        onToggle={() => setChecked((v) => !v)}
        onDecline={() => setShowDeclineModal(true)}
        onSign={handleSign}
        isSubmitting={signMutation.isPending}
        signLabel={t('mobile.loan.consent.cta.signContinue')}
        declineLabel={t('mobile.loan.consent.cta.decline')}
        testID="consent-signature-block"
      />

      {/* Decline confirmation modal */}
      <Modal
        visible={showDeclineModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeclineModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('mobile.loan.consent.declineModal.title')}</Text>
            <Text style={styles.modalBody}>{t('mobile.loan.consent.declineModal.body')}</Text>
            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalCancelBtn}
                onPress={() => setShowDeclineModal(false)}
                accessibilityRole="button"
              >
                <Text style={styles.modalCancelText}>
                  {t('mobile.loan.consent.declineModal.cancel')}
                </Text>
              </Pressable>
              <Pressable
                style={styles.modalConfirmBtn}
                onPress={handleDeclineConfirm}
                accessibilityRole="button"
              >
                <Text style={styles.modalConfirmText}>
                  {t('mobile.loan.consent.declineModal.confirm')}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.base },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.surface.default,
    borderBottomWidth: 1,
    borderBottomColor: Colors.neutral[100],
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.neutral[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.neutral[900] },

  docScroll: { flex: 1 },
  docContent: { padding: 20, gap: 16 },
  docHeader: { gap: 4 },
  docTitle: { fontSize: 17, fontWeight: '800', color: Colors.neutral[900], letterSpacing: -0.2 },
  docVersion: { fontSize: 12, color: Colors.neutral[400], fontWeight: '500' },
  divider: { height: 1, backgroundColor: Colors.neutral[100] },
  docBody: { fontSize: 14, color: Colors.neutral[700], lineHeight: 22 },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.surface.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: Colors.surface.default,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    gap: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: Colors.neutral[900] },
  modalBody: { fontSize: 14, color: Colors.neutral[600], lineHeight: 21 },
  modalActions: { flexDirection: 'row', gap: 10 },
  modalCancelBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.neutral[200],
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: { fontSize: 14, fontWeight: '600', color: Colors.neutral[600] },
  modalConfirmBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: Colors.error[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalConfirmText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
});
