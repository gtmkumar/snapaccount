/**
 * EMI Calculator Screen — Redesign 2026
 */

import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../../components/ui/Card';
import { Colors } from '../../constants/colors';
import { formatINR, formatINRCompact } from '../../lib/utils';
import type { LoanStackParamList } from '../../navigation/LoanStack';

type NavProp = NativeStackNavigationProp<LoanStackParamList, 'EMICalculator'>;
interface Props { navigation: NavProp }

function calculateEMI(principal: number, annualRate: number, months: number): number {
  if (months === 0) return 0;
  if (annualRate === 0) return principal / months;
  const r = annualRate / 100 / 12;
  const emi = (principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
  return emi;
}

export function EMICalculatorScreen({ navigation }: Props) {
  const [amount, setAmount] = useState(1000000);
  const [rate, setRate] = useState(14);
  const [months, setMonths] = useState(36);

  const emi = calculateEMI(amount, rate, months);
  const totalPayment = emi * months;
  const totalInterest = totalPayment - amount;
  const interestPercent = totalPayment > 0 ? (totalInterest / totalPayment) * 100 : 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.neutral[800]} />
        </Pressable>
        <Text style={styles.title}>EMI Calculator</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Input card */}
        <Card shadow="sm" style={styles.inputCard}>
          <SliderInput
            label="Loan Amount"
            value={amount}
            min={50000}
            max={5000000}
            step={50000}
            display={formatINRCompact(amount)}
            onChange={setAmount}
          />
          <SliderInput
            label="Interest Rate"
            value={rate}
            min={6}
            max={36}
            step={0.5}
            display={`${rate}% p.a.`}
            onChange={setRate}
          />
          <SliderInput
            label="Tenure"
            value={months}
            min={6}
            max={84}
            step={6}
            display={`${months} months`}
            onChange={setMonths}
          />
        </Card>

        {/* Result card */}
        <View style={styles.resultCard}>
          <LinearGradient
            colors={[Colors.brand[900], Colors.brand[700]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={styles.resultContent}>
            <Text style={styles.resultLabel}>Monthly EMI</Text>
            <Text style={styles.resultEMI}>{formatINR(emi)}</Text>
            <Text style={styles.resultPerMonth}>per month</Text>

            <View style={styles.resultDivider} />

            <View style={styles.resultRows}>
              <View style={styles.resultRow}>
                <Text style={styles.resultRowLabel}>Principal Amount</Text>
                <Text style={styles.resultRowValue}>{formatINR(amount)}</Text>
              </View>
              <View style={styles.resultRow}>
                <Text style={styles.resultRowLabel}>Total Interest</Text>
                <Text style={[styles.resultRowValue, { color: Colors.accent[300] }]}>{formatINR(totalInterest)}</Text>
              </View>
              <View style={[styles.resultRow, styles.resultRowTotal]}>
                <Text style={styles.resultRowLabelBold}>Total Repayment</Text>
                <Text style={styles.resultRowValueBold}>{formatINR(totalPayment)}</Text>
              </View>
            </View>

            {/* Chart */}
            <View style={styles.chartContainer}>
              <View style={styles.chartBar}>
                <View style={[styles.chartPrincipal, { width: `${Math.max(1, 100 - interestPercent)}%` }]} />
                <View style={[styles.chartInterest, { width: `${Math.max(1, interestPercent)}%` }]} />
              </View>
              <View style={styles.chartLegend}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: Colors.brand[300] }]} />
                  <Text style={styles.legendText}>Principal ({(100 - interestPercent).toFixed(0)}%)</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: Colors.accent[400] }]} />
                  <Text style={styles.legendText}>Interest ({interestPercent.toFixed(0)}%)</Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

interface SliderInputProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (value: number) => void;
}

function SliderInput({ label, value, min, max, step, display, onChange }: SliderInputProps) {
  const percent = ((value - min) / (max - min)) * 100;

  return (
    <View style={sliderStyles.container}>
      <View style={sliderStyles.labelRow}>
        <Text style={sliderStyles.label}>{label}</Text>
        <Text style={sliderStyles.value}>{display}</Text>
      </View>
      <View style={sliderStyles.controls}>
        <Pressable
          style={sliderStyles.btn}
          onPress={() => onChange(Math.max(min, value - step))}
          accessibilityLabel={`Decrease ${label}`}
        >
          <Ionicons name="remove" size={18} color={Colors.brand[600]} />
        </Pressable>
        <View style={sliderStyles.track}>
          <View style={[sliderStyles.fill, { width: `${percent}%` }]} />
          <View style={[sliderStyles.thumb, { left: `${percent}%` }]} />
        </View>
        <Pressable
          style={sliderStyles.btn}
          onPress={() => onChange(Math.min(max, value + step))}
          accessibilityLabel={`Increase ${label}`}
        >
          <Ionicons name="add" size={18} color={Colors.brand[600]} />
        </Pressable>
      </View>
    </View>
  );
}

const sliderStyles = StyleSheet.create({
  container: { marginBottom: 24 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  label: { fontSize: 14, color: Colors.neutral[600], fontWeight: '500' },
  value: { fontSize: 14, fontWeight: '700', color: Colors.brand[600] },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  btn: { width: 38, height: 38, borderRadius: 12, backgroundColor: Colors.brand[50], alignItems: 'center', justifyContent: 'center' },
  track: { flex: 1, height: 6, backgroundColor: Colors.neutral[200], borderRadius: 3, overflow: 'visible', position: 'relative' },
  fill: { height: '100%', backgroundColor: Colors.brand[500], borderRadius: 3 },
  thumb: { position: 'absolute', top: -5, width: 16, height: 16, borderRadius: 8, backgroundColor: Colors.brand[500], marginLeft: -8, shadowColor: Colors.brand[500], shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 3 },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg.base },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.surface.default, borderBottomWidth: 1, borderBottomColor: Colors.neutral[100] },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.neutral[100], alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: Colors.neutral[900], letterSpacing: -0.2 },
  scrollContent: { padding: 16, gap: 16 },
  inputCard: { padding: 20 },

  // Result
  resultCard: { borderRadius: 20, overflow: 'hidden' },
  resultContent: { padding: 24 },
  resultLabel: { fontSize: 13, color: 'rgba(255,255,255,0.5)', letterSpacing: 0.3, textTransform: 'uppercase', marginBottom: 4 },
  resultEMI: { fontSize: 36, fontWeight: '800', color: Colors.neutral[0], letterSpacing: -1 },
  resultPerMonth: { fontSize: 14, color: 'rgba(255,255,255,0.4)', marginBottom: 4 },
  resultDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginVertical: 20 },
  resultRows: { gap: 14 },
  resultRow: { flexDirection: 'row', justifyContent: 'space-between' },
  resultRowTotal: { marginTop: 6, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
  resultRowLabel: { fontSize: 14, color: 'rgba(255,255,255,0.6)' },
  resultRowValue: { fontSize: 14, fontWeight: '600', color: Colors.neutral[0] },
  resultRowLabelBold: { fontSize: 15, fontWeight: '700', color: Colors.neutral[0] },
  resultRowValueBold: { fontSize: 15, fontWeight: '800', color: Colors.accent[300] },
  chartContainer: { marginTop: 20 },
  chartBar: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', marginBottom: 10 },
  chartPrincipal: { backgroundColor: Colors.brand[300] },
  chartInterest: { backgroundColor: Colors.accent[400] },
  chartLegend: { flexDirection: 'row', gap: 20 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12, color: 'rgba(255,255,255,0.5)' },
});
