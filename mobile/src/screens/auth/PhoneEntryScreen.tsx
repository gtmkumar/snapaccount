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
import { Button } from '../../components/ui/Button';
import { PhoneInput } from '../../components/forms/PhoneInput';
import { Colors } from '../../constants/colors';
import { FirebaseAuth } from '../../lib/firebase';
import { isValidPhone } from '../../lib/utils';
import type { AuthStackParamList } from '../../navigation/AuthNavigator';
import { FirebaseAuthTypes } from '../../lib/firebase';

type PhoneEntryNavProp = NativeStackNavigationProp<AuthStackParamList, 'PhoneEntry'>;

interface PhoneEntryScreenProps {
  navigation: PhoneEntryNavProp;
}

export function PhoneEntryScreen({ navigation }: PhoneEntryScreenProps) {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const canSubmit = isValidPhone(phone) && !loading;

  const handleSendOTP = async () => {
    if (!canSubmit) return;

    setError('');
    setLoading(true);

    try {
      const fullNumber = `+91${phone}`;
      const confirmation = await FirebaseAuth.sendOTP(fullNumber);

      navigation.navigate('OTPVerify', {
        phone,
        confirmation: confirmation as FirebaseAuthTypes.ConfirmationResult,
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '';
      if (errorMessage.includes('too-many-requests')) {
        setError('Too many attempts. Please try after 30 minutes.');
      } else if (errorMessage.includes('invalid-phone-number')) {
        setError('Invalid phone number. Please check and try again.');
      } else {
        Alert.alert('Error', 'Something went wrong. Please try again.');
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
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
                <Ionicons name="shield-checkmark" size={40} color={Colors.brand[500]} />
              </View>
            </View>
          </View>

          {/* Heading */}
          <View style={styles.headingArea}>
            <Text style={styles.heading}>Welcome to{'\n'}SnapAccount</Text>
            <Text style={styles.subheading}>
              GST, ITR, Loans -- all in one place for your business
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
              label={loading ? 'Sending OTP...' : 'Continue with OTP'}
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
            <Text style={styles.dividerText}>or continue with</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Social login */}
          <View style={styles.socialArea}>
            <Button
              label="Google"
              variant="secondary"
              fullWidth
              size="lg"
              leftIcon={<Ionicons name="logo-google" size={20} color={Colors.neutral[700]} />}
              onPress={() => Alert.alert('Coming soon', 'Google Sign-In will be available soon.')}
            />
            {Platform.OS === 'ios' && (
              <Button
                label="Apple"
                variant="secondary"
                fullWidth
                size="lg"
                leftIcon={<Ionicons name="logo-apple" size={20} color={Colors.neutral[900]} />}
                onPress={() => Alert.alert('Coming soon', 'Apple Sign-In will be available soon.')}
                style={{ marginTop: 12 }}
              />
            )}
          </View>

          {/* Terms */}
          <Text style={styles.terms}>
            By continuing, you agree to our{' '}
            <Text style={styles.termsLink}>Terms of Service</Text>
            {' '}and{' '}
            <Text style={styles.termsLink}>Privacy Policy</Text>
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
    backgroundColor: Colors.brand[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  illustrationInner: {
    width: 68,
    height: 68,
    borderRadius: 20,
    backgroundColor: Colors.brand[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  headingArea: {
    marginBottom: 36,
  },
  heading: {
    fontSize: 32,
    fontWeight: '800',
    color: Colors.neutral[900],
    marginBottom: 10,
    lineHeight: 38,
    letterSpacing: -0.5,
  },
  subheading: {
    fontSize: 16,
    color: Colors.neutral[500],
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
    backgroundColor: Colors.neutral[200],
  },
  dividerText: {
    fontSize: 13,
    color: Colors.neutral[400],
    letterSpacing: 0.2,
  },
  socialArea: {
    marginBottom: 32,
  },
  terms: {
    fontSize: 13,
    color: Colors.neutral[400],
    textAlign: 'center',
    lineHeight: 20,
  },
  termsLink: {
    color: Colors.brand[500],
    fontWeight: '500',
  },
});
