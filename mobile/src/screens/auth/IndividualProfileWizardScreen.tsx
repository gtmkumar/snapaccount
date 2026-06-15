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
import type { TFunction } from 'i18next';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { PanInput } from '../../components/shared/PanInput';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { isValidPAN } from '../../lib/utils';
import { useAuthStore } from '../../store/authStore';
import apiClient, { getApiError } from '../../lib/api';
import { logger } from '../../lib/logger';
import { saveDocument } from '../../api/documents';
import type { AuthStackParamList } from '../../navigation/AuthNavigator';

type NavProp = NativeStackNavigationProp<AuthStackParamList, 'IndividualProfileWizard'>;

interface Props {
  navigation: NavProp;
}

// Schema factory so validation messages resolve through i18n (I18N-WIZARD #1).
const makeSchema = (t: TFunction) =>
  z.object({
    pan: z.string().refine(isValidPAN, t('mobile.auth.wizard.valPanInvalid')),
    fullName: z.string().min(2, t('mobile.auth.wizard.valFullNameRequired')),
    dateOfBirth: z.string().min(10, t('mobile.auth.wizard.valDobRequired')),
  });

type FormData = z.infer<ReturnType<typeof makeSchema>>;

/** Convert DD/MM/YYYY → ISO YYYY-MM-DD (backend DateOnly). Undefined if unparseable. */
function toIsoDate(ddmmyyyy?: string): string | undefined {
  if (!ddmmyyyy || !ddmmyyyy.includes('/')) return undefined;
  const [d, m, y] = ddmmyyyy.split('/');
  if (!d || !m || !y || y.length !== 4) return undefined;
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

export function IndividualProfileWizardScreen({ navigation }: Props) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const { updateProfile, markAuthenticated } = useAuthStore();
  const { t } = useTranslation();
  const [loading, setLoading] = React.useState(false);
  const [panVerified, setPanVerified] = React.useState(false);

  // Schema (and its messages) re-resolves when the active language changes.
  const resolver = React.useMemo(() => zodResolver(makeSchema(t)), [t]);
  const form = useForm<FormData>({ resolver });

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
      // Never surface raw (English-only) server text — translated message + dev log.
      logger.debug('individual-wizard', 'profile save failed', { err: getApiError(err) });
      Alert.alert(t('mobile.common.error'), t('mobile.auth.wizard.saveFailed'));
    } finally {
      setLoading(false);
    }
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Button label={`← ${t('mobile.auth.wizard.back')}`} variant="ghost" size="sm" onPress={() => navigation.goBack()} />
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
          <Text style={styles.stepTitle}>{t('mobile.auth.wizard.individualTitle')}</Text>

          {/* Trust signal on the regulated step (spec §4.2) */}
          <View style={styles.trustBanner}>
            <Ionicons name="lock-closed-outline" size={16} color={tokens.successFg} />
            <Text style={styles.trustText}>{t('mobile.auth.wizard.trustPan')}</Text>
          </View>
          <Text style={styles.stepSubtitle}>
            {t('mobile.auth.wizard.individualSubtitle')}
          </Text>

          <Controller
            control={form.control}
            name="pan"
            render={({ field, fieldState }) => (
              <PanInput
                label={t('mobile.auth.wizard.panLabel')}
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
              <Ionicons name="checkmark-circle" size={16} color={tokens.successFg} />
              <Text style={styles.verifiedText}>{t('mobile.auth.kyc.panVerified')}</Text>
            </View>
          )}

          <Controller
            control={form.control}
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
            control={form.control}
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

          <View style={styles.infoBanner}>
            <View style={styles.bannerRow}>
              <Ionicons name="lock-closed-outline" size={14} color={tokens.successFg} style={styles.bannerIcon} />
              <Text style={styles.infoBannerText}>
                {t('mobile.auth.wizard.individualPanInfo')}
              </Text>
            </View>
          </View>
        </ScrollView>

        {/* Primary action pinned in a footer so it stays above the keyboard
            (KeyboardAvoidingView lifts this sibling). Previously the button lived
            at the bottom of the ScrollView and was hidden behind the keyboard,
            leaving no visible way to submit. */}
        <View style={styles.footer}>
          <Button
            label={t('mobile.auth.wizard.completeSetup')}
            onPress={handleSubmit}
            loading={loading}
            fullWidth
            size="lg"
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
    paddingHorizontal: 16,
    paddingVertical: 8,
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
    borderTopWidth: 1,
    borderTopColor: tk.border,
    backgroundColor: tk.canvas,
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
