/**
 * OTP Verification Screen — Redesign 2026
 * Clean, focused OTP entry with premium styling
 */

import React, { useCallback, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { OTPInput, OTPResendTimer } from '../../components/forms/OTPInput';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { formatPhoneDisplay } from '../../lib/utils';
import { useAuthStore } from '../../store/authStore';
import { fetchServerUserType } from '../../lib/onboarding';
import type { AuthStackParamList } from '../../navigation/AuthNavigator';
import apiClient, { getApiError } from '../../lib/api';
import { logger } from '../../lib/logger';

/**
 * Known backend OTP error codes → translation keys (I18N-WIZARD residual #2).
 * The server's `message` is English-only and must never be shown to the user;
 * unknown codes fall back to a generic translated message (raw text is kept in
 * dev logs only via logger.debug).
 */
const OTP_ERROR_KEYS: Record<string, string> = {
  'Otp.Invalid': 'mobile.auth.otp.errors.invalid',
  'Otp.Expired': 'mobile.auth.otp.errors.expired',
  'Otp.AlreadyUsed': 'mobile.auth.otp.errors.alreadyUsed',
  'Otp.MaxAttemptsReached': 'mobile.auth.otp.errors.maxAttempts',
  'Otp.Cooldown': 'mobile.auth.otp.errors.cooldown',
  'OtpRequest.NotFound': 'mobile.auth.otp.errors.notFound',
};

type OTPNavProp = NativeStackNavigationProp<AuthStackParamList, 'OTPVerify'>;
type OTPRouteProp = RouteProp<AuthStackParamList, 'OTPVerify'>;

interface OTPVerifyScreenProps {
  navigation: OTPNavProp;
  route: OTPRouteProp;
}

export function OTPVerifyScreen({ navigation, route }: OTPVerifyScreenProps) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const { phone } = route.params;
  const { setAuthenticated, setSession, setOrganizations, updateProfile } = useAuthStore();

  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [autoDetected] = useState(false);

  const formattedPhone = formatPhoneDisplay(phone);

  const verifyOTP = useCallback(
    async (otpValue: string) => {
      if (otpValue.length !== 6) return;

      setLoading(true);
      setError(false);
      setErrorMessage('');

      try {
        // Verify against the real backend. Returns a session token (a Firebase custom
        // token in prod; a LOCAL_AUTH JWT in local dev) used as the bearer for all services.
        // SEC-025: response also carries refreshToken + refreshExpiresAt when the backend
        // supports rotation (gracefully absent in older builds).
        const response = await apiClient.post<{
          isNewUser: boolean;
          firebaseCustomToken: string | null;
          userId: string;
          refreshToken?: string | null;
          refreshExpiresAt?: string | null;
        }>('/auth/otp/verify', { phoneNumber: phone, otp: otpValue });

        const { isNewUser, firebaseCustomToken, userId, refreshToken } = response.data;
        if (!firebaseCustomToken) {
          throw new Error('No session token returned.');
        }

        const profile = {
          id: userId,
          firebaseUid: '',
          phone,
          // Persona is resolved from the server for returning users (below) and
          // chosen on PersonaSelection for new users — never hard-coded here.
          userType: null,
          profileComplete: !isNewUser,
          aadhaarVerified: false,
          createdAt: new Date().toISOString(),
        };

        if (isNewUser) {
          // Keep the token for authenticated onboarding calls, but stay in the
          // Auth stack until the user picks a persona and completes onboarding.
          setSession(firebaseCustomToken, profile, refreshToken ?? null);
          navigation.replace('PersonaSelection');
          return;
        }

        setAuthenticated(firebaseCustomToken, profile, refreshToken ?? null);

        // Returning user — hydrate the real persona so navigation matches their type.
        const serverType = await fetchServerUserType();
        if (serverType) updateProfile({ userType: serverType });

        // Returning user — enrich profile + organizations, then enter the app.
        try {
          const orgsRes = await apiClient.get<
            { id: string; businessName?: string; name?: string; gstin?: string; panNumber?: string }[]
          >('/auth/organizations');
          const orgs = (orgsRes.data ?? []).map((o) => ({
            id: o.id,
            name: o.businessName ?? o.name ?? 'My Business',
            gstin: o.gstin,
            panNumber: o.panNumber,
          }));
          if (orgs.length > 0) setOrganizations(orgs);
        } catch {
          // Non-fatal — the app can fetch organizations later.
        }
        // isAuthenticated is now true → RootNavigator swaps to the app automatically.
      } catch (err: unknown) {
        setLoading(false);
        setError(true);
        setOtp('');
        const apiErr = getApiError(err);
        const mappedKey = apiErr.code ? OTP_ERROR_KEYS[apiErr.code] : undefined;
        if (apiErr.statusCode === 429) {
          setErrorMessage(t('mobile.auth.otp.errors.tooMany'));
        } else if (mappedKey) {
          setErrorMessage(t(mappedKey));
        } else {
          // Unknown code/shape — never surface the raw (English) server text.
          logger.debug('otp-verify', 'unmapped server error', {
            code: apiErr.code,
            statusCode: apiErr.statusCode,
            message: apiErr.message,
          });
          setErrorMessage(t('mobile.auth.otp.errors.failed'));
        }
      }
    },
    [phone, navigation, setAuthenticated, setSession, setOrganizations, updateProfile, t],
  );

  const handleOTPComplete = useCallback(
    (value: string) => {
      verifyOTP(value);
    },
    [verifyOTP],
  );

  const handleResendOTP = async () => {
    try {
      await apiClient.post('/auth/otp/send', { phoneNumber: phone });
      setOtp('');
      setError(false);
      setErrorMessage('');
    } catch {
      Alert.alert(t('mobile.common.error'), t('mobile.auth.otp.errors.resend'));
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Back button */}
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel={t('mobile.common.goBack')}
          >
            <Ionicons name="arrow-back" size={22} color={tokens.textPrimary} />
          </TouchableOpacity>

          {/* Illustration */}
          <View style={styles.illustrationArea}>
            <View style={styles.iconCircle}>
              <Ionicons name="mail-outline" size={32} color={tokens.brand500} />
            </View>
          </View>

          {/* Heading */}
          <Text style={styles.heading}>{t('mobile.auth.otp.title')}</Text>
          <Text style={styles.subtext}>
            {t('mobile.auth.otp.subtitle')}{' '}
            <Text style={styles.phoneText}>{formattedPhone}</Text>
          </Text>

          <TouchableOpacity
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel={t('mobile.auth.otp.changeNumber')}
          >
            <Text style={styles.changeNumber}>{t('mobile.auth.otp.changeNumber')}</Text>
          </TouchableOpacity>

          {/* Auto-detected banner */}
          {autoDetected && (
            <View style={styles.autoDetectedBanner}>
              <Ionicons name="checkmark-circle" size={16} color={tokens.successFg} />
              <Text style={styles.autoDetectedText}>
                {t('mobile.auth.otp.autoDetected')}
              </Text>
            </View>
          )}

          {/* OTP input */}
          <View style={styles.otpArea}>
            <OTPInput
              value={otp}
              onChange={(v) => {
                setOtp(v);
                if (error) {
                  setError(false);
                  setErrorMessage('');
                }
              }}
              onComplete={handleOTPComplete}
              error={error}
              disabled={loading}
              autoFocus
            />

            {errorMessage ? (
              <View style={styles.errorRow}>
                <Ionicons name="alert-circle" size={14} color={tokens.errorFg} />
                <Text style={styles.errorMessage} accessibilityLiveRegion="polite">
                  {errorMessage}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Resend timer */}
          <OTPResendTimer initialSeconds={60} onResend={handleResendOTP} />

          {/* Verify button */}
          <View style={styles.buttonArea}>
            <Button
              label={loading ? t('mobile.auth.otp.verifying') : t('mobile.auth.otp.verifyCta')}
              onPress={() => verifyOTP(otp)}
              disabled={otp.length < 6 || loading}
              loading={loading}
              fullWidth
              size="lg"
            />
          </View>

          <Text style={styles.note}>
            {t('mobile.auth.otp.validity')}
          </Text>

          {/* Trust signal (design-elevation-spec §4.2) */}
          <View style={styles.trustBanner}>
            <Ionicons name="lock-closed-outline" size={16} color={tokens.successFg} />
            <Text style={styles.trustText}>{t('mobile.auth.otp.trust')}</Text>
          </View>

          {/* Assisted entry — never stuck (a11y §3 / spec §4.2) */}
          <TouchableOpacity
            style={styles.assistedHelp}
            onPress={() => navigation.navigate('PasswordAuth')}
            accessibilityRole="button"
            accessibilityLabel={t('mobile.auth.otp.assistedHelp')}
            testID="otp-assisted-help"
          >
            <Ionicons name="help-buoy-outline" size={16} color={tokens.brandFg} />
            <Text style={styles.assistedHelpText}>{t('mobile.auth.otp.assistedHelp')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tk.raised,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    paddingBottom: 40,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: tk.sunken,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  illustrationArea: {
    alignItems: 'center',
    marginBottom: 28,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: tk.brandTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: {
    fontSize: 28,
    fontWeight: '800',
    color: tk.textPrimary,
    marginBottom: 10,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtext: {
    fontSize: 15,
    color: tk.textSecondary,
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 22,
  },
  phoneText: {
    fontWeight: '600',
    color: tk.textPrimary,
  },
  changeNumber: {
    fontSize: 14,
    color: tk.brand500,
    fontWeight: '600',
    marginBottom: 32,
    textAlign: 'center',
  },
  autoDetectedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: tk.successTint,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 16,
  },
  autoDetectedText: {
    color: tk.successFg,
    fontSize: 14,
    fontWeight: '500',
  },
  otpArea: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 8,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
  },
  errorMessage: {
    fontSize: 14,
    color: tk.errorFg,
  },
  buttonArea: {
    width: '100%',
    marginTop: 32,
  },
  note: {
    fontSize: 12,
    // OTP-4 (a11y): the validity note carries meaning — neutral[400] fails 4.5:1.
    color: tk.textSecondary,
    marginTop: 14,
    textAlign: 'center',
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
    marginTop: 24,
  },
  trustText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    color: tk.successFg,
    fontWeight: '500',
  },
  assistedHelp: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
  },
  assistedHelpText: {
    fontSize: 13,
    fontWeight: '600',
    color: tk.brandFg,
  },
  }),
);
