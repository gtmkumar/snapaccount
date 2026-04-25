/**
 * Loan Status Tracking Screen — Stub with TanStack Query
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import apiClient from '../../lib/api';
import type { LoanStackParamList } from '../../navigation/LoanStack';
import { useSensitiveScreen } from '../../hooks/usePreventScreenCapture';
import { RequestCallbackCta } from '../../components/callbacks/RequestCallbackCta';

type NavProp = NativeStackNavigationProp<LoanStackParamList, 'LoanStatus'>;
interface Props { navigation: NavProp }

export function LoanStatusScreen({ navigation }: Props) {
  // SEC-015: Prevent screenshots on loan status screen (shows application and offer details)
  useSensitiveScreen();

  const { data: applications = [] } = useQuery({
    queryKey: ['loan-applications'],
    queryFn: async () => {
      const res = await apiClient.get<unknown[]>('/loans/applications');
      return res.data;
    },
    placeholderData: [],
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.neutral[800]} />
        </Pressable>
        <Text style={styles.title}>Loan Applications</Text>
        <View style={{ width: 40 }} />
      </View>
      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons name="document-text-outline" size={36} color={Colors.brand[500]} />
        </View>
        <Text style={styles.heading}>
          {applications.length === 0 ? 'No active applications' : `${applications.length} application(s)`}
        </Text>
        <Text style={styles.note}>
          Full loan tracking with per-bank status, offer comparison, and EMI schedule coming soon.
        </Text>
        <View style={styles.ctaWrapper}>
          <RequestCallbackCta
            variant="card"
            category="LOAN"
            onNavigateToModal={(params) =>
              navigation.navigate('RequestCallbackModal', params)
            }
            onNavigateToStatus={(callbackId) =>
              navigation.navigate('CallbackStatus', { callbackId })
            }
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.base },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.surface.default, borderBottomWidth: 1, borderBottomColor: Colors.neutral[100] },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.neutral[100], alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: Colors.neutral[900], letterSpacing: -0.2 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  iconWrap: { width: 72, height: 72, borderRadius: 22, backgroundColor: Colors.brand[50], alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  heading: { fontSize: 20, fontWeight: '700', color: Colors.neutral[900], letterSpacing: -0.3 },
  note: { fontSize: 14, color: Colors.neutral[500], textAlign: 'center', lineHeight: 22 },
  ctaWrapper: { width: '100%', marginTop: 8 },
});
