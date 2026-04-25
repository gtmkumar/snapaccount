/**
 * OTP Verification Screen — Redesign 2026
 * Clean, focused OTP entry with premium styling
 */

import React, { useCallback, useEffect, useState } from 'react';
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
import { Button } from '../../components/ui/Button';
import { OTPInput, OTPResendTimer } from '../../components/forms/OTPInput';
import { Colors } from '../../constants/colors';
import { FirebaseAuth, FirebaseAuthTypes } from '../../lib/firebase';
import { formatPhoneDisplay } from '../../lib/utils';
import { useAuthStore } from '../../store/authStore';
import type { AuthStackParamList } from '../../navigation/AuthNavigator';
import apiClient from '../../lib/api';

type OTPNavProp = NativeStackNavigationProp<AuthStackParamList, 'OTPVerify'>;
type OTPRouteProp = RouteProp<AuthStackParamList, 'OTPVerify'>;

interface OTPVerifyScreenProps {
  navigation: OTPNavProp;
  route: OTPRouteProp;
}

export function OTPVerifyScreen({ navigation, route }: OTPVerifyScreenProps) {
  const { phone, confirmation } = route.params;
  const { setAuthenticated, setOrganizations } = useAuthStore();

  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [autoDetected, setAutoDetected] = useState(false);

  const formattedPhone = formatPhoneDisplay(phone);

  const verifyOTP = useCallback(
    async (otpValue: string) => {
      if (otpValue.length !== 6) return;

      setLoading(true);
      setError(false);
      setErrorMessage('');

      try {
        const credential = await FirebaseAuth.verifyOTP(confirmation as FirebaseAuthTypes.ConfirmationResult, otpValue);
        const token = await credential.user.getIdToken();

        const response = await apiClient.post<{
          user: {
            id: string;
            firebaseUid: string;
            phone: string;
            userType: 'business_owner' | 'employee' | null;
            profileComplete: boolean;
            name?: string;
            aadhaarVerified: boolean;
          };
          organizations: Array<{
            id: string;
            name: string;
            gstin?: string;
            panNumber?: string;
          }>;
          isNewUser: boolean;
        }>('/auth/verify-token', { idToken: token });

        const { user, organizations, isNewUser } = response.data;

        setAuthenticated(token, {
          id: user.id,
          firebaseUid: user.firebaseUid,
          phone: user.phone,
          userType: user.userType,
          profileComplete: user.profileComplete,
          name: user.name,
          aadhaarVerified: user.aadhaarVerified,
          createdAt: new Date().toISOString(),
        });

        if (organizations.length > 0) {
          setOrganizations(organizations);
        }

        if (isNewUser || !user.profileComplete) {
          navigation.replace('BusinessProfileWizard');
        } else {
          navigation.replace('App' as never, {} as never);
        }
      } catch (err: unknown) {
        setLoading(false);
        setError(true);
        setOtp('');
        const errorMessage = err instanceof Error ? err.message : '';
        if (errorMessage.includes('invalid-verification-code')) {
          const attemptsMatch = errorMessage.match(/(\d+) attempt/);
          const remaining = attemptsMatch ? attemptsMatch[1] : '2';
          setErrorMessage(`Incorrect OTP. ${remaining} attempts remaining.`);
        } else if (errorMessage.includes('session-expired')) {
          setErrorMessage('OTP expired. Please request a new one.');
        } else {
          setErrorMessage('Verification failed. Please try again.');
        }
      }
    },
    [confirmation, navigation, setAuthenticated, setOrganizations],
  );

  const handleOTPComplete = useCallback(
    (value: string) => {
      verifyOTP(value);
    },
    [verifyOTP],
  );

  const handleResendOTP = async () => {
    try {
      await FirebaseAuth.sendOTP(`+91${phone}`);
      setOtp('');
      setError(false);
      setErrorMessage('');
    } catch {
      Alert.alert('Error', 'Could not resend OTP. Please try again.');
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
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={22} color={Colors.neutral[800]} />
          </TouchableOpacity>

          {/* Illustration */}
          <View style={styles.illustrationArea}>
            <View style={styles.iconCircle}>
              <Ionicons name="mail-outline" size={32} color={Colors.brand[500]} />
            </View>
          </View>

          {/* Heading */}
          <Text style={styles.heading}>Verify your number</Text>
          <Text style={styles.subtext}>
            Enter the 6-digit code sent to{' '}
            <Text style={styles.phoneText}>{formattedPhone}</Text>
          </Text>

          <TouchableOpacity
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
            accessibilityLabel="Change phone number"
          >
            <Text style={styles.changeNumber}>Change number</Text>
          </TouchableOpacity>

          {/* Auto-detected banner */}
          {autoDetected && (
            <View style={styles.autoDetectedBanner}>
              <Ionicons name="checkmark-circle" size={16} color={Colors.success[600]} />
              <Text style={styles.autoDetectedText}>
                OTP auto-detected from SMS
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
                <Ionicons name="alert-circle" size={14} color={Colors.error[600]} />
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
              label={loading ? 'Verifying...' : 'Verify & Continue'}
              onPress={() => verifyOTP(otp)}
              disabled={otp.length < 6 || loading}
              loading={loading}
              fullWidth
              size="lg"
            />
          </View>

          <Text style={styles.note}>
            OTP is valid for 5 minutes
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.neutral[0],
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
    backgroundColor: Colors.neutral[100],
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
    backgroundColor: Colors.brand[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.neutral[900],
    marginBottom: 10,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtext: {
    fontSize: 15,
    color: Colors.neutral[500],
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 22,
  },
  phoneText: {
    fontWeight: '600',
    color: Colors.neutral[800],
  },
  changeNumber: {
    fontSize: 14,
    color: Colors.brand[500],
    fontWeight: '600',
    marginBottom: 32,
    textAlign: 'center',
  },
  autoDetectedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.success[50],
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 16,
  },
  autoDetectedText: {
    color: Colors.success[700],
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
    color: Colors.error[600],
  },
  buttonArea: {
    width: '100%',
    marginTop: 32,
  },
  note: {
    fontSize: 12,
    color: Colors.neutral[400],
    marginTop: 14,
    textAlign: 'center',
  },
});
