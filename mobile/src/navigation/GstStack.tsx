import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GstDashboardScreen } from '../screens/gst/GstDashboardScreen';
import { Gstr3bScreen } from '../screens/gst/Gstr3bScreen';
import { GstApprovalScreen } from '../screens/gst/GstApprovalScreen';
import { GstNoticeInboxScreen } from '../screens/gst/GstNoticeInboxScreen';
import { GstNoticeDetailScreen } from '../screens/gst/GstNoticeDetailScreen';
import { GstNilReturnConfirmScreen } from '../screens/gst/GstNilReturnConfirmScreen';
import { RequestCallbackModalScreen } from '../screens/callbacks/RequestCallbackModalScreen';
import { CallbackStatusScreen } from '../screens/callbacks/CallbackStatusScreen';
import type { CtaCategory, LinkedEntity } from '../components/callbacks/RequestCallbackCta';

export type GstStackParamList = {
  GstDashboard: undefined;
  Gstr3b: { returnId: string; period: string };
  GstApproval: { returnId: string; returnType: string };
  /** Phase 6B — deep-link target for notification.gst_notice_received */
  GstNoticeInbox: { orgId: string };
  GstNoticeDetail: { noticeId: string };
  GstNilReturnConfirm: { returnId: string; period: string; gstin: string };
  RequestCallbackModal: {
    category?: CtaCategory;
    linkedEntity?: LinkedEntity;
    prefillReason?: string;
  };
  CallbackStatus: { callbackId: string };
};

const Stack = createNativeStackNavigator<GstStackParamList>();

export function GstStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="GstDashboard" component={GstDashboardScreen} />
      <Stack.Screen name="Gstr3b" component={Gstr3bScreen} />
      <Stack.Screen name="GstApproval" component={GstApprovalScreen} />
      <Stack.Screen name="GstNoticeInbox" component={GstNoticeInboxScreen} />
      <Stack.Screen name="GstNoticeDetail" component={GstNoticeDetailScreen} />
      <Stack.Screen name="GstNilReturnConfirm" component={GstNilReturnConfirmScreen} />
      <Stack.Screen
        name="RequestCallbackModal"
        component={RequestCallbackModalScreen}
        options={{ presentation: 'formSheet' }}
      />
      <Stack.Screen name="CallbackStatus" component={CallbackStatusScreen} />
    </Stack.Navigator>
  );
}
