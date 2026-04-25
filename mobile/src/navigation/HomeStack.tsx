import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { HomeScreen } from '../screens/home/HomeScreen';
import { FinancialReportsListScreen } from '../screens/home/FinancialReportsListScreen';
import { ReportDetailScreen } from '../screens/home/ReportDetailScreen';

export type HomeStackParamList = {
  Home: undefined;
  FinancialReportsList: undefined;
  ReportDetail: { reportType: string; reportId?: string };
};

const Stack = createNativeStackNavigator<HomeStackParamList>();

export function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="FinancialReportsList" component={FinancialReportsListScreen} />
      <Stack.Screen name="ReportDetail" component={ReportDetailScreen} />
    </Stack.Navigator>
  );
}
