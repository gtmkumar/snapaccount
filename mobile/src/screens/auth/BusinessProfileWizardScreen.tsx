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
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { OTPInput } from '../../components/forms/OTPInput';
import { Colors } from '../../constants/colors';
import { isValidPAN, isValidGSTIN, isValidAadhaar, maskAadhaar } from '../../lib/utils';
import { useAuthStore } from '../../store/authStore';
import apiClient, { getApiError } from '../../lib/api';
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
  const { updateProfile, setOrganizations, markAuthenticated } = useAuthStore();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Collected data across steps
  const [step1Data, setStep1Data] = useState<Step1Data | null>(null);
  const [step2Data, setStep2Data] = useState<Step2Data | null>(null);
  const [aadhaarVerified, setAadhaarVerified] = useState(false);
  const [aadhaarOtp, setAadhaarOtp] = useState('');
  const [aadhaarOtpSent, setAadhaarOtpSent] = useState(false);
  const [maskedAadhaar, setMaskedAadhaar] = useState('');

  const form1 = useForm<Step1Data>({ resolver: zodResolver(step1Schema) });
  const form2 = useForm<Step2Data>({ resolver: zodResolver(step2Schema) });
  const form4 = useForm<Step4Data>({ resolver: zodResolver(step4Schema) });

  const goBack = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
    else navigation.goBack();
  };

  // ── Step 1: PAN
  const handleStep1Submit = form1.handleSubmit(async (data) => {
    setLoading(true);
    try {
      // TODO: call PAN verification API
      setStep1Data(data);
      setCurrentStep(2);
    } catch {
      Alert.alert('Error', 'PAN verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  });

  // ── Step 2: GSTIN
  const handleStep2Submit = form2.handleSubmit((data) => {
    setStep2Data(data);
    setCurrentStep(3);
  });

  // ── Step 3: Aadhaar KYC
  const handleSendAadhaarOTP = async (aadhaar: string) => {
    if (!isValidAadhaar(aadhaar)) return;
    setLoading(true);
    try {
      // TODO: call Aadhaar OTP API
      setMaskedAadhaar(maskAadhaar(aadhaar));
      setAadhaarOtpSent(true);
    } catch {
      Alert.alert('Error', 'Could not send Aadhaar OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAadhaarOTP = async () => {
    if (aadhaarOtp.length !== 6) return;
    setLoading(true);
    try {
      // TODO: call Aadhaar OTP verify API
      setAadhaarVerified(true);
      setCurrentStep(4);
    } catch {
      Alert.alert('Error', 'Invalid Aadhaar OTP. Please try again.');
    } finally {
      setLoading(false);
    }
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
        <Button label="← Back" variant="ghost" size="sm" onPress={goBack} />
        <Text style={styles.stepIndicator}>
          Step {currentStep} of {TOTAL_STEPS}
        </Text>
      </View>

      {/* Progress bar */}
      <View style={styles.progressBar}>
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

              <Controller
                control={form1.control}
                name="pan"
                render={({ field, fieldState }) => (
                  <Input
                    label="PAN Number"
                    placeholder="ABCDE1234F"
                    value={field.value}
                    onChangeText={(v) => field.onChange(v.toUpperCase())}
                    error={fieldState.error?.message}
                    autoCapitalize="characters"
                    maxLength={10}
                  />
                )}
              />

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
                  <Ionicons name="lock-closed-outline" size={14} color={Colors.success[600]} style={styles.bannerIcon} />
                  <Text style={styles.infoBannerText}>
                    Your PAN is safe. We use it only for government portal verification.
                  </Text>
                </View>
              </View>

              <Button
                label="Continue"
                onPress={handleStep1Submit}
                loading={loading}
                fullWidth
                size="lg"
              />
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

              <Button
                label="Continue"
                onPress={handleStep2Submit}
                fullWidth
                size="lg"
              />
              <Button
                label="Skip for now"
                variant="ghost"
                onPress={() => { setCurrentStep(3); }}
                fullWidth
                size="lg"
              />
            </View>
          )}

          {/* ── Step 3: KYC ── */}
          {currentStep === 3 && (
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Complete KYC</Text>
              <Text style={styles.stepSubtitle}>
                Required for loan applications and financial services
              </Text>

              {!aadhaarOtpSent ? (
                <>
                  <AadhaarInputSection onSendOTP={handleSendAadhaarOTP} loading={loading} />

                  <View style={styles.warningBanner}>
                    <View style={styles.bannerRow}>
                      <Ionicons name="warning-outline" size={14} color={Colors.warning[600]} style={styles.bannerIcon} />
                      <Text style={styles.warningBannerText}>
                        Your Aadhaar number is masked and never stored in full — UIDAI guidelines.
                      </Text>
                    </View>
                  </View>

                  <Button
                    label="Skip KYC for now"
                    variant="ghost"
                    onPress={() => setCurrentStep(4)}
                    fullWidth
                    size="lg"
                  />
                </>
              ) : (
                <>
                  <Text style={styles.maskedAadhaar}>
                    Aadhaar: {maskedAadhaar}
                  </Text>
                  <Text style={styles.otpSentText}>
                    OTP sent to your Aadhaar-linked mobile
                  </Text>

                  <OTPInput
                    value={aadhaarOtp}
                    onChange={setAadhaarOtp}
                    onComplete={() => {}}
                    disabled={loading}
                  />

                  <Button
                    label="Verify Aadhaar"
                    onPress={handleVerifyAadhaarOTP}
                    disabled={aadhaarOtp.length < 6}
                    loading={loading}
                    fullWidth
                    size="lg"
                  />
                </>
              )}
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

              <Button
                label="Complete Setup"
                onPress={handleStep4Submit}
                loading={loading}
                fullWidth
                size="lg"
              />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// Sub-component for Aadhaar input
function AadhaarInputSection({
  onSendOTP,
  loading,
}: {
  onSendOTP: (aadhaar: string) => void;
  loading: boolean;
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
        label="Send OTP to Aadhaar-linked mobile"
        onPress={() => onSendOTP(aadhaar)}
        disabled={!isValid}
        loading={loading}
        fullWidth
        size="lg"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.base,
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
    color: Colors.neutral[500],
    fontWeight: '500',
  },
  progressBar: {
    height: 4,
    backgroundColor: Colors.neutral[200],
    marginHorizontal: 16,
    borderRadius: 2,
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.brand[500],
    borderRadius: 2,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    paddingBottom: 40,
  },
  stepContent: {
    gap: 4,
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.neutral[900],
    marginBottom: 8,
  },
  stepSubtitle: {
    fontSize: 14,
    color: Colors.neutral[500],
    marginBottom: 24,
    lineHeight: 20,
  },
  infoBanner: {
    backgroundColor: Colors.info[50],
    borderLeftWidth: 4,
    borderLeftColor: Colors.info[600],
    padding: 12,
    borderRadius: 8,
    marginVertical: 16,
  },
  bannerRow: { flexDirection: 'row', alignItems: 'flex-start' },
  bannerIcon: { marginRight: 6, marginTop: 2 },
  infoBannerText: {
    fontSize: 13,
    color: Colors.info[600],
    lineHeight: 18,
    flex: 1,
  },
  warningBanner: {
    backgroundColor: Colors.warning[50],
    borderLeftWidth: 4,
    borderLeftColor: Colors.warning[600],
    padding: 12,
    borderRadius: 8,
    marginVertical: 16,
  },
  warningBannerText: {
    fontSize: 13,
    color: Colors.warning[600],
    lineHeight: 18,
    flex: 1,
  },
  maskedAadhaar: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.neutral[800],
    textAlign: 'center',
    marginBottom: 8,
    fontFamily: 'Courier New',
  },
  otpSentText: {
    fontSize: 14,
    color: Colors.neutral[500],
    textAlign: 'center',
    marginBottom: 24,
  },
});
