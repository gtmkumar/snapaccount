/**
 * Phone + Password auth — an SMS-free alternative to phone OTP.
 * Toggles between Login and Register; talks to /auth/password/{login,register}.
 */

import React, { useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { PhoneInput } from '../../components/forms/PhoneInput';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import apiClient, { getApiError } from '../../lib/api';
import { isValidPhone } from '../../lib/utils';
import { useAuthStore } from '../../store/authStore';
import { fetchServerUserType } from '../../lib/onboarding';
import type { AuthStackParamList } from '../../navigation/AuthNavigator';

type NavProp = NativeStackNavigationProp<AuthStackParamList, 'PasswordAuth'>;

export function PasswordAuthScreen({ navigation }: { navigation: NavProp }) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const { setAuthenticated, setSession, setOrganizations, updateProfile } = useAuthStore();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isRegister = mode === 'register';
  const canSubmit =
    isValidPhone(phone) &&
    password.length >= (isRegister ? 8 : 1) &&
    (!isRegister || fullName.trim().length >= 2) &&
    !loading;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setError('');
    setLoading(true);
    try {
      const endpoint = isRegister ? '/auth/password/register' : '/auth/password/login';
      const payload = isRegister
        ? { phoneNumber: phone, password, fullName: fullName.trim() }
        : { phoneNumber: phone, password };

      // SEC-025: response also carries refreshToken + refreshExpiresAt when the backend
      // supports rotation (gracefully absent in older builds).
      // 2FA: a password login may return { requires2fa: true, challengeToken } with
      // token/refreshToken null — the user must then complete the TOTP challenge.
      const res = await apiClient.post<{
        isNewUser: boolean;
        token: string | null;
        userId: string;
        refreshToken?: string | null;
        refreshExpiresAt?: string | null;
        requires2fa?: boolean;
        challengeToken?: string | null;
      }>(endpoint, payload);

      const { isNewUser, token, userId, refreshToken, requires2fa, challengeToken } = res.data;

      // 2FA gate — only password/local login can require this (OTP login never does).
      if (requires2fa && challengeToken) {
        setLoading(false);
        navigation.navigate('TwoFactorChallenge', { challengeToken, phone });
        return;
      }

      if (!token) throw new Error('No session token returned.');

      const profile = {
        id: userId,
        firebaseUid: '',
        phone,
        // Persona is chosen on PersonaSelection (new) or hydrated from the server
        // (returning) — never hard-coded to business_owner here.
        userType: null,
        profileComplete: !isNewUser,
        aadhaarVerified: false,
        name: isRegister ? fullName.trim() : undefined,
        createdAt: new Date().toISOString(),
      };

      if (isNewUser) {
        // Keep the token for onboarding calls; stay in Auth stack until the user
        // picks a persona and completes the matching wizard.
        setSession(token, profile, refreshToken ?? null);
        navigation.replace('PersonaSelection');
        return;
      }

      setAuthenticated(token, profile, refreshToken ?? null);
      // Returning user — hydrate the real persona so navigation matches their type.
      {
        const serverType = await fetchServerUserType();
        if (serverType) updateProfile({ userType: serverType });
      }
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
      // isAuthenticated now true → RootNavigator swaps to the app.
    } catch (err: unknown) {
      const apiErr = getApiError(err);
      if (apiErr.statusCode === 401) setError('Invalid phone number or password.');
      else if (apiErr.statusCode === 409) setError('This number is already registered — try logging in.');
      else if (apiErr.statusCode === 429) setError('Too many attempts. Please wait a few minutes.');
      else setError(apiErr.message || 'Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={22} color={tokens.textPrimary} />
          </TouchableOpacity>

          <Text style={styles.heading}>{isRegister ? 'Create account' : 'Welcome back'}</Text>
          <Text style={styles.subtext}>
            {isRegister
              ? 'Sign up with your mobile number and a password — no OTP needed.'
              : 'Log in with your mobile number and password.'}
          </Text>

          <View style={styles.form}>
            <Text style={styles.label}>Mobile number</Text>
            <PhoneInput value={phone} onChange={(v) => { setPhone(v); if (error) setError(''); }} />

            {isRegister && (
              <Input
                label="Full name"
                placeholder="As per your records"
                value={fullName}
                onChangeText={setFullName}
                autoCapitalize="words"
                style={styles.input}
              />
            )}

            <Input
              label="Password"
              placeholder={isRegister ? 'At least 8 characters' : 'Your password'}
              value={password}
              onChangeText={(v) => { setPassword(v); if (error) setError(''); }}
              secureTextEntry
              autoCapitalize="none"
              hint={isRegister ? 'Minimum 8 characters' : undefined}
              error={error || undefined}
              style={styles.input}
            />

            <Button
              label={isRegister ? 'Create account' : 'Log in'}
              onPress={handleSubmit}
              disabled={!canSubmit}
              loading={loading}
              fullWidth
              size="lg"
            />
          </View>

          <TouchableOpacity
            style={styles.toggle}
            onPress={() => { setMode(isRegister ? 'login' : 'register'); setError(''); }}
            accessibilityRole="button"
          >
            <Text style={styles.toggleText}>
              {isRegister ? 'Already have an account? ' : "Don't have an account? "}
              <Text style={styles.toggleLink}>{isRegister ? 'Log in' : 'Register'}</Text>
            </Text>
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <Button
            label="Continue with OTP instead"
            variant="secondary"
            fullWidth
            size="lg"
            onPress={() => navigation.navigate('PhoneEntry')}
            leftIcon={<Ionicons name="chatbubble-ellipses-outline" size={20} color={tokens.textSecondary} />}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: tk.raised },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 40, paddingTop: 8 },
  backBtn: {
    width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
    backgroundColor: tk.sunken, marginBottom: 16,
  },
  heading: { fontSize: 30, fontWeight: '800', color: tk.textPrimary, letterSpacing: -0.5 },
  subtext: { fontSize: 15, color: tk.textSecondary, lineHeight: 22, marginTop: 8, marginBottom: 28 },
  form: { gap: 16 },
  label: { fontSize: 14, fontWeight: '600', color: tk.textSecondary, marginBottom: -8 },
  input: { marginTop: 0 },
  toggle: { marginTop: 20, alignItems: 'center' },
  toggleText: { fontSize: 14, color: tk.textSecondary },
  toggleLink: { color: tk.brand500, fontWeight: '700' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 24 },
  dividerLine: { flex: 1, height: 1, backgroundColor: tk.border },
  dividerText: { fontSize: 13, color: tk.textTertiary },
  }),
);
