/**
 * Loan Eligibility Check Screen — Stub
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../../components/ui/Button';
import { Colors } from '../../constants/colors';
import type { LoanStackParamList } from '../../navigation/LoanStack';
import { useSensitiveScreen } from '../../hooks/usePreventScreenCapture';

type NavProp = NativeStackNavigationProp<LoanStackParamList, 'LoanEligibility'>;
type RoutePropType = RouteProp<LoanStackParamList, 'LoanEligibility'>;
interface Props { navigation: NavProp; route: RoutePropType }

export function LoanEligibilityScreen({ navigation, route }: Props) {
  useSensitiveScreen();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.neutral[800]} />
        </Pressable>
        <Text style={styles.title}>Check Eligibility</Text>
        <View style={{ width: 40 }} />
      </View>
      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons name="wallet-outline" size={40} color={Colors.brand[500]} />
        </View>
        <Text style={styles.heading}>Eligibility Check</Text>
        <Text style={styles.sub}>Loan type: {route.params.loanType}</Text>
        <Text style={styles.note}>Full eligibility check with GST score, turnover analysis, and bank partner selection coming soon.</Text>
        <Button label="Back to Loan Hub" onPress={() => navigation.goBack()} />
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
  heading: { fontSize: 24, fontWeight: '700', color: Colors.neutral[900], letterSpacing: -0.3 },
  sub: { fontSize: 14, color: Colors.neutral[600] },
  note: { fontSize: 14, color: Colors.neutral[500], textAlign: 'center', lineHeight: 22 },
});
