import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MoreScreen } from '../screens/profile/MoreScreen';
import { ProfileScreen } from '../screens/profile/ProfileScreen';
import { DevicesScreen } from '../screens/profile/DevicesScreen';
import { IdentityDocumentsScreen } from '../screens/profile/IdentityDocumentsScreen';
import { NotificationPreferencesScreen } from '../screens/profile/NotificationPreferencesScreen';
import { NotificationCenterScreen } from '../screens/notifications/NotificationCenterScreen';
import { ChatStack } from './ChatStack';
import { ItrStack } from './ItrStack';
import { RequestCallbackModalScreen } from '../screens/callbacks/RequestCallbackModalScreen';
import { CallbackStatusScreen } from '../screens/callbacks/CallbackStatusScreen';
import { TeamScreen } from '../screens/team/TeamScreen';
import { AcceptInviteScreen } from '../screens/auth/AcceptInviteScreen';
// Phase 7 Wave 2: Privacy Center screens (GAP-020 / M3b)
import { PrivacyCenterScreen } from '../screens/profile/PrivacyCenterScreen';
// Task #18 (GAP-060rem): real Billing / Help / Edit Business destinations
import { BillingScreen } from '../screens/profile/BillingScreen';
import { HelpScreen } from '../screens/profile/HelpScreen';
import { EditBusinessScreen } from '../screens/profile/EditBusinessScreen';
import { MyConsentsScreen } from '../screens/profile/MyConsentsScreen';
import { DataExportScreen } from '../screens/profile/DataExportScreen';
import { CorrectionRequestScreen } from '../screens/profile/CorrectionRequestScreen';
import { MyCorrectionsScreen } from '../screens/profile/MyCorrectionsScreen';
import { DpoContactScreen } from '../screens/profile/DpoContactScreen';
// AND-09: screen-level error boundary — a render crash inside one of the
// newer screens must show an in-app fallback (retry/back) instead of the
// red-screen overlay that ejects the user from the app on Android BACK.
import { withScreenErrorBoundary } from '../components/shared/ScreenErrorBoundary';
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
  // Phase 7 Wave 2: Privacy Center (DPDP Act 2023 / GAP-020)
  PrivacyCenter: undefined;
  MyConsents: undefined;
  DataExport: undefined;
  CorrectionRequest: undefined;
  MyCorrections: undefined;
  DpoContact: undefined;
  // Task #18 (GAP-060rem): Profile menu destinations
  /** Current subscription + invoices (GET /subscriptions/me, /subscriptions/invoices) */
  Billing: undefined;
  /** Help & Support hub — Expert Chat + Request Callback */
  Help: undefined;
  /** Edit business details (GET/PATCH /auth/org/settings) */
  EditBusiness: undefined;
};

const Stack = createNativeStackNavigator<MoreStackParamList>();

// AND-09: wrap the Phase-7 screens (and other newly added destinations) in a
// screen-level error boundary. Wrapped once at module scope so the component
// identity is stable across renders.
const SafePrivacyCenterScreen = withScreenErrorBoundary(PrivacyCenterScreen);
const SafeMyConsentsScreen = withScreenErrorBoundary(MyConsentsScreen);
const SafeDataExportScreen = withScreenErrorBoundary(DataExportScreen);
const SafeCorrectionRequestScreen = withScreenErrorBoundary(CorrectionRequestScreen);
const SafeMyCorrectionsScreen = withScreenErrorBoundary(MyCorrectionsScreen);
const SafeDpoContactScreen = withScreenErrorBoundary(DpoContactScreen);
const SafeBillingScreen = withScreenErrorBoundary(BillingScreen);
const SafeHelpScreen = withScreenErrorBoundary(HelpScreen);
const SafeEditBusinessScreen = withScreenErrorBoundary(EditBusinessScreen);

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
      {/* ITRDashboard — mounts the full ItrStack so all ITR routes are accessible */}
      <Stack.Screen name="ITRDashboard" component={ItrStack} />
      <Stack.Screen
        name="RequestCallbackModal"
        component={RequestCallbackModalScreen}
        options={{ presentation: 'formSheet' }}
      />
      <Stack.Screen name="CallbackStatus" component={CallbackStatusScreen} />
      <Stack.Screen name="Team" component={TeamScreen} />
      <Stack.Screen name="AcceptInvite" component={AcceptInviteScreen} />
      {/* Phase 7 Wave 2: Privacy Center (DPDP Act 2023 / GAP-020) */}
      <Stack.Screen name="PrivacyCenter" component={SafePrivacyCenterScreen} />
      <Stack.Screen name="MyConsents" component={SafeMyConsentsScreen} />
      <Stack.Screen name="DataExport" component={SafeDataExportScreen} />
      <Stack.Screen name="CorrectionRequest" component={SafeCorrectionRequestScreen} />
      <Stack.Screen name="MyCorrections" component={SafeMyCorrectionsScreen} />
      <Stack.Screen name="DpoContact" component={SafeDpoContactScreen} />
      {/* Task #18 (GAP-060rem): Billing / Help / Edit Business */}
      <Stack.Screen name="Billing" component={SafeBillingScreen} />
      <Stack.Screen name="Help" component={SafeHelpScreen} />
      <Stack.Screen name="EditBusiness" component={SafeEditBusinessScreen} />
    </Stack.Navigator>
  );
}
