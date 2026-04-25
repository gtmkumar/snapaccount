/**
 * ITR Dashboard Screen — Redesign 2026
 */

import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../../components/ui/Card';
import { StatusBadge } from '../../components/ui/Badge';
import { Colors } from '../../constants/colors';
import apiClient from '../../lib/api';
import type { MoreStackParamList } from '../../navigation/MoreStack';
import { useSensitiveScreen } from '../../hooks/usePreventScreenCapture';
import { RequestCallbackCta } from '../../components/callbacks/RequestCallbackCta';

type NavProp = NativeStackNavigationProp<MoreStackParamList, 'ITRDashboard'>;
interface Props { navigation: NavProp }

interface ITRReturn {
  id: string;
  financialYear: string;
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'USER_APPROVED' | 'FILING_IN_PROGRESS' | 'FILED' | 'E_VERIFIED' | 'COMPLETED';
  regime?: 'old' | 'new';
  taxPayable?: number;
  refundAmount?: number;
}

function getCurrentFY(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const startYear = month >= 4 ? year : year - 1;
  return `FY ${startYear}-${String(startYear + 1).slice(-2)}`;
}

export function ITRDashboardScreen({ navigation }: Props) {
  useSensitiveScreen();

  const currentFY = getCurrentFY();
  const { data: returns = [], isLoading } = useQuery({
    queryKey: ['itr-returns'],
    queryFn: async () => {
      const res = await apiClient.get<ITRReturn[]>('/itr/returns');
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
        <Text style={styles.title}>ITR Filing</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Quick actions */}
        <View style={styles.actionsRow}>
          <Pressable
            style={styles.actionBtn}
            onPress={() => Alert.alert('Coming Soon', 'ITR filing will be available soon.')}
          >
            <View style={styles.actionIconWrap}>
              <Ionicons name="clipboard-outline" size={24} color={Colors.itr} />
            </View>
            <Text style={styles.actionLabel}>Start Filing</Text>
          </Pressable>
          <Pressable
            style={styles.actionBtn}
            onPress={() => Alert.alert('Coming Soon', 'Document checklist coming soon.')}
          >
            <View style={styles.actionIconWrap}>
              <Ionicons name="document-outline" size={24} color={Colors.itr} />
            </View>
            <Text style={styles.actionLabel}>Doc Checklist</Text>
          </Pressable>
          <Pressable
            style={styles.actionBtn}
            onPress={() => Alert.alert('Coming Soon', 'Old vs New regime comparison coming soon.')}
          >
            <View style={styles.actionIconWrap}>
              <Ionicons name="scale-outline" size={24} color={Colors.itr} />
            </View>
            <Text style={styles.actionLabel}>Compare Regime</Text>
          </Pressable>
        </View>

        {/* Returns list */}
        <Text style={styles.sectionTitle}>Your ITR Returns</Text>

        {isLoading ? (
          <View style={styles.skeleton} />
        ) : returns.length === 0 ? (
          <Card shadow="sm" padding="lg">
            <View style={styles.emptyCard}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="document-text-outline" size={36} color={Colors.itr} />
              </View>
              <Text style={styles.emptyTitle}>No ITR returns yet</Text>
              <Text style={styles.emptyText}>
                Start your ITR filing for {currentFY}. Upload Form 16 and other documents to get started.
              </Text>
            </View>
          </Card>
        ) : (
          returns.map((ret) => (
            <Card key={ret.id} shadow="sm" style={styles.returnCard}>
              <View style={styles.returnHeader}>
                <Text style={styles.returnFY}>FY {ret.financialYear}</Text>
                <StatusBadge status={ret.status} />
              </View>
              {ret.regime && (
                <View style={styles.regimePill}>
                  <Text style={styles.returnRegime}>
                    {ret.regime === 'new' ? 'New Tax Regime' : 'Old Tax Regime'}
                  </Text>
                </View>
              )}
            </Card>
          ))
        )}

        {/* Callback CTA */}
        <RequestCallbackCta
          variant="card"
          category="ITR"
          onNavigateToModal={(params) =>
            navigation.navigate('RequestCallbackModal', params)
          }
          onNavigateToStatus={(callbackId) =>
            navigation.navigate('CallbackStatus', { callbackId })
          }
        />

        {/* Info banner */}
        <Card shadow="sm" style={styles.infoBanner}>
          <Text style={styles.infoTitle}>ITR Filing Features</Text>
          {[
            'Smart document checklist based on your profile',
            'Old vs New regime comparison with AI recommendation',
            'E-verification via Aadhaar OTP or net banking',
            'Refund tracking timeline',
            'Notice handling (143(1), 143(2), 139(9))',
          ].map((item, i) => (
            <View key={i} style={styles.infoItemRow}>
              <Ionicons name="checkmark-circle" size={14} color={Colors.itr} />
              <Text style={styles.infoItem}>{item}</Text>
            </View>
          ))}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.base },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.surface.default, borderBottomWidth: 1, borderBottomColor: Colors.neutral[100] },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.neutral[100], alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: Colors.neutral[900], letterSpacing: -0.2 },
  scrollContent: { padding: 16, gap: 16 },

  actionsRow: { flexDirection: 'row', gap: 12 },
  actionBtn: { flex: 1, backgroundColor: Colors.surface.default, borderRadius: 16, padding: 16, alignItems: 'center', gap: 10, shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  actionIconWrap: { width: 48, height: 48, borderRadius: 14, backgroundColor: Colors.itr + '12', alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 12, fontWeight: '600', color: Colors.neutral[700], textAlign: 'center' },

  sectionTitle: { fontSize: 18, fontWeight: '700', color: Colors.neutral[800], letterSpacing: -0.3 },
  skeleton: { height: 100, backgroundColor: Colors.neutral[100], borderRadius: 16 },

  emptyCard: { alignItems: 'center', gap: 10 },
  emptyIconWrap: { width: 64, height: 64, borderRadius: 18, backgroundColor: Colors.itr + '12', alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.neutral[800] },
  emptyText: { fontSize: 14, color: Colors.neutral[500], textAlign: 'center', lineHeight: 22 },

  returnCard: { padding: 16 },
  returnHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  returnFY: { fontSize: 16, fontWeight: '700', color: Colors.neutral[900] },
  regimePill: { alignSelf: 'flex-start', marginTop: 8, backgroundColor: Colors.itr + '12', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  returnRegime: { fontSize: 12, color: Colors.itr, fontWeight: '600' },

  infoBanner: { padding: 18, borderLeftWidth: 3, borderLeftColor: Colors.itr },
  infoTitle: { fontSize: 16, fontWeight: '700', color: Colors.neutral[800], marginBottom: 12, letterSpacing: -0.2 },
  infoItemRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  infoItem: { fontSize: 13, color: Colors.neutral[700], flex: 1, lineHeight: 18 },
});
