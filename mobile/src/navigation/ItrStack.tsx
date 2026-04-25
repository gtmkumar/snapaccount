/**
 * ItrStack — React Navigation stack for all ITR filing screens.
 * Phase 6D routes added here.
 */

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ITRDashboardScreen } from '../screens/itr/ITRDashboardScreen';
import { EmployeeProfileWizardScreen } from '../screens/itr/EmployeeProfileWizardScreen';
import { DocChecklistScreen } from '../screens/itr/DocChecklistScreen';
import { Form16UploadScreen } from '../screens/itr/Form16UploadScreen';
import { RegimeComparisonScreen } from '../screens/itr/RegimeComparisonScreen';
import { FilingSummaryScreen } from '../screens/itr/FilingSummaryScreen';
import { UserApprovalScreen } from '../screens/itr/UserApprovalScreen';
import { EVerificationScreen } from '../screens/itr/EVerificationScreen';
import { RefundTrackerScreen } from '../screens/itr/RefundTrackerScreen';
import { ItrNoticeInboxScreen } from '../screens/itr/ItrNoticeInboxScreen';
import { ItrNoticeDetailScreen } from '../screens/itr/ItrNoticeDetailScreen';
import { RequestCallbackModalScreen } from '../screens/callbacks/RequestCallbackModalScreen';
import { CallbackStatusScreen } from '../screens/callbacks/CallbackStatusScreen';
import type { ComputeRequest, TaxRegime } from '../api/itr';
import type { CtaCategory, LinkedEntity } from '../components/callbacks/RequestCallbackCta';

export type ItrStackParamList = {
  ItrDashboard: undefined;
  EmployeeProfileWizard: {
    userId: string;
    assesseeId?: string;
    onComplete?: string; // route to navigate to after completion
  };
  DocChecklist: {
    assesseeId: string;
    filingId?: string;
  };
  Form16Upload: {
    filingId: string;
    assesseeId?: string;
  };
  RegimeComparison: {
    filingId: string;
    computeData?: ComputeRequest;
  };
  FilingSummary: {
    filingId: string;
    regime?: TaxRegime;
  };
  UserApproval: {
    filingId: string;
  };
  EVerification: {
    filingId: string;
  };
  RefundTracker: {
    filingId: string;
  };
  ItrNoticeInbox: {
    filingId: string;
  };
  ItrNoticeDetail: {
    noticeId: string;
    filingId: string;
  };
  RequestCallbackModal: {
    category?: CtaCategory;
    linkedEntity?: LinkedEntity;
    prefillReason?: string;
  };
  CallbackStatus: { callbackId: string };
};

const Stack = createNativeStackNavigator<ItrStackParamList>();

export function ItrStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ItrDashboard" component={ITRDashboardScreen} />
      <Stack.Screen name="EmployeeProfileWizard" component={EmployeeProfileWizardScreen} />
      <Stack.Screen name="DocChecklist" component={DocChecklistScreen} />
      <Stack.Screen name="Form16Upload" component={Form16UploadScreen} />
      <Stack.Screen name="RegimeComparison" component={RegimeComparisonScreen} />
      <Stack.Screen name="FilingSummary" component={FilingSummaryScreen} />
      <Stack.Screen name="UserApproval" component={UserApprovalScreen} />
      <Stack.Screen name="EVerification" component={EVerificationScreen} />
      <Stack.Screen name="RefundTracker" component={RefundTrackerScreen} />
      <Stack.Screen name="ItrNoticeInbox" component={ItrNoticeInboxScreen} />
      <Stack.Screen name="ItrNoticeDetail" component={ItrNoticeDetailScreen} />
      <Stack.Screen
        name="RequestCallbackModal"
        component={RequestCallbackModalScreen}
        options={{ presentation: 'formSheet' }}
      />
      <Stack.Screen name="CallbackStatus" component={CallbackStatusScreen} />
    </Stack.Navigator>
  );
}
