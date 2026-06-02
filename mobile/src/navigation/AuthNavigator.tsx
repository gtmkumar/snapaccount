/**
 * Auth Navigator
 * Stack: Splash → PhoneEntry → OTPVerify → BusinessProfileWizard → LanguageSelection → PermissionRequests
 */

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SplashScreen } from '../screens/auth/SplashScreen';
import { PhoneEntryScreen } from '../screens/auth/PhoneEntryScreen';
import { PasswordAuthScreen } from '../screens/auth/PasswordAuthScreen';
import { OTPVerifyScreen } from '../screens/auth/OTPVerifyScreen';
import { BusinessProfileWizardScreen } from '../screens/auth/BusinessProfileWizardScreen';
import { LanguageSelectionScreen } from '../screens/auth/LanguageSelectionScreen';
import { PermissionRequestsScreen } from '../screens/auth/PermissionRequestsScreen';

export type AuthStackParamList = {
  Splash: undefined;
  PhoneEntry: undefined;
  PasswordAuth: undefined;
  OTPVerify: {
    phone: string;
  };
  BusinessProfileWizard: undefined;
  LanguageSelection: undefined;
  PermissionRequests: undefined;
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
      <Stack.Screen name="BusinessProfileWizard" component={BusinessProfileWizardScreen} />
      <Stack.Screen name="LanguageSelection" component={LanguageSelectionScreen} />
      <Stack.Screen name="PermissionRequests" component={PermissionRequestsScreen} />
    </Stack.Navigator>
  );
}
