/**
 * Auth Navigator
 * Stack: Splash → PhoneEntry → OTPVerify → PersonaSelection →
 *        (BusinessProfileWizard | IndividualProfileWizard) → LanguageSelection → PermissionRequests
 */

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SplashScreen } from '../screens/auth/SplashScreen';
import { PhoneEntryScreen } from '../screens/auth/PhoneEntryScreen';
import { PasswordAuthScreen } from '../screens/auth/PasswordAuthScreen';
import { OTPVerifyScreen } from '../screens/auth/OTPVerifyScreen';
import { TwoFactorChallengeScreen } from '../screens/auth/TwoFactorChallengeScreen';
import { PersonaSelectionScreen } from '../screens/auth/PersonaSelectionScreen';
import { BusinessProfileWizardScreen } from '../screens/auth/BusinessProfileWizardScreen';
import { IndividualProfileWizardScreen } from '../screens/auth/IndividualProfileWizardScreen';
import { LanguageSelectionScreen } from '../screens/auth/LanguageSelectionScreen';
import { PermissionRequestsScreen } from '../screens/auth/PermissionRequestsScreen';
import { AcceptInviteScreen } from '../screens/auth/AcceptInviteScreen';

export type AuthStackParamList = {
  Splash: undefined;
  PhoneEntry: undefined;
  PasswordAuth: undefined;
  OTPVerify: {
    phone: string;
  };
  TwoFactorChallenge: {
    challengeToken: string;
    phone?: string;
  };
  PersonaSelection: undefined;
  BusinessProfileWizard: undefined;
  IndividualProfileWizard: undefined;
  LanguageSelection: undefined;
  PermissionRequests: undefined;
  /** Invitee org-join — reached via deep link snapaccount://invite/{token} or manual entry. */
  AcceptInvite: { token?: string } | undefined;
  App: undefined;
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="Splash" component={SplashScreen} />
      <Stack.Screen name="PhoneEntry" component={PhoneEntryScreen} />
      <Stack.Screen name="PasswordAuth" component={PasswordAuthScreen} />
      <Stack.Screen name="OTPVerify" component={OTPVerifyScreen} />
      <Stack.Screen name="TwoFactorChallenge" component={TwoFactorChallengeScreen} />
      <Stack.Screen name="PersonaSelection" component={PersonaSelectionScreen} />
      <Stack.Screen name="BusinessProfileWizard" component={BusinessProfileWizardScreen} />
      <Stack.Screen name="IndividualProfileWizard" component={IndividualProfileWizardScreen} />
      <Stack.Screen name="LanguageSelection" component={LanguageSelectionScreen} />
      <Stack.Screen name="PermissionRequests" component={PermissionRequestsScreen} />
      <Stack.Screen name="AcceptInvite" component={AcceptInviteScreen} />
    </Stack.Navigator>
  );
}
