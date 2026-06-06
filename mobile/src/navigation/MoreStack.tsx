import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MoreScreen } from '../screens/profile/MoreScreen';
import { ProfileScreen } from '../screens/profile/ProfileScreen';
import { DevicesScreen } from '../screens/profile/DevicesScreen';
import { IdentityDocumentsScreen } from '../screens/profile/IdentityDocumentsScreen';
import { NotificationPreferencesScreen } from '../screens/profile/NotificationPreferencesScreen';
import { NotificationCenterScreen } from '../screens/notifications/NotificationCenterScreen';
import { ChatStack } from './ChatStack';
import { ITRDashboardScreen } from '../screens/itr/ITRDashboardScreen';
import { RequestCallbackModalScreen } from '../screens/callbacks/RequestCallbackModalScreen';
import { CallbackStatusScreen } from '../screens/callbacks/CallbackStatusScreen';
import { TeamScreen } from '../screens/team/TeamScreen';
import { AcceptInviteScreen } from '../screens/auth/AcceptInviteScreen';
import type { CtaCategory, LinkedEntity } from '../components/callbacks/RequestCallbackCta';

export type MoreStackParamList = {
  More: undefined;
  Profile: undefined;
  /** Logged-in device management (GET/DELETE /auth/devices) */
  Devices: undefined;
  /** Tax/identity documents collection (GET/POST /auth/me/documents …) */
  IdentityDocuments: undefined;
  /** Notification + language preferences (GET/PATCH /auth/me/preferences) */
  NotificationPreferences: undefined;
  NotificationCenter: undefined;
  /** ChatStack entry — routes internally to ChatList + ChatDetail */
  Chat: undefined;
  /** Legacy direct route kept for back-compat within MoreStack */
  ChatList: undefined;
  /** ITR entry point — navigates into ItrStack for full filing flow */
  ITRDashboard: undefined;
  RequestCallbackModal: {
    category?: CtaCategory;
    linkedEntity?: LinkedEntity;
    prefillReason?: string;
  };
  CallbackStatus: { callbackId: string };
  /** Owner-only team management (members + invites). Phase 2 org invite/join. */
  Team: undefined;
  /** Invitee org-join — reachable when already authenticated (deep link / manual). */
  AcceptInvite: { token?: string } | undefined;
};

const Stack = createNativeStackNavigator<MoreStackParamList>();

export function MoreStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="More" component={MoreScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="Devices" component={DevicesScreen} />
      <Stack.Screen name="IdentityDocuments" component={IdentityDocumentsScreen} />
      <Stack.Screen name="NotificationPreferences" component={NotificationPreferencesScreen} />
      <Stack.Screen name="NotificationCenter" component={NotificationCenterScreen} />
      {/* Phase 6F: Chat now has its own stack (ChatList + ChatDetail) */}
      <Stack.Screen name="Chat" component={ChatStack} />
      {/* ChatList kept for any existing navigate('ChatList') call sites */}
      <Stack.Screen name="ChatList" component={ChatStack} />
      {/* ITRDashboard — entry point into ItrStack (full phase 6D stack via ItrStack.tsx) */}
      <Stack.Screen name="ITRDashboard" component={ITRDashboardScreen} />
      <Stack.Screen
        name="RequestCallbackModal"
        component={RequestCallbackModalScreen}
        options={{ presentation: 'formSheet' }}
      />
      <Stack.Screen name="CallbackStatus" component={CallbackStatusScreen} />
      <Stack.Screen name="Team" component={TeamScreen} />
      <Stack.Screen name="AcceptInvite" component={AcceptInviteScreen} />
    </Stack.Navigator>
  );
}
