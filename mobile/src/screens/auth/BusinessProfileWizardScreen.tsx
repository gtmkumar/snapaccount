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
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { PanInput } from '../../components/shared/PanInput';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { isValidPAN, isValidGSTIN, isValidAadhaar } from '../../lib/utils';
import { useAuthStore } from '../../store/authStore';
import apiClient, { getApiError, refreshContextAndSwap } from '../../lib/api';
import { saveDocument, type DocumentKind } from '../../api/documents';
import type { AuthStackParamList } from '../../navigation/AuthNavigator';

type WizardNavProp = NativeStackNavigationProp<AuthStackParamList, 'BusinessProfileWizard'>;

interface Props { navigation: WizardNavProp }

const TOTAL_STEPS = 4;

// ─────────────────────────────────────────────────────────────────────────────
// Step schemas
// ─────────────────────────────────────────────────────────────────────────────

const step1Schema = z.object({
  pan: z.string().refine(isValidPAN, 'Invalid PAN format (e.g. ABCDE1234F)'),
  fullName: z.string().min(2, 'Full name is required'),
  dateOfBirth: z.string().min(10, 'Date of birth is required (DD/MM/YYYY)'),
});

const step2Schema = z.object({
  gstin: z
    .string()
    .optional()
    .refine(
      (v) => !v || isValidGSTIN(v),
      'Invalid GSTIN format (15 characters)',
    ),
  notGstRegistered: z.boolean().optional(),
});

const step4Schema = z.object({
  businessName: z.string().min(2, 'Business name is required'),
  businessType: z.string().min(1, 'Select a business type'),
  industry: z.string().min(1, 'Select an industry'),
  addressLine1: z.string().min(5, 'Address is required'),
  state: z.string().min(1, 'Select a state'),
  pinCode: z.string().regex(/^[1-9]\d{5}$/, 'Enter valid 6-digit PIN code'),
});

type Step1Data = z.infer<typeof step1Schema>;
type Step2Data = z.infer<typeof step2Schema>;
type Step4Data = z.infer<typeof step4Schema>;

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

  const form1 = useForm<Step1Data>({ resolver: zodResolver(step1Schema) });
  const form2 = useForm<Step2Data>({ resolver: zodResolver(step2Schema) });
  const form4 = useForm<Step4Data>({ resolver: zodResolver(step4Schema) });

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
      Alert.alert('Error', getApiError(err).message || 'Could not save profile. Please try again.');
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
              <Text style={styles.stepTitle}>Your PAN Card</Text>
              <Text style={styles.stepSubtitle}>
                We'll verify your PAN to link your tax profile
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
                    label="PAN Number"
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
                    label="Full Name (as on PAN)"
                    placeholder="Enter your full name"
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
                    label="Date of Birth"
                    placeholder="DD/MM/YYYY"
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
                    Your PAN is safe. We use it only for government portal verification.
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* ── Step 2: GSTIN ── */}
          {currentStep === 2 && (
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Link Your GST Number</Text>
              <Text style={styles.stepSubtitle}>
                Optional — link GSTIN to auto-import your filing history
              </Text>

              <Controller
                control={form2.control}
                name="gstin"
                render={({ field, fieldState }) => (
                  <Input
                    label="GSTIN"
                    placeholder="27AABCU9603R1ZM"
                    value={field.value}
                    onChangeText={(v) => field.onChange(v.toUpperCase())}
                    error={fieldState.error?.message}
                    autoCapitalize="characters"
                    maxLength={15}
                  />
                )}
              />
            </View>
          )}

          {/* ── Step 3: Aadhaar collection (verification deferred to the
                 Identity Documents screen via /auth/me/documents) ── */}
          {currentStep === 3 && (
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Add Your Aadhaar</Text>
              <Text style={styles.stepSubtitle}>
                Used for loan applications and financial services
              </Text>

              <AadhaarInputSection onContinue={handleAadhaarContinue} />

              <View style={styles.warningBanner}>
                <View style={styles.bannerRow}>
                  <Ionicons name="warning-outline" size={14} color={tokens.warningFg} style={styles.bannerIcon} />
                  <Text style={styles.warningBannerText}>
                    Your Aadhaar number is masked and never stored in full — UIDAI guidelines.
                    You can verify it later from Profile → Identity Documents.
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* ── Step 4: Business Details ── */}
          {currentStep === 4 && (
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Business Details</Text>

              <Controller
                control={form4.control}
                name="businessName"
                render={({ field, fieldState }) => (
                  <Input
                    label="Business Name"
                    placeholder="Enter your business name"
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
                    label="Business Type"
                    placeholder="Select business type"
                    value={field.value}
                    onChangeText={field.onChange}
                    error={fieldState.error?.message}
                    hint={`Options: ${BUSINESS_TYPES.slice(0, 3).join(', ')}...`}
                  />
                )}
              />

              <Controller
                control={form4.control}
                name="industry"
                render={({ field, fieldState }) => (
                  <Input
                    label="Industry / Category"
                    placeholder="e.g. Retail, Manufacturing, Services"
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
                    label="Business Address"
                    placeholder="Street address, locality"
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
                    label="State"
                    placeholder="Select state"
                    value={field.value}
                    onChangeText={field.onChange}
                    error={fieldState.error?.message}
                    hint={`${INDIAN_STATES.length} states/UTs available`}
                  />
                )}
              />

              <Controller
                control={form4.control}
                name="pinCode"
                render={({ field, fieldState }) => (
                  <Input
                    label="PIN Code"
                    placeholder="6-digit postal code"
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
            <Button label="Continue" onPress={handleStep1Submit} loading={loading} fullWidth size="lg" />
          )}
          {currentStep === 2 && (
            <>
              <Button label="Continue" onPress={handleStep2Submit} fullWidth size="lg" />
              <Button label="Skip for now" variant="ghost" onPress={() => setCurrentStep(3)} fullWidth size="lg" />
            </>
          )}
          {currentStep === 3 && (
            <Button label="Skip for now" variant="ghost" onPress={() => setCurrentStep(4)} fullWidth size="lg" />
          )}
          {currentStep === 4 && (
            <Button label="Complete Setup" onPress={handleStep4Submit} loading={loading} fullWidth size="lg" />
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
  const [aadhaar, setAadhaar] = useState('');
  const isValid = isValidAadhaar(aadhaar);

  return (
    <View>
      <Input
        label="Aadhaar Number"
        placeholder="XXXX XXXX XXXX"
        value={aadhaar}
        onChangeText={(v) => setAadhaar(v.replace(/\D/g, '').slice(0, 12))}
        keyboardType="numeric"
        maxLength={12}
        secureTextEntry
        hint="Your Aadhaar number is masked and never stored"
      />
      <Button
        label="Continue"
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
