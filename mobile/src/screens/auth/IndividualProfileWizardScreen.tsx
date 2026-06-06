/**
 * Individual (Salaried) Profile Wizard — the EMPLOYEE onboarding path.
 *
 * Unlike BusinessProfileWizard this collects ONLY the personal tax identity
 * (PAN + name + DOB) needed to file an ITR. It does NOT ask for GSTIN or business
 * details and does NOT create an organization — a salaried individual is a
 * standalone taxpayer (see docs/design/user-hierarchy-gap-analysis.md §Issue 2).
 *
 * On completion it stamps UserType=EMPLOYEE on the server profile (PUT /auth/profile)
 * so the app shows the ITR-centric navigation on this and future sessions.
 */
import React from 'react';
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
import { Colors } from '../../constants/colors';
import { isValidPAN } from '../../lib/utils';
import { useAuthStore } from '../../store/authStore';
import apiClient, { getApiError } from '../../lib/api';
import { saveDocument } from '../../api/documents';
import type { AuthStackParamList } from '../../navigation/AuthNavigator';

type NavProp = NativeStackNavigationProp<AuthStackParamList, 'IndividualProfileWizard'>;

interface Props {
  navigation: NavProp;
}

const schema = z.object({
  pan: z.string().refine(isValidPAN, 'Invalid PAN format (e.g. ABCDE1234F)'),
  fullName: z.string().min(2, 'Full name is required'),
  dateOfBirth: z.string().min(10, 'Date of birth is required (DD/MM/YYYY)'),
});

type FormData = z.infer<typeof schema>;

/** Convert DD/MM/YYYY → ISO YYYY-MM-DD (backend DateOnly). Undefined if unparseable. */
function toIsoDate(ddmmyyyy?: string): string | undefined {
  if (!ddmmyyyy || !ddmmyyyy.includes('/')) return undefined;
  const [d, m, y] = ddmmyyyy.split('/');
  if (!d || !m || !y || y.length !== 4) return undefined;
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

export function IndividualProfileWizardScreen({ navigation }: Props) {
  const { updateProfile, markAuthenticated } = useAuthStore();
  const { t } = useTranslation();
  const [loading, setLoading] = React.useState(false);
  const [panVerified, setPanVerified] = React.useState(false);

  const form = useForm<FormData>({ resolver: zodResolver(schema) });

  const handleSubmit = form.handleSubmit(async (data) => {
    setLoading(true);
    try {
      // Stamp the personal profile + EMPLOYEE persona. This is the source of truth
      // for "salaried individual" — no organization is created.
      await apiClient.put('/auth/profile', {
        fullName: data.fullName,
        panNumber: data.pan,
        dateOfBirth: toIsoDate(data.dateOfBirth),
        userType: 'EMPLOYEE',
      });

      // Best-effort: persist the PAN as a SAVED identity document (verification is
      // completed later on the Identity Documents screen). Never blocks onboarding.
      await saveDocument('PAN', data.pan, data.fullName).catch(() => undefined);

      updateProfile({
        profileComplete: true,
        userType: 'employee',
        name: data.fullName,
      });

      // Onboarding complete — enter the app (RootNavigator swaps to AppNavigator,
      // which renders the salaried-individual tab set for userType=employee).
      markAuthenticated();
    } catch (err: unknown) {
      Alert.alert('Error', getApiError(err).message || 'Could not save profile. Please try again.');
    } finally {
      setLoading(false);
    }
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Button label="← Back" variant="ghost" size="sm" onPress={() => navigation.goBack()} />
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
          <Text style={styles.stepTitle}>Your tax profile</Text>
          <Text style={styles.stepSubtitle}>
            We'll use your PAN to set up personal ITR filing. No business details needed.
          </Text>

          <Controller
            control={form.control}
            name="pan"
            render={({ field, fieldState }) => (
              <PanInput
                label="PAN Number"
                value={field.value ?? ''}
                onChangeText={(v) => {
                  field.onChange(v);
                  if (panVerified) setPanVerified(false);
                  if (isValidPAN(v)) setPanVerified(true);
                }}
                error={fieldState.error?.message}
              />
            )}
          />

          {panVerified && (
            <View style={styles.verifiedRow}>
              <Ionicons name="checkmark-circle" size={16} color={Colors.success[600]} />
              <Text style={styles.verifiedText}>{t('mobile.auth.kyc.panVerified')}</Text>
            </View>
          )}

          <Controller
            control={form.control}
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
            control={form.control}
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

          <View style={styles.infoBanner}>
            <View style={styles.bannerRow}>
              <Ionicons name="lock-closed-outline" size={14} color={Colors.success[600]} style={styles.bannerIcon} />
              <Text style={styles.infoBannerText}>
                Your PAN is safe. We use it only for government portal verification.
                You can add Aadhaar and Form 16 later from your profile.
              </Text>
            </View>
          </View>

          <Button
            label="Complete Setup"
            onPress={handleSubmit}
            loading={loading}
            fullWidth
            size="lg"
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    paddingBottom: 40,
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
  verifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  verifiedText: {
    fontSize: 13,
    color: Colors.success[600],
    fontWeight: '600',
  },
});
