/**
 * Phone Number Entry Screen — Redesign 2026
 * Clean, confident auth with premium styling
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
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import { PhoneInput } from '../../components/forms/PhoneInput';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import apiClient, { getApiError } from '../../lib/api';
import { isValidPhone } from '../../lib/utils';
import { useAuthMethods } from '../../hooks/useAuthMethods';
import { useAuthStore } from '../../store/authStore';
import { fetchServerProfile } from '../../lib/onboarding';
import { registerCurrentDevice } from '../../notifications/pushTokenManager';
import {
  isFirebaseConfigured,
  signInWithGoogle,
  signInWithApple,
  SocialSignInCancelled,
  SocialSignInUnavailable,
  type SocialSessionResult,
} from '../../lib/socialAuth';
import type { AuthStackParamList } from '../../navigation/AuthNavigator';

type PhoneEntryNavProp = NativeStackNavigationProp<AuthStackParamList, 'PhoneEntry'>;

interface PhoneEntryScreenProps {
  navigation: PhoneEntryNavProp;
}

export function PhoneEntryScreen({ navigation }: PhoneEntryScreenProps) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const { setAuthenticated, setSession, setOrganizations } = useAuthStore();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [socialLoading, setSocialLoading] = useState<'google' | 'apple' | null>(null);

  // When SMS/WhatsApp OTP is enabled, the phone+password option is hidden (optional fallback).
  const { showPasswordOption } = useAuthMethods();

  const canSubmit = isValidPhone(phone) && !loading;

  /**
   * Shared completion for a social session: store the token + minimal profile,
   * then enter the app (or onboarding when the profile is incomplete).
   */
  const completeSocialSession = async (result: SocialSessionResult) => {
    const profile = {
      id: result.userId,
      firebaseUid: '',
      phone: '',
      // Resolved from the server below — social sign-in carries no persona itself.
      userType: null,
      profileComplete: false,
      aadhaarVerified: false,
      createdAt: new Date().toISOString(),
    };

    // The server profile's user_type is the source of truth for new-vs-returning
    // here: a returning salaried individual legitimately has NO organization, so
    // "no org" can't be used to detect a new user. Token must be set first so the
    // /auth/me call is authenticated.
    setSession(result.token, profile, result.refreshToken ?? null);

    // B1.3 device binding (DG-AUTH-01): register this device for the social
    // sign-in too — covers Google/Apple logins. For a 2nd+ device the backend
    // creates a DeviceApprovalRequest + push (GAP-047). Best-effort.
    void registerCurrentDevice();

    const serverProfile = await fetchServerProfile();
    const serverType = serverProfile?.userType;

    if (!serverType) {
      // No persona yet → brand-new user → pick a persona, then onboard.
      navigation.replace('PersonaSelection');
      return;
    }

    // Returning user — enter the app with their real persona + onboarding name
    // (AND-LIVE-06: hydrate the display name so profile shows it, not the fallback).
    setAuthenticated(
      result.token,
      {
        ...profile,
        userType: serverType,
        name: serverProfile?.fullName,
        profileComplete: true,
      },
      result.refreshToken ?? null,
    );
    if (serverType === 'business_owner') {
      try {
        const orgsRes = await apiClient.get<
          { id: string; businessName?: string; name?: string; gstin?: string }[]
        >('/auth/organizations');
        const orgs = (orgsRes.data ?? []).map((o) => ({
          id: o.id,
          name: o.businessName ?? o.name ?? 'My Business',
          gstin: o.gstin,
        }));
        if (orgs.length > 0) setOrganizations(orgs);
      } catch {
        // Non-fatal — organizations can be fetched later.
      }
    }
  };

  const handleGoogleSignIn = async () => {
    if (!isFirebaseConfigured()) {
      Alert.alert('', t('mobile.auth.social.notConfigured'));
      return;
    }
    setSocialLoading('google');
    try {
      const result = await signInWithGoogle();
      await completeSocialSession(result);
    } catch (err: unknown) {
      if (err instanceof SocialSignInCancelled) return; // user backed out — no-op
      Alert.alert('', getApiError(err).message || t('mobile.auth.social.googleError'));
    } finally {
      setSocialLoading(null);
    }
  };

  const handleAppleSignIn = async () => {
    if (!isFirebaseConfigured()) {
      Alert.alert('', t('mobile.auth.social.notConfigured'));
      return;
    }
    setSocialLoading('apple');
    try {
      const result = await signInWithApple();
      await completeSocialSession(result);
    } catch (err: unknown) {
      if (err instanceof SocialSignInCancelled) return; // user backed out — no-op
      // Apple Sign-In not available (no entitlement / no Apple ID / unsupported device).
      if (err instanceof SocialSignInUnavailable) {
        Alert.alert('', t('mobile.auth.social.appleUnavailable'));
        return;
      }
      Alert.alert('', getApiError(err).message || t('mobile.auth.social.appleError'));
    } finally {
      setSocialLoading(null);
    }
  };

  const handleSendOTP = async () => {
    if (!canSubmit) return;

    setError('');
    setLoading(true);

    try {
      // Backend expects a bare 10-digit Indian number (no +91 prefix).
      await apiClient.post('/auth/otp/send', { phoneNumber: phone });

      navigation.navigate('OTPVerify', { phone });
    } catch (err: unknown) {
      const apiErr = getApiError(err);
      if (apiErr.statusCode === 429) {
        setError('Too many attempts. Please try again in a few minutes.');
      } else if (apiErr.statusCode >= 400 && apiErr.statusCode < 500) {
        setError(apiErr.message || 'Invalid phone number. Please check and try again.');
      } else {
        Alert.alert(t('mobile.common.error'), t('mobile.auth.phone.sendError'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneChange = (value: string) => {
    setPhone(value);
    if (error) setError('');
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        // Android: manifest windowSoftInputMode=adjustResize already resizes the
        // window for the keyboard; a 'height' KeyboardAvoidingView on top of that
        // double-adjusts and makes the screen jump/flicker on each keystroke, so
        // leave behavior undefined on Android and let the native resize handle it.
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Illustration area */}
          <View style={styles.illustrationArea}>
            <View style={styles.illustrationOuter}>
              <View style={styles.illustrationInner}>
                <Ionicons name="shield-checkmark" size={40} color={tokens.brand500} />
              </View>
            </View>
          </View>

          {/* Heading */}
          <View style={styles.headingArea}>
            <Text style={styles.heading}>{t('mobile.auth.phone.welcome')}{'\n'}SnapAccount</Text>
            <Text style={styles.subheading}>
              {t('mobile.auth.phone.subheading')}
            </Text>
          </View>

          {/* Phone input */}
          <View style={styles.formArea}>
            <PhoneInput
              value={phone}
              onChange={handlePhoneChange}
              error={error}
              autoFocus={false}
            />

            <Button
              label={loading ? t('mobile.auth.phone.sendingOtp') : t('mobile.auth.phone.continueOtp')}
              onPress={handleSendOTP}
              disabled={!canSubmit}
              loading={loading}
              fullWidth
              size="lg"
            />
          </View>

          {/* Divider */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>{t('mobile.auth.phone.orContinue')}</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Social login */}
          <View style={styles.socialArea}>
            {showPasswordOption && (
              <Button
                label={t('mobile.auth.phone.passwordOption')}
                variant="secondary"
                fullWidth
                size="lg"
                leftIcon={<Ionicons name="lock-closed-outline" size={20} color={tokens.textSecondary} />}
                onPress={() => navigation.navigate('PasswordAuth')}
              />
            )}
            <Button
              label="Google"
              variant="secondary"
              fullWidth
              size="lg"
              loading={socialLoading === 'google'}
              disabled={socialLoading !== null}
              leftIcon={<Ionicons name="logo-google" size={20} color={tokens.textSecondary} />}
              onPress={handleGoogleSignIn}
              style={showPasswordOption ? { marginTop: 12 } : undefined}
            />
            {Platform.OS === 'ios' && (
              <Button
                label="Apple"
                variant="secondary"
                fullWidth
                size="lg"
                loading={socialLoading === 'apple'}
                disabled={socialLoading !== null}
                leftIcon={<Ionicons name="logo-apple" size={20} color={tokens.textPrimary} />}
                onPress={handleAppleSignIn}
                style={{ marginTop: 12 }}
              />
            )}
          </View>

          {/* Terms */}
          <Text style={styles.terms}>
            {t('mobile.auth.phone.termsPrefix')}{' '}
            <Text style={styles.termsLink}>{t('mobile.auth.phone.termsOfService')}</Text>
            {' '}{t('mobile.auth.phone.and')}{' '}
            <Text style={styles.termsLink}>{t('mobile.auth.phone.privacyPolicy')}</Text>
          </Text>
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
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  illustrationArea: {
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 36,
  },
  illustrationOuter: {
    width: 100,
    height: 100,
    borderRadius: 28,
    backgroundColor: tk.brandTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  illustrationInner: {
    width: 68,
    height: 68,
    borderRadius: 20,
    backgroundColor: tk.brandTintBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headingArea: {
    marginBottom: 36,
  },
  heading: {
    fontSize: 32,
    fontWeight: '800',
    color: tk.textPrimary,
    marginBottom: 10,
    lineHeight: 38,
    letterSpacing: -0.5,
  },
  subheading: {
    fontSize: 16,
    color: tk.textSecondary,
    lineHeight: 24,
  },
  formArea: {
    marginBottom: 8,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: tk.border,
  },
  dividerText: {
    fontSize: 13,
    color: tk.textTertiary,
    letterSpacing: 0.2,
  },
  socialArea: {
    marginBottom: 32,
  },
  terms: {
    fontSize: 13,
    color: tk.textTertiary,
    textAlign: 'center',
    lineHeight: 20,
  },
  termsLink: {
    color: tk.brand500,
    fontWeight: '500',
  },
  }),
);
