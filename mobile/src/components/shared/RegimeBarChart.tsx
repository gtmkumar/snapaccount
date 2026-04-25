/**
 * RegimeBarChart — Old vs New regime comparison bar chart.
 * Pure RN implementation to avoid react-native-chart-kit dependency uncertainty.
 * Shows two bars proportionally scaled to the larger amount.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../constants/colors';
import { formatINR } from '../../lib/utils';

interface RegimeBarChartProps {
  oldTax: number;
  newTax: number;
  recommendedRegime: 'OLD' | 'NEW';
  testID?: string;
}

const OLD_COLOR = Colors.accent[500];
const NEW_COLOR = Colors.brand[500];

export function RegimeBarChart({
  oldTax,
  newTax,
  recommendedRegime,
  testID,
}: RegimeBarChartProps) {
  const maxTax = Math.max(oldTax, newTax, 1);
  const oldBarRatio = oldTax / maxTax;
  const newBarRatio = newTax / maxTax;
  const saving = Math.abs(oldTax - newTax);

  return (
    <View testID={testID} style={styles.container}>
      <View style={styles.barsRow}>
        {/* Old Regime bar */}
        <View style={styles.barColumn}>
          <View style={styles.barTrack}>
            <View
              style={[
                styles.barFill,
                { height: `${Math.round(oldBarRatio * 100)}%`, backgroundColor: OLD_COLOR },
                recommendedRegime === 'OLD' && styles.barHighlighted,
              ]}
              accessibilityLabel={`Old regime tax: ${formatINR(oldTax)}`}
            />
          </View>
          <Text style={styles.barLabel}>Old Regime</Text>
          <Text style={[styles.barAmount, { color: OLD_COLOR }]}>
            {formatINR(oldTax)}
          </Text>
          {recommendedRegime === 'OLD' && (
            <View style={[styles.recBadge, { backgroundColor: OLD_COLOR + '18' }]}>
              <Text style={[styles.recText, { color: OLD_COLOR }]}>Recommended</Text>
            </View>
          )}
        </View>

        {/* Savings connector */}
        {saving > 0 && (
          <View style={styles.savingsCol}>
            <View style={styles.savingsLine} />
            <View style={styles.savingsBadge}>
              <Text style={styles.savingsLabel}>Save</Text>
              <Text style={styles.savingsAmount}>{formatINR(saving)}</Text>
            </View>
          </View>
        )}

        {/* New Regime bar */}
        <View style={styles.barColumn}>
          <View style={styles.barTrack}>
            <View
              style={[
                styles.barFill,
                { height: `${Math.round(newBarRatio * 100)}%`, backgroundColor: NEW_COLOR },
                recommendedRegime === 'NEW' && styles.barHighlighted,
              ]}
              accessibilityLabel={`New regime tax: ${formatINR(newTax)}`}
            />
          </View>
          <Text style={styles.barLabel}>New Regime</Text>
          <Text style={[styles.barAmount, { color: NEW_COLOR }]}>
            {formatINR(newTax)}
          </Text>
          {recommendedRegime === 'NEW' && (
            <View style={[styles.recBadge, { backgroundColor: NEW_COLOR + '18' }]}>
              <Text style={[styles.recText, { color: NEW_COLOR }]}>Recommended</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface.default,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.neutral[100],
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 0,
    height: 160,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
    height: '100%',
    justifyContent: 'flex-end',
  },
  barTrack: {
    width: 48,
    height: 120,
    backgroundColor: Colors.neutral[100],
    borderRadius: 8,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  barFill: {
    width: '100%',
    borderRadius: 8,
    minHeight: 4,
  },
  barHighlighted: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  barLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.neutral[600],
    textAlign: 'center',
  },
  barAmount: {
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  recBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  recText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  savingsCol: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 64,
    gap: 6,
  },
  savingsLine: {
    width: 1,
    height: 40,
    backgroundColor: Colors.neutral[200],
  },
  savingsBadge: {
    backgroundColor: Colors.success[50],
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.success[200],
  },
  savingsLabel: {
    fontSize: 10,
    color: Colors.success[600],
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  savingsAmount: {
    fontSize: 12,
    color: Colors.success[700],
    fontWeight: '800',
    letterSpacing: -0.2,
  },
});
