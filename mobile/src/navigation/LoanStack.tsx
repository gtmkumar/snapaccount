/**
 * LoanStack — Navigation stack for the Loan Hub flow.
 * Phase 6C — 6 screens: Hub, Eligibility, Consent, Application, PackagePreview, Status
 *
 * Deep-link targets:
 *  - LoanStatus (appId) — FCM payload: data.type = 'loan_status_change', data.appId
 *  - LoanPackagePreview (appId) — for package review links
 */

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// Phase 6C screens — new implementations
import { LoanHubScreen } from '../screens/loans/LoanHubScreen';
import { LoanEligibilityScreen } from '../screens/loans/LoanEligibilityScreen';
import { LoanConsentScreen } from '../screens/loans/LoanConsentScreen';
import { LoanApplicationScreen } from '../screens/loans/LoanApplicationScreen';
import { LoanPackagePreviewScreen } from '../screens/loans/LoanPackagePreviewScreen';
import { LoanStatusScreen } from '../screens/loans/LoanStatusScreen';

// Pre-existing utility screens wired into this stack
import { EMICalculatorScreen } from '../screens/loan/EMICalculatorScreen';
import { RequestCallbackModalScreen } from '../screens/callbacks/RequestCallbackModalScreen';
import { CallbackStatusScreen } from '../screens/callbacks/CallbackStatusScreen';
import type { CtaCategory, LinkedEntity } from '../components/callbacks/RequestCallbackCta';

export type LoanStackParamList = {
  LoanHub: undefined;
  LoanEligibility: { loanType: string };
  LoanConsent: {
    applicationId: string;
    productId?: string;
    productName?: string;
    userName?: string;
    /** Masked account number e.g. "XXXX-1234" for mandate consent */
    acctMask?: string;
  };
  LoanApplication: {
    productId: string;
    productName: string;
    applicationId?: string;
  };
  LoanPackagePreview: {
    applicationId: string;
  };
  LoanStatus: {
    applicationId: string;
  };
  // Legacy screens retained
  EMICalculator: undefined;
  RequestCallbackModal: {
    category?: CtaCategory;
    linkedEntity?: LinkedEntity;
    prefillReason?: string;
  };
  CallbackStatus: { callbackId: string };
};

const Stack = createNativeStackNavigator<LoanStackParamList>();

export function LoanStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="LoanHub" component={LoanHubScreen} />
      <Stack.Screen name="LoanEligibility" component={LoanEligibilityScreen} />
      <Stack.Screen name="LoanConsent" component={LoanConsentScreen} />
      <Stack.Screen name="LoanApplication" component={LoanApplicationScreen} />
      <Stack.Screen name="LoanPackagePreview" component={LoanPackagePreviewScreen} />
      <Stack.Screen name="LoanStatus" component={LoanStatusScreen} />
      <Stack.Screen name="EMICalculator" component={EMICalculatorScreen} />
      <Stack.Screen
        name="RequestCallbackModal"
        component={RequestCallbackModalScreen}
        options={{ presentation: 'formSheet' }}
      />
      <Stack.Screen name="CallbackStatus" component={CallbackStatusScreen} />
    </Stack.Navigator>
  );
}
