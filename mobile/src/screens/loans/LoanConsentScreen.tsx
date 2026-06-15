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

import React, { useCallback, useRef, useState } from 'react';
import {
  AccessibilityInfo,
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
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useBiometricGate } from '../../hooks/useBiometricGate';
import type { RouteProp } from '@react-navigation/native';
import {
  createThemedStyles,
  useTheme,
  type ThemeTokens,
} from '../../contexts/ThemeContext';
import { useSensitiveScreen } from '../../hooks/usePreventScreenCapture';
import { useScreenReaderEnabled } from '../../hooks/useScreenReaderEnabled';
import {
  recordLoanConsent,
  getConsentCatalog,
  type ConsentType,
  type ConsentCatalogEntry,
} from '../../api/loans';
import { normalizeLocale } from '../../i18n/locale';
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
  const { t, i18n } = useTranslation();
  const { tokens } = useTheme();
  const styles = useStyles();
  const { applicationId, userName = 'User', acctMask = 'XXXX', kfsId = '' } = route.params;

  const { trigger: triggerBiometric } = useBiometricGate();
  const [currentStep, setCurrentStep] = useState(0);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [checked, setChecked] = useState(false);
  const [biometricPassed, setBiometricPassed] = useState(false);
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // A11Y CON-1 (Blocker): same screen-reader scroll-gate trap as KFS-1 — see
  // useScreenReaderEnabled. The explicit reviewed-all affordance satisfies the
  // gate per consent step; audit semantics (recordLoanConsent payload) unchanged.
  const screenReaderEnabled = useScreenReaderEnabled();

  const satisfyGateViaReader = useCallback(() => {
    setHasScrolledToBottom((already) => {
      if (!already) {
        AccessibilityInfo.announceForAccessibility(t('mobile.a11y.gateUnlocked'));
      }
      return true;
    });
  }, [t]);

  // NEW-D10: the consent body the user reads is rendered via t() in the active
  // UI locale — the catalog lookup and the recorded consentLocale must match it
  // so the DPDP audit trail references the language actually displayed.
  const activeLocale = normalizeLocale(i18n.language);

  // SEC-050: Fetch consent versions from backend catalog.
  // Falls back to FALLBACK_CONSENT_VERSION if endpoint not yet available (P6-HANDOFF-25).
  const { data: catalogData } = useQuery({
    queryKey: ['loan-consent-catalog', activeLocale],
    queryFn: () => getConsentCatalog(activeLocale),
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
        // GAP-021: kfsId is required — ties each consent to the acknowledged KFS
        kfsId: kfsId,
        // NEW-D10: record the locale the consent text was actually shown in
        // (was hardcoded 'en' — wrong for hi/bn users).
        consentLocale: activeLocale,
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
      // GAP-063 / M4: Use centralized useBiometricGate hook.
      // Handles hardware check, enrollment check, authenticateAsync,
      // and Alert-fallback for Expo Go / no-hardware paths.
      const passed = await triggerBiometric({
        promptMessage: t('mobile.biometric.prompt'),
      });
      if (!passed) return;
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
          <Ionicons name="arrow-back" size={22} color={tokens.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('mobile.loan.consent.title')}</Text>
        <View style={{ width: 44 }} />
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

        {/* A11Y CON-1: explicit reviewed-all affordance for screen-reader users
            — last element of the consent document, satisfies the scroll-gate. */}
        {screenReaderEnabled && !hasScrolledToBottom && (
          <Pressable
            style={styles.srGateBtn}
            onPress={satisfyGateViaReader}
            accessibilityRole="button"
            accessibilityLabel={t('mobile.a11y.reviewedAll')}
            accessibilityHint={t('mobile.a11y.reviewedAllHint')}
            testID="consent-sr-reviewed-all"
          >
            <Ionicons name="checkmark-done-outline" size={18} color={tokens.brandFg} />
            <Text style={styles.srGateBtnText}>{t('mobile.a11y.reviewedAll')}</Text>
          </Pressable>
        )}

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
    // P6-QA-MOBILE-09: 44×44pt minimum touch target (was 40×40).
    backBtn: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: tk.sunken,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: { fontSize: 18, fontWeight: '700', color: tk.textPrimary },

    docScroll: { flex: 1 },
    docContent: { padding: 20, gap: 16 },
    docHeader: { gap: 4 },
    docTitle: { fontSize: 17, fontWeight: '800', color: tk.textPrimary, letterSpacing: -0.2 },
    // CON-5 (a11y): consent version/date carries legal meaning — textSecondary keeps ≥4.5:1.
    docVersion: { fontSize: 12, color: tk.textSecondary, fontWeight: '500' },
    divider: { height: 1, backgroundColor: tk.border },
    docBody: { fontSize: 14, color: tk.textSecondary, lineHeight: 22 },

    // A11Y CON-1: screen-reader review affordance (≥44pt target).
    srGateBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      minHeight: 48,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: tk.brand400,
      backgroundColor: tk.brandTint,
      paddingHorizontal: 16,
      marginTop: 8,
    },
    srGateBtnText: { fontSize: 14, fontWeight: '700', color: tk.brandFg },

    // Modals — scrim constant across themes (slate-900 @ 60%).
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.6)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    modalCard: {
      backgroundColor: tk.raised,
      borderRadius: 20,
      padding: 24,
      width: '100%',
      gap: 16,
    },
    modalTitle: { fontSize: 18, fontWeight: '800', color: tk.textPrimary },
    modalBody: { fontSize: 14, color: tk.textSecondary, lineHeight: 21 },
    modalActions: { flexDirection: 'row', gap: 10 },
    modalCancelBtn: {
      flex: 1,
      minHeight: 48,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: tk.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalCancelText: { fontSize: 14, fontWeight: '600', color: tk.textSecondary },
    modalConfirmBtn: {
      flex: 1,
      minHeight: 48,
      borderRadius: 12,
      backgroundColor: tk.errorCta,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalConfirmText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  }),
);
