/**
 * Two-Factor Challenge Screen
 * Shown after a password/local login that returns { requires2fa: true, challengeToken }.
 * Collects the 6-digit TOTP code, exchanges it for a session via
 * POST /auth/2fa/challenge, then completes sign-in exactly like the OTP/password flows.
 *
 * OTP login itself never reaches this screen — only password/local login can require 2FA.
 */

import React, { useCallback, useState } from 'react';
import {
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
import { OTPInput } from '../../components/forms/OTPInput';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { useAuthStore } from '../../store/authStore';
import { fetchServerProfile } from '../../lib/onboarding';
import { registerCurrentDevice } from '../../notifications/pushTokenManager';
import { complete2faChallenge } from '../../api/auth';
import { getApiError } from '../../lib/api';
import type { AuthStackParamList } from '../../navigation/AuthNavigator';

type NavProp = NativeStackNavigationProp<AuthStackParamList, 'TwoFactorChallenge'>;
type TwoFactorRouteProp = RouteProp<AuthStackParamList, 'TwoFactorChallenge'>;

interface Props {
  navigation: NavProp;
  route: TwoFactorRouteProp;
}

export function TwoFactorChallengeScreen({ navigation, route }: Props) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const { challengeToken, phone } = route.params;
  const { setAuthenticated, setOrganizations, updateProfile } = useAuthStore();
  const { t } = useTranslation();

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = useCallback(
    async (value: string) => {
      if (value.length !== 6) return;
      if (!challengeToken) {
        setError(t('mobile.auth.twoFactor.missingToken'));
        return;
      }
      setLoading(true);
      setError('');
      try {
        const result = await complete2faChallenge(challengeToken, value);
        if (!result.token) throw new Error('No session token returned.');

        const profile = {
          id: result.userId,
          firebaseUid: '',
          phone: phone ?? '',
          // 2FA only ever gates a RETURNING user — hydrate the real persona below.
          userType: null,
          profileComplete: true,
          aadhaarVerified: false,
          createdAt: new Date().toISOString(),
        };

        setAuthenticated(result.token, profile, result.refreshToken ?? null);

        // B1.3 device binding (DG-AUTH-01): register this device against the
        // account now that the 2FA challenge has produced a session. Best-effort.
        void registerCurrentDevice();

        // Hydrate the real persona + display name so navigation matches their
        // type and the profile shows their onboarding name (AND-LIVE-06).
        const serverProfile = await fetchServerProfile();
        if (serverProfile) {
          updateProfile({
            ...(serverProfile.userType ? { userType: serverProfile.userType } : {}),
            ...(serverProfile.fullName ? { name: serverProfile.fullName } : {}),
          });
        }

        // Enrich organizations, then let RootNavigator swap to the app.
        try {
          const { apiClient } = await import('../../lib/api');
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
        // isAuthenticated now true → RootNavigator swaps to the app.
      } catch (err: unknown) {
        setCode('');
        const apiErr = getApiError(err);
        if (apiErr.statusCode === 401 || apiErr.statusCode === 400) {
          setError(t('mobile.auth.twoFactor.invalid'));
        } else {
          setError(apiErr.message || t('mobile.auth.twoFactor.error'));
        }
      } finally {
        setLoading(false);
      }
    },
    [challengeToken, phone, t, setAuthenticated, setOrganizations, updateProfile],
  );

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel={t('mobile.common.back')}
          >
            <Ionicons name="arrow-back" size={22} color={tokens.textPrimary} />
          </TouchableOpacity>

          <View style={styles.illustrationArea}>
            <View style={styles.iconCircle}>
              <Ionicons name="shield-checkmark-outline" size={32} color={tokens.brand500} />
            </View>
          </View>

          <Text style={styles.heading}>{t('mobile.auth.twoFactor.title')}</Text>
          <Text style={styles.subtext}>{t('mobile.auth.twoFactor.subtitle')}</Text>

          <View style={styles.otpArea}>
            <OTPInput
              value={code}
              onChange={(v) => {
                setCode(v);
                if (error) setError('');
              }}
              onComplete={submit}
              error={Boolean(error)}
              disabled={loading}
              autoFocus
            />

            {error ? (
              <View style={styles.errorRow}>
                <Ionicons name="alert-circle" size={14} color={tokens.errorFg} />
                <Text style={styles.errorMessage} accessibilityLiveRegion="polite">
                  {error}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.buttonArea}>
            <Button
              label={loading ? t('mobile.auth.twoFactor.verifying') : t('mobile.auth.twoFactor.verify')}
              onPress={() => submit(code)}
              disabled={code.length < 6 || loading}
              loading={loading}
              fullWidth
              size="lg"
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: tk.raised },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, padding: 24, paddingBottom: 40 },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: tk.sunken,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  illustrationArea: { alignItems: 'center', marginBottom: 28 },
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
    marginBottom: 32,
    lineHeight: 22,
  },
  otpArea: { width: '100%', alignItems: 'center', marginBottom: 8 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  errorMessage: { fontSize: 14, color: tk.errorFg },
  buttonArea: { width: '100%', marginTop: 32 },
  }),
);
