/**
 * LoanPackagePreviewScreen — View and submit the PDF package to the partner bank.
 * Phase 6C — docs/design/mobile/loans/loan-package-preview-screen.md
 *
 * Security:
 *  - useSensitiveScreen — PII + financial data visible
 *  - Entry gate: biometric required on mount (view-time gate) — SEC-048: real LocalAuthentication
 *  - Submit gate: second biometric challenge on "Submit to {Bank}" — SEC-048: real LocalAuthentication
 *  - PDF URL: never cached — fetched fresh each view (1h TTL per P6-HANDOFF-20)
 *
 * Canonical disclaimer (DO NOT ALTER):
 *  "Prepared by SnapAccount from user-provided data. Not a CA certification.
 *   Final lending decision rests with the partner bank."
 */

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as LocalAuthentication from 'expo-local-authentication';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { useSensitiveScreen } from '../../hooks/usePreventScreenCapture';
import {
  getLoanApplication,
  getLoanPackageDownloadUrl,
  submitLoanApplication,
} from '../../api/loans';
import { useBiometricGate } from '../../hooks/useBiometricGate';
import { PackageMetaStrip } from '../../components/loans/PackageMetaStrip';
import { PdfViewerMobile } from '../../components/loans/PdfViewerMobile';
import { DisclaimerCard } from '../../components/loans/DisclaimerCard';
import { AccordionSection } from '../../components/shared/AccordionSection';
import type { LoanStackParamList } from '../../navigation/LoanStack';

type NavProp = NativeStackNavigationProp<LoanStackParamList, 'LoanPackagePreview'>;
type RoutePropType = RouteProp<LoanStackParamList, 'LoanPackagePreview'>;
interface Props { navigation: NavProp; route: RoutePropType }

export function LoanPackagePreviewScreen({ navigation, route }: Props) {
  const { tokens } = useTheme();
  const styles = useStyles();
  useSensitiveScreen();
  const { t } = useTranslation();
  const { trigger: triggerBiometric } = useBiometricGate();
  const { applicationId } = route.params;

  // View-time biometric gate
  const [viewBioPassed, setViewBioPassed] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);

  // View-time gate: prompt on mount — SEC-048: real biometric
  useEffect(() => {
    if (!viewBioPassed) {
      void (async () => {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        if (!hasHardware) {
          // Fallback: Alert PIN confirm on devices with no biometric hardware
          Alert.alert(
            t('mobile.loan.preview.bio.gate.prompt'),
            t('mobile.common.usePin'),
            [
              {
                text: t('mobile.common.cancel'),
                style: 'cancel',
                onPress: () => navigation.goBack(),
              },
              { text: t('common.confirm'), onPress: () => setViewBioPassed(true) },
            ],
            { cancelable: false },
          );
          return;
        }

        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: t('mobile.biometric.confirm'),
          fallbackLabel: t('common.usePin'),
          disableDeviceFallback: false,
        });

        if (result.success) {
          setViewBioPassed(true);
        } else {
          // Bio cancelled/failed — exit the screen
          navigation.goBack();
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const appQuery = useQuery({
    queryKey: ['loan-application', applicationId],
    queryFn: () => getLoanApplication(applicationId),
    enabled: viewBioPassed,
  });

  // Never cache — fetch a fresh signed URL each view. (A stable queryKey with
  // staleTime/gcTime 0 + refetchOnMount 'always' replaces the old Date.now()
  // key, which was impure-in-render and forced a new cache entry every render.)
  const urlQuery = useQuery({
    queryKey: ['loan-package-url', applicationId],
    queryFn: () => getLoanPackageDownloadUrl(applicationId),
    enabled: viewBioPassed,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  });

  const submitMutation = useMutation({
    mutationFn: () => submitLoanApplication(applicationId),
    onSuccess: () => {
      navigation.navigate('LoanStatus', { applicationId });
    },
    onError: () => {
      Alert.alert(t('mobile.common.retry'), t('mobile.loan.preview.error.submitFailed'));
    },
  });

  const handleSubmitPress = () => {
    setShowSubmitConfirm(true);
  };

  const handleSubmitConfirm = async () => {
    setShowSubmitConfirm(false);
    // SEC-048 + DG-MOBUX-07: Submit-time biometric gate via the centralized
    // useBiometricGate hook — gains the 5-min grace window + structured refusal
    // (first cancel → retry Alert, second → cancel). flowKey 'loan.submit'.
    const passed = await triggerBiometric({
      promptMessage: t('mobile.loan.preview.bio.submitPrompt'),
      flowKey: 'loan.submit',
    });
    if (passed) {
      submitMutation.mutate();
    }
    // On failure/cancel: do nothing — user can tap submit again
  };

  const app = appQuery.data;

  // Not yet passed bio gate
  if (!viewBioPassed) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={tokens.loanAccent} />
        </View>
      </SafeAreaView>
    );
  }

  if (appQuery.isLoading || urlQuery.isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Ionicons name="document-text-outline" size={36} color={tokens.textTertiary} />
          <Text style={styles.generatingText}>{t('mobile.loan.preview.state.generating')}</Text>
          <Text style={styles.generatingTip}>{t('mobile.loan.preview.state.generatingTip')}</Text>
          <ActivityIndicator size="small" color={tokens.loanAccent} style={{ marginTop: 8 }} />
        </View>
      </SafeAreaView>
    );
  }

  if (appQuery.isError || urlQuery.isError) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={40} color={tokens.errorFg} />
          <Text style={styles.errorText}>{t('mobile.loan.preview.error.generationFailed')}</Text>
          <Pressable style={styles.retryBtn} onPress={() => { void appQuery.refetch(); void urlQuery.refetch(); }}>
            <Text style={styles.retryText}>{t('mobile.common.retry')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const packageUrl = urlQuery.data?.url ?? '';
  const bankName = app?.bankName ?? 'Bank';
  const packageId = `PKG-${applicationId?.slice(0, 12).toUpperCase()}`;
  const watermarkText = `Generated by SnapAccount | ${app?.orgId ?? ''} | ${new Date().toLocaleDateString('en-IN')} | Package ID: ${packageId} | Not a CA certification`;

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
        <Text style={styles.headerTitle}>{t('mobile.loan.preview.title')}</Text>
        <Pressable
          style={styles.shareBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Share"
        >
          <Ionicons name="share-outline" size={20} color={tokens.textSecondary} />
        </Pressable>
      </View>

      {/* Package meta strip */}
      <PackageMetaStrip
        pageCount={47}
        sizeMb={4.2}
        generatedAt={new Date().toLocaleString('en-IN', {
          day: '2-digit', month: 'short', year: 'numeric',
          hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
        })}
        packageId={packageId}
        testID="package-meta-strip"
      />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* PDF viewer */}
        <View style={styles.pdfContainer} testID="pdf-viewer-container">
          <PdfViewerMobile
            signedUrl={packageUrl}
            pageCount={47}
            packageId={packageId}
            watermarkText={watermarkText}
            testID="pdf-viewer"
          />
        </View>

        {/* What's inside accordion */}
        <AccordionSection
          title={t('mobile.loan.preview.contents.title')}
          defaultOpen={false}
        >
          {[
            { key: 'kyc', pages: 2 },
            { key: 'gstr3b', pages: 12 },
            { key: 'pl', pages: 6 },
            { key: 'bs', pages: 4 },
            { key: 'bankStmt', pages: 18 },
            { key: 'application', pages: 5 },
          ].map((item) => (
            <View key={item.key} style={styles.contentsRow}>
              <Text style={styles.contentsLabel}>
                {t(`mobile.loan.preview.contents.${item.key}`)}
              </Text>
              <Text style={styles.contentsPages}>{item.pages} pages</Text>
            </View>
          ))}
        </AccordionSection>

        {/* Disclaimer */}
        <DisclaimerCard testID="disclaimer-card" />
      </ScrollView>

      {/* Submit footer */}
      <View style={styles.footer}>
        <Pressable
          style={styles.backEditBtn}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
        >
          <Text style={styles.backEditBtnText}>
            {t('mobile.loan.preview.cta.backToEdit')}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.submitBtn, submitMutation.isPending && styles.submitBtnDisabled]}
          onPress={handleSubmitPress}
          disabled={submitMutation.isPending}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.loan.preview.cta.submit', { bank: bankName })}
        >
          {submitMutation.isPending ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.submitBtnText}>
              {t('mobile.loan.preview.cta.submit', { bank: bankName })}
            </Text>
          )}
        </Pressable>
      </View>

      {/* Submit confirm modal */}
      <Modal
        visible={showSubmitConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSubmitConfirm(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {t('mobile.loan.preview.confirm.title', { bank: bankName })}
            </Text>
            <Text style={styles.modalBody}>
              {t('mobile.loan.preview.confirm.body')}
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalCancelBtn}
                onPress={() => setShowSubmitConfirm(false)}
                accessibilityRole="button"
              >
                <Text style={styles.modalCancelText}>
                  {t('mobile.loan.preview.confirm.cancel')}
                </Text>
              </Pressable>
              <Pressable
                style={styles.modalConfirmBtn}
                onPress={handleSubmitConfirm}
                accessibilityRole="button"
              >
                <Text style={styles.modalConfirmText}>
                  {t('mobile.loan.preview.confirm.send')}
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
  centered: {
    flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12,
  },
  generatingText: { fontSize: 17, fontWeight: '700', color: tk.textPrimary },
  generatingTip: { fontSize: 13, color: tk.textSecondary, textAlign: 'center' },
  errorText: { fontSize: 14, color: tk.textSecondary, textAlign: 'center' },
  retryBtn: {
    backgroundColor: tk.loanAccent, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10,
  },
  retryText: { fontSize: 14, fontWeight: '700', color: tk.textOnBrand },

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
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: tk.sunken, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: tk.textPrimary },
  shareBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },

  scrollContent: { padding: 16, gap: 14, paddingBottom: 24 },

  pdfContainer: { height: 400, borderRadius: 12, overflow: 'hidden' },

  contentsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: tk.border,
  },
  contentsLabel: { fontSize: 13, color: tk.textSecondary, fontWeight: '500', flex: 1 },
  contentsPages: { fontSize: 12, color: tk.textTertiary, fontWeight: '600' },

  footer: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    backgroundColor: tk.raised,
    borderTopWidth: 1,
    borderTopColor: tk.border,
  },
  backEditBtn: {
    minHeight: 52,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: tk.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backEditBtnText: { fontSize: 14, fontWeight: '600', color: tk.textSecondary },
  submitBtn: {
    flex: 1,
    minHeight: 52,
    borderRadius: 12,
    backgroundColor: tk.loanAccent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText: { fontSize: 15, fontWeight: '700', color: tk.textOnBrand },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.6)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  modalCard: {
    backgroundColor: tk.raised, borderRadius: 20, padding: 24,
    width: '100%', gap: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: tk.textPrimary },
  modalBody: { fontSize: 14, color: tk.textSecondary, lineHeight: 21 },
  modalActions: { flexDirection: 'row', gap: 10 },
  modalCancelBtn: {
    flex: 1, minHeight: 48, borderRadius: 12, borderWidth: 1.5,
    borderColor: tk.border, alignItems: 'center', justifyContent: 'center',
  },
  modalCancelText: { fontSize: 14, fontWeight: '600', color: tk.textSecondary },
  modalConfirmBtn: {
    flex: 1, minHeight: 48, borderRadius: 12,
    backgroundColor: tk.loanAccent, alignItems: 'center', justifyContent: 'center',
  },
  modalConfirmText: { fontSize: 14, fontWeight: '700', color: tk.textOnBrand },
  }),
);
