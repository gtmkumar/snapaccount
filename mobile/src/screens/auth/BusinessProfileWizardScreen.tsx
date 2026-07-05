/**
 * Business Profile Wizard Screen
 * Multi-step: PAN → GSTIN → KYC → Business Details
 * Matches docs/design/screens/mobile/auth-onboarding.md §Screen 4
 */

import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { PanInput } from '../../components/shared/PanInput';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { isValidPAN, isValidGSTIN, isValidAadhaar } from '../../lib/utils';
import { useAuthStore } from '../../store/authStore';
import apiClient, { getApiError, refreshContextAndSwap } from '../../lib/api';
import { logger } from '../../lib/logger';
import { saveDocument, type DocumentKind } from '../../api/documents';
import type { AuthStackParamList } from '../../navigation/AuthNavigator';

type WizardNavProp = NativeStackNavigationProp<AuthStackParamList, 'BusinessProfileWizard'>;

interface Props { navigation: WizardNavProp }

const TOTAL_STEPS = 4;

// ─────────────────────────────────────────────────────────────────────────────
// Step schemas — factories so validation messages resolve through i18n
// (I18N-WIZARD residual #1: no hardcoded English in user-visible text).
// ─────────────────────────────────────────────────────────────────────────────

const makeStep1Schema = (t: TFunction) =>
  z.object({
    pan: z.string().refine(isValidPAN, t('mobile.auth.wizard.valPanInvalid')),
    fullName: z.string().min(2, t('mobile.auth.wizard.valFullNameRequired')),
    dateOfBirth: z.string().min(10, t('mobile.auth.wizard.valDobRequired')),
  });

const makeStep2Schema = (t: TFunction) =>
  z.object({
    gstin: z
      .string()
      .optional()
      .refine((v) => !v || isValidGSTIN(v), t('mobile.auth.wizard.valGstinInvalid')),
    notGstRegistered: z.boolean().optional(),
  });

const makeStep4Schema = (t: TFunction) =>
  z.object({
    businessName: z.string().min(2, t('mobile.auth.wizard.valBusinessNameRequired')),
    businessType: z.string().min(1, t('mobile.auth.wizard.valBusinessTypeRequired')),
    industry: z.string().min(1, t('mobile.auth.wizard.valIndustryRequired')),
    addressLine1: z.string().min(5, t('mobile.auth.wizard.valAddressRequired')),
    state: z.string().min(1, t('mobile.auth.wizard.valStateRequired')),
    pinCode: z.string().regex(/^[1-9]\d{5}$/, t('mobile.auth.wizard.valPinCodeInvalid')),
  });

type Step1Data = z.infer<ReturnType<typeof makeStep1Schema>>;
type Step2Data = z.infer<ReturnType<typeof makeStep2Schema>>;
type Step4Data = z.infer<ReturnType<typeof makeStep4Schema>>;

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const BUSINESS_TYPES = [
  'Sole Proprietor', 'Partnership', 'Private Limited',
  'LLP', 'HUF', 'Public Limited', 'Other',
];

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli',
  'Daman and Diu', 'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

/** Convert a DD/MM/YYYY date string to ISO YYYY-MM-DD (backend DateOnly). Returns undefined if unparseable. */
function toIsoDate(ddmmyyyy?: string): string | undefined {
  if (!ddmmyyyy || !ddmmyyyy.includes('/')) return undefined;
  const [d, m, y] = ddmmyyyy.split('/');
  if (!d || !m || !y || y.length !== 4) return undefined;
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function BusinessProfileWizardScreen({ navigation }: Props) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const { updateProfile, setOrganizations, markAuthenticated } = useAuthStore();
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Collected data across steps
  const [step1Data, setStep1Data] = useState<Step1Data | null>(null);
  const [step2Data, setStep2Data] = useState<Step2Data | null>(null);
  const [panError, setPanError] = useState('');
  const [panVerified, setPanVerified] = useState(false);
  // Aadhaar is collected locally and persisted as a document after the org is
  // created (Step 4). The 12-digit value is held only transiently in state.
  const [aadhaarNumber, setAadhaarNumber] = useState('');

  // Schemas (and their messages) re-resolve when the active language changes.
  const resolver1 = React.useMemo(() => zodResolver(makeStep1Schema(t)), [t]);
  const resolver2 = React.useMemo(() => zodResolver(makeStep2Schema(t)), [t]);
  const resolver4 = React.useMemo(() => zodResolver(makeStep4Schema(t)), [t]);
  const form1 = useForm<Step1Data>({ resolver: resolver1 });
  const form2 = useForm<Step2Data>({ resolver: resolver2 });
  const form4 = useForm<Step4Data>({ resolver: resolver4 });

  const goBack = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
    else navigation.goBack();
  };

  // ── Step 1: PAN — collected locally; persisted as a document after the org is
  //    created (Step 4). Government verification (OTP) is handled on the Identity
  //    Documents screen — the canonical /auth/me/documents path — not here, since
  //    no organization exists yet during onboarding.
  const handleStep1Submit = form1.handleSubmit((data) => {
    setPanError('');
    setPanVerified(true);
    setStep1Data(data);
    setCurrentStep(2);
  });

  // ── Step 2: GSTIN
  const handleStep2Submit = form2.handleSubmit((data) => {
    setStep2Data(data);
    setCurrentStep(3);
  });

  // ── Step 3: Aadhaar — collected locally and persisted as a document after the
  //    org exists. Verification (OTP) happens on the Identity Documents screen.
  const handleAadhaarContinue = (aadhaar: string) => {
    if (!isValidAadhaar(aadhaar)) return;
    setAadhaarNumber(aadhaar.replace(/[\s-]/g, ''));
    setCurrentStep(4);
  };

  /**
   * Best-effort persistence of the collected identity documents as SAVED records
   * via the canonical /auth/me/documents path. Runs after org creation so the
   * documents are org-scoped. Never blocks onboarding — government verification
   * is completed later on the Identity Documents screen.
   */
  const persistDocuments = async () => {
    const toSave: { kind: DocumentKind; number: string }[] = [];
    if (step1Data?.pan) toSave.push({ kind: 'PAN', number: step1Data.pan });
    if (aadhaarNumber) toSave.push({ kind: 'AADHAAR', number: aadhaarNumber });
    if (step2Data?.gstin) toSave.push({ kind: 'GSTIN', number: step2Data.gstin });
    await Promise.allSettled(
      toSave.map((d) =>
        saveDocument(d.kind, d.number, step1Data?.fullName).catch(() => undefined),
      ),
    );
  };

  // ── Step 4: Business Details
  const handleStep4Submit = form4.handleSubmit(async (data) => {
    setLoading(true);
    try {
      // 1) Update the user's personal profile (best-effort — must not block signup).
      try {
        await apiClient.put('/auth/profile', {
          fullName: step1Data?.fullName,
          panNumber: step1Data?.pan,
          dateOfBirth: toIsoDate(step1Data?.dateOfBirth),
          addressLine1: data.addressLine1,
          state: data.state,
          pincode: data.pinCode,
          userType: 'BUSINESS_OWNER',
        });
      } catch {
        // Profile row may not exist yet for a brand-new user; org creation below is
        // the source of truth for "signed-up customer". Continue regardless.
      }

      // 2) Create the business organization (the required step).
      const orgRes = await apiClient.post<{ organizationId: string }>('/auth/organizations', {
        businessName: data.businessName,
        gstin: step2Data?.gstin || null,
        panNumber: step1Data?.pan || null,
        businessType: data.businessType,
        industryType: data.industry,
        annualTurnoverInr: null,
      });

      updateProfile({
        profileComplete: true,
        userType: 'business_owner',
        name: step1Data?.fullName,
      });
      setOrganizations([
        {
          id: orgRes.data.organizationId,
          name: data.businessName,
          gstin: step2Data?.gstin || undefined,
          businessType: data.businessType,
          state: data.state,
          pinCode: data.pinCode,
          industry: data.industry,
        },
      ]);

      // 3) Persist the collected identity documents (PAN/Aadhaar/GSTIN) as SAVED
      //    records via the canonical /auth/me/documents path now that the org
      //    exists. Best-effort — verification is completed later on the Identity
      //    Documents screen.
      await persistDocuments();

      // GAP-007 / BUG-5: Swap the session JWT for one that carries the new
      // OrganizationId + org.* RBAC permissions. The backend adds the creator
      // as ORG_ADMIN when the org is created, but the JWT issued at OTP/login
      // (before the org existed) has no org context — without this swap the
      // owner's first org-scoped call (e.g. POST /auth/team/invite) is rejected
      // with 409 Org.InvalidContext. refreshContextAndSwap() is non-fatal:
      // failure is logged but never blocks onboarding completion.
      await refreshContextAndSwap();

      // Onboarding complete — enter the app (RootNavigator swaps to AppNavigator).
      markAuthenticated();
    } catch (err: unknown) {
      // Never surface raw (English-only) server text — translated message + dev log.
      logger.debug('business-wizard', 'profile save failed', { err: getApiError(err) });
      Alert.alert(t('mobile.common.error'), t('mobile.auth.wizard.saveFailed'));
    } finally {
      setLoading(false);
    }
  });

  const progress = currentStep / TOTAL_STEPS;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Button label={`← ${t('mobile.auth.wizard.back')}`} variant="ghost" size="sm" onPress={goBack} />
        <Text style={styles.stepIndicator}>
          {t('mobile.auth.wizard.step', { current: currentStep, total: TOTAL_STEPS })}
        </Text>
      </View>

      {/* Progress bar — accessible stepper (design-elevation-spec §4.2) */}
      <View
        style={styles.progressBar}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 1, max: TOTAL_STEPS, now: currentStep }}
        accessibilityLabel={t('mobile.auth.wizard.step', { current: currentStep, total: TOTAL_STEPS })}
      >
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Step 1: PAN ── */}
          {currentStep === 1 && (
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>{t('mobile.auth.wizard.stepPanTitle')}</Text>
              <Text style={styles.stepSubtitle}>
                {t('mobile.auth.wizard.stepPanSubtitle')}
              </Text>

              {/* Trust signal on the regulated step (spec §4.2) */}
              <View style={styles.trustBanner}>
                <Ionicons name="lock-closed-outline" size={16} color={tokens.successFg} />
                <Text style={styles.trustText}>{t('mobile.auth.wizard.trustPan')}</Text>
              </View>

              <Controller
                control={form1.control}
                name="pan"
                render={({ field, fieldState }) => (
                  <PanInput
                    label={t('mobile.auth.wizard.panLabel')}
                    value={field.value ?? ''}
                    onChangeText={(v) => {
                      field.onChange(v);
                      if (panError) setPanError('');
                      if (panVerified) setPanVerified(false);
                    }}
                    error={fieldState.error?.message ?? (panError || undefined)}
                  />
                )}
              />

              {panVerified && (
                <View style={styles.verifiedRow}>
                  <Ionicons name="checkmark-circle" size={16} color={tokens.successFg} />
                  <Text style={styles.verifiedText}>{t('mobile.auth.kyc.panVerified')}</Text>
                </View>
              )}

              <Controller
                control={form1.control}
                name="fullName"
                render={({ field, fieldState }) => (
                  <Input
                    label={t('mobile.auth.wizard.fullNameLabel')}
                    placeholder={t('mobile.auth.wizard.fullNamePlaceholder')}
                    value={field.value}
                    onChangeText={field.onChange}
                    error={fieldState.error?.message}
                  />
                )}
              />

              <Controller
                control={form1.control}
                name="dateOfBirth"
                render={({ field, fieldState }) => (
                  <Input
                    label={t('mobile.auth.wizard.dobLabel')}
                    placeholder={t('mobile.auth.wizard.dobPlaceholder')}
                    value={field.value}
                    onChangeText={field.onChange}
                    error={fieldState.error?.message}
                    keyboardType="numeric"
                    maxLength={10}
                  />
                )}
              />

              {/* Info banner */}
              <View style={styles.infoBanner}>
                <View style={styles.bannerRow}>
                  <Ionicons name="lock-closed-outline" size={14} color={tokens.successFg} style={styles.bannerIcon} />
                  <Text style={styles.infoBannerText}>
                    {t('mobile.auth.wizard.panSafeInfo')}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* ── Step 2: GSTIN ── */}
          {currentStep === 2 && (
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>{t('mobile.auth.wizard.stepGstinTitle')}</Text>
              <Text style={styles.stepSubtitle}>
                {t('mobile.auth.wizard.stepGstinSubtitle')}
              </Text>

              {/* DG-AUTH-05: "I'm not registered for GST" toggle hides the GSTIN
                  input and surfaces the registration-threshold note (B2.3). */}
              <Controller
                control={form2.control}
                name="notGstRegistered"
                render={({ field }) => {
                  const notRegistered = field.value ?? false;
                  return (
                    <>
                      <View style={styles.toggleRow}>
                        <Text style={styles.toggleLabel}>
                          {t('mobile.auth.wizard.notGstRegisteredLabel')}
                        </Text>
                        <Switch
                          value={notRegistered}
                          onValueChange={(v) => {
                            field.onChange(v);
                            // Clear any entered GSTIN when switching to "not registered"
                            if (v) form2.setValue('gstin', '');
                          }}
                          accessibilityLabel={t('mobile.auth.wizard.notGstRegisteredLabel')}
                          testID="not-gst-registered-toggle"
                        />
                      </View>

                      {notRegistered ? (
                        <View style={styles.infoBanner}>
                          <View style={styles.bannerRow}>
                            <Ionicons
                              name="information-circle-outline"
                              size={14}
                              color={tokens.infoFg}
                              style={styles.bannerIcon}
                            />
                            <Text style={styles.infoBannerText}>
                              {t('mobile.auth.wizard.gstThresholdNote')}
                            </Text>
                          </View>
                        </View>
                      ) : (
                        <Controller
                          control={form2.control}
                          name="gstin"
                          render={({ field: gstinField, fieldState }) => (
                            <Input
                              label={t('mobile.auth.wizard.gstinLabel')}
                              placeholder="27AABCU9603R1ZM"
                              value={gstinField.value}
                              onChangeText={(v) => gstinField.onChange(v.toUpperCase())}
                              error={fieldState.error?.message}
                              autoCapitalize="characters"
                              maxLength={15}
                            />
                          )}
                        />
                      )}
                    </>
                  );
                }}
              />
            </View>
          )}

          {/* ── Step 3: Aadhaar collection (verification deferred to the
                 Identity Documents screen via /auth/me/documents) ── */}
          {currentStep === 3 && (
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>{t('mobile.auth.wizard.stepAadhaarTitle')}</Text>
              <Text style={styles.stepSubtitle}>
                {t('mobile.auth.wizard.stepAadhaarSubtitle')}
              </Text>

              <AadhaarInputSection onContinue={handleAadhaarContinue} />

              <View style={styles.warningBanner}>
                <View style={styles.bannerRow}>
                  <Ionicons name="warning-outline" size={14} color={tokens.warningFg} style={styles.bannerIcon} />
                  <Text style={styles.warningBannerText}>
                    {t('mobile.auth.wizard.aadhaarMaskWarning')}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* ── Step 4: Business Details ── */}
          {currentStep === 4 && (
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>{t('mobile.auth.wizard.stepBusinessTitle')}</Text>

              <Controller
                control={form4.control}
                name="businessName"
                render={({ field, fieldState }) => (
                  <Input
                    label={t('mobile.auth.wizard.businessNameLabel')}
                    placeholder={t('mobile.auth.wizard.businessNamePlaceholder')}
                    value={field.value}
                    onChangeText={field.onChange}
                    error={fieldState.error?.message}
                  />
                )}
              />

              <Controller
                control={form4.control}
                name="businessType"
                render={({ field, fieldState }) => (
                  <Input
                    label={t('mobile.auth.wizard.businessTypeLabel')}
                    placeholder={t('mobile.auth.wizard.businessTypePlaceholder')}
                    value={field.value}
                    onChangeText={field.onChange}
                    error={fieldState.error?.message}
                    hint={t('mobile.auth.wizard.businessTypeHint', {
                      options: BUSINESS_TYPES.slice(0, 3).join(', '),
                    })}
                  />
                )}
              />

              <Controller
                control={form4.control}
                name="industry"
                render={({ field, fieldState }) => (
                  <Input
                    label={t('mobile.auth.wizard.industryLabel')}
                    placeholder={t('mobile.auth.wizard.industryPlaceholder')}
                    value={field.value}
                    onChangeText={field.onChange}
                    error={fieldState.error?.message}
                  />
                )}
              />

              <Controller
                control={form4.control}
                name="addressLine1"
                render={({ field, fieldState }) => (
                  <Input
                    label={t('mobile.auth.wizard.addressLabel')}
                    placeholder={t('mobile.auth.wizard.addressPlaceholder')}
                    value={field.value}
                    onChangeText={field.onChange}
                    error={fieldState.error?.message}
                  />
                )}
              />

              <Controller
                control={form4.control}
                name="state"
                render={({ field, fieldState }) => (
                  <Input
                    label={t('mobile.auth.wizard.stateLabel')}
                    placeholder={t('mobile.auth.wizard.statePlaceholder')}
                    value={field.value}
                    onChangeText={field.onChange}
                    error={fieldState.error?.message}
                    hint={t('mobile.auth.wizard.stateHint', { total: INDIAN_STATES.length })}
                  />
                )}
              />

              <Controller
                control={form4.control}
                name="pinCode"
                render={({ field, fieldState }) => (
                  <Input
                    label={t('mobile.auth.wizard.pinCodeLabel')}
                    placeholder={t('mobile.auth.wizard.pinCodePlaceholder')}
                    value={field.value}
                    onChangeText={field.onChange}
                    error={fieldState.error?.message}
                    keyboardType="numeric"
                    maxLength={6}
                  />
                )}
              />
            </View>
          )}
        </ScrollView>

        {/* Primary actions pinned in a footer so they stay above the keyboard
            (KeyboardAvoidingView lifts this sibling). Previously each step's
            button sat at the bottom of the ScrollView and was hidden behind the
            keyboard while typing, leaving no visible way to continue/submit. */}
        <View style={styles.footer}>
          {currentStep === 1 && (
            <Button label={t('mobile.auth.wizard.continue')} onPress={handleStep1Submit} loading={loading} fullWidth size="lg" />
          )}
          {currentStep === 2 && (
            <>
              <Button label={t('mobile.auth.wizard.continue')} onPress={handleStep2Submit} fullWidth size="lg" />
              <Button label={t('mobile.auth.wizard.skipForNow')} variant="ghost" onPress={() => setCurrentStep(3)} fullWidth size="lg" />
            </>
          )}
          {currentStep === 3 && (
            <Button label={t('mobile.auth.wizard.skipForNow')} variant="ghost" onPress={() => setCurrentStep(4)} fullWidth size="lg" />
          )}
          {currentStep === 4 && (
            <Button label={t('mobile.auth.wizard.completeSetup')} onPress={handleStep4Submit} loading={loading} fullWidth size="lg" />
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// Sub-component for Aadhaar input
function AadhaarInputSection({
  onContinue,
}: {
  onContinue: (aadhaar: string) => void;
}) {
  const { t } = useTranslation();
  const [aadhaar, setAadhaar] = useState('');
  const isValid = isValidAadhaar(aadhaar);

  return (
    <View>
      <Input
        label={t('mobile.auth.wizard.aadhaarLabel')}
        placeholder="XXXX XXXX XXXX"
        value={aadhaar}
        onChangeText={(v) => setAadhaar(v.replace(/\D/g, '').slice(0, 12))}
        keyboardType="numeric"
        maxLength={12}
        secureTextEntry
        hint={t('mobile.auth.wizard.aadhaarHint')}
      />
      <Button
        label={t('mobile.auth.wizard.continue')}
        onPress={() => onContinue(aadhaar)}
        disabled={!isValid}
        fullWidth
        size="lg"
      />
    </View>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tk.canvas,
  },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  stepIndicator: {
    fontSize: 14,
    color: tk.textSecondary,
    fontWeight: '500',
  },
  progressBar: {
    height: 4,
    backgroundColor: tk.border,
    marginHorizontal: 16,
    borderRadius: 2,
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: tk.brand500,
    borderRadius: 2,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    paddingBottom: 16,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 24,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: tk.border,
    backgroundColor: tk.canvas,
  },
  stepContent: {
    gap: 4,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingVertical: 8,
    marginBottom: 4,
  },
  toggleLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: tk.textPrimary,
    marginRight: 12,
  },
  trustBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: tk.successTint,
    borderWidth: 1,
    borderColor: tk.successTintBorder,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  trustText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: tk.successFg,
    fontWeight: '500',
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: tk.textPrimary,
    marginBottom: 8,
  },
  stepSubtitle: {
    fontSize: 14,
    color: tk.textSecondary,
    marginBottom: 24,
    lineHeight: 20,
  },
  infoBanner: {
    backgroundColor: tk.infoTint,
    borderLeftWidth: 4,
    borderLeftColor: tk.infoFg,
    padding: 12,
    borderRadius: 8,
    marginVertical: 16,
  },
  bannerRow: { flexDirection: 'row', alignItems: 'flex-start' },
  bannerIcon: { marginRight: 6, marginTop: 2 },
  infoBannerText: {
    fontSize: 13,
    color: tk.infoFg,
    lineHeight: 18,
    flex: 1,
  },
  warningBanner: {
    backgroundColor: tk.warningTint,
    borderLeftWidth: 4,
    borderLeftColor: tk.warningFg,
    padding: 12,
    borderRadius: 8,
    marginVertical: 16,
  },
  warningBannerText: {
    fontSize: 13,
    color: tk.warningFg,
    lineHeight: 18,
    flex: 1,
  },
  verifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  verifiedText: {
    fontSize: 13,
    color: tk.successFg,
    fontWeight: '600',
  },
  }),
);
