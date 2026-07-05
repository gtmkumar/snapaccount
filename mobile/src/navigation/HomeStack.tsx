import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { HomeScreen } from '../screens/home/HomeScreen';
import { FinancialReportsListScreen } from '../screens/home/FinancialReportsListScreen';
import { ReportDetailScreen } from '../screens/home/ReportDetailScreen';
// Wave 7 (GAP-044): comparative YoY/MoM charts
import { ComparativeReportScreen } from '../screens/home/ComparativeReportScreen';
// DG-DASH-05 (D3.1/D3.2): Report PDF preview & share (Screen 11)
import { ReportPdfPreviewScreen } from '../screens/home/ReportPdfPreviewScreen';

export type HomeStackParamList = {
  Home: undefined;
  FinancialReportsList: undefined;
  ReportDetail: { reportType: string; reportId?: string };
  /** Wave 7 (GAP-044): YoY/MoM revenue/expense/profit charts. */
  ComparativeReport: undefined;
  /** DG-DASH-05: PDF preview + WhatsApp/Bank share. `reportType` is a UI slug. */
  ReportPdfPreview: { reportType: string; title: string };
};

const Stack = createNativeStackNavigator<HomeStackParamList>();

export function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="FinancialReportsList" component={FinancialReportsListScreen} />
      <Stack.Screen name="ReportDetail" component={ReportDetailScreen} />
      <Stack.Screen name="ComparativeReport" component={ComparativeReportScreen} />
      <Stack.Screen name="ReportPdfPreview" component={ReportPdfPreviewScreen} />
    </Stack.Navigator>
  );
}
