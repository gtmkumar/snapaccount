/**
 * Loan Hub Screen — Redesign 2026
 * Premium loan marketplace with gradient hero and refined cards
 */

import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Colors } from '../../constants/colors';
import type { LoanStackParamList } from '../../navigation/LoanStack';
import { useSensitiveScreen } from '../../hooks/usePreventScreenCapture';

type NavProp = NativeStackNavigationProp<LoanStackParamList, 'LoanHub'>;
interface Props { navigation: NavProp }

type LoanType = {
  id: string;
  label: string;
  range: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  features: string;
  rate: string;
  badge?: string;
};

const LOAN_TYPES: LoanType[] = [
  { id: 'business', label: 'Business Loan', range: '1L - 50L', icon: 'briefcase-outline', color: Colors.brand[500], features: 'Growth capital, expansion, inventory', rate: 'From 12% p.a.' },
  { id: 'working_capital', label: 'Working Capital', range: '50K - 25L', icon: 'sync-outline', color: Colors.success[600], features: 'Cash flow, day-to-day operations', rate: 'From 14% p.a.' },
  { id: 'personal', label: 'Personal Loan', range: '50K - 10L', icon: 'person-outline', color: Colors.accent[500], features: 'Personal needs, emergency', rate: 'From 16% p.a.' },
  { id: 'msme_mudra', label: 'MSME / Mudra Loan', range: '10K - 10L', icon: 'business-outline', color: Colors.success[600], features: 'Government-backed, lower interest', rate: 'From 8% p.a.', badge: 'Govt. Scheme' },
];

export function LoanHubScreen({ navigation }: Props) {
  useSensitiveScreen();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Loan Hub</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Hero card */}
        <View style={styles.heroCard}>
          <LinearGradient
            colors={[Colors.brand[800], Colors.brand[600]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={styles.heroContent}>
            <View style={styles.heroIconWrap}>
              <Ionicons name="diamond-outline" size={24} color="rgba(255,255,255,0.8)" />
            </View>
            <Text style={styles.heroTitle}>Get the right loan for your business</Text>
            <Text style={styles.heroSubtitle}>Powered by GST data + AI</Text>
            <View style={styles.heroAmountRow}>
              <Text style={styles.heroAmountLabel}>Available up to</Text>
              <Text style={styles.heroAmount}>₹50,00,000</Text>
            </View>
          </View>
        </View>

        {/* Loan type cards */}
        {LOAN_TYPES.map((loan) => (
          <Card key={loan.id} shadow="sm" style={styles.loanCard}>
            <View style={styles.loanCardHeader}>
              <View style={[styles.loanIcon, { backgroundColor: loan.color + '15' }]}>
                <Ionicons name={loan.icon} size={22} color={loan.color} />
              </View>
              <View style={styles.loanInfo}>
                <View style={styles.loanLabelRow}>
                  <Text style={styles.loanLabel}>{loan.label}</Text>
                  {loan.badge && (
                    <View style={styles.govtBadge}>
                      <Text style={styles.govtBadgeText}>{loan.badge}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.loanRange}>{loan.range}</Text>
              </View>
            </View>
            <Text style={styles.loanFeatures}>{loan.features}</Text>
            <View style={styles.loanBottom}>
              <Text style={styles.loanRate}>{loan.rate}</Text>
              <Button
                label="Check Eligibility"
                size="sm"
                onPress={() => navigation.navigate('LoanEligibility', { loanType: loan.id })}
              />
            </View>
          </Card>
        ))}

        {/* Bottom links */}
        <View style={styles.bottomLinks}>
          <Pressable style={styles.linkCard} onPress={() => navigation.navigate('EMICalculator')}>
            <Ionicons name="calculator-outline" size={22} color={Colors.brand[500]} />
            <Text style={styles.linkCardText}>EMI Calculator</Text>
            <Ionicons name="chevron-forward" size={18} color={Colors.neutral[400]} />
          </Pressable>
          {/* LoanStatus navigation removed — now requires applicationId param (Phase 6C) */}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.base },
  header: { paddingHorizontal: 20, paddingVertical: 14, backgroundColor: Colors.surface.default, borderBottomWidth: 1, borderBottomColor: Colors.neutral[100] },
  headerTitle: { fontSize: 22, fontWeight: '800', color: Colors.neutral[900], letterSpacing: -0.3 },
  scrollContent: { padding: 16, gap: 14 },

  // Hero
  heroCard: { borderRadius: 20, overflow: 'hidden', marginBottom: 4 },
  heroContent: { padding: 22 },
  heroIconWrap: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  heroTitle: { fontSize: 20, fontWeight: '700', color: Colors.neutral[0], marginBottom: 4, letterSpacing: -0.3 },
  heroSubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.6)', marginBottom: 18 },
  heroAmountRow: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: 12 },
  heroAmountLabel: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 2 },
  heroAmount: { fontSize: 24, fontWeight: '800', color: Colors.accent[300], letterSpacing: -0.5 },

  // Loan cards
  loanCard: { padding: 18, marginBottom: 2 },
  loanCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 14 },
  loanIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  loanInfo: { flex: 1 },
  loanLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  loanLabel: { fontSize: 16, fontWeight: '700', color: Colors.neutral[900], letterSpacing: -0.2 },
  loanRange: { fontSize: 13, color: Colors.neutral[500], marginTop: 2 },
  govtBadge: { backgroundColor: Colors.success[50], paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  govtBadgeText: { fontSize: 10, fontWeight: '700', color: Colors.success[600], letterSpacing: 0.3 },
  loanFeatures: { fontSize: 13, color: Colors.neutral[500], marginBottom: 12, lineHeight: 18 },
  loanBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  loanRate: { fontSize: 14, fontWeight: '600', color: Colors.success[600] },

  // Bottom links
  bottomLinks: { gap: 8, marginTop: 4 },
  linkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface.default,
    borderRadius: 14,
    padding: 16,
    gap: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  linkCardText: { flex: 1, fontSize: 15, fontWeight: '600', color: Colors.neutral[800] },
});
