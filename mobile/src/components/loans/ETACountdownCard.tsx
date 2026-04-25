/**
 * ETACountdownCard — Shows typical response time + "Day N of M" progress bar.
 * Phase 6C — docs/design/component-library.md addendum
 * Phase 6F: reuse for other countdown use cases.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Colors } from '../../constants/colors';

interface ETACountdownCardProps {
  totalDays: number;
  elapsedDays: number;
  etaLabel?: string;
  testID?: string;
}

export function ETACountdownCard({
  totalDays,
  elapsedDays,
  etaLabel,
  testID,
}: ETACountdownCardProps) {
  const { t } = useTranslation();
  const progress = totalDays > 0 ? Math.min(elapsedDays / totalDays, 1) : 0;
  const pct = Math.round(progress * 100);

  const progressColor =
    pct < 50 ? Colors.success[500] : pct < 80 ? Colors.warning[500] : Colors.error[500];

  return (
    <View testID={testID} style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="time-outline" size={16} color={Colors.neutral[500]} />
        <Text style={styles.title}>
          {etaLabel ?? t('mobile.loan.status.eta.title')}
        </Text>
      </View>
      <Text style={styles.progress}>
        {t('mobile.loan.status.eta.progress', {
          n: elapsedDays,
          total: totalDays,
        })}
      </Text>
      <View style={styles.trackBg}>
        <View
          style={[
            styles.trackFill,
            { width: `${pct}%` as `${number}%`, backgroundColor: progressColor },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface.default,
    borderRadius: 14,
    padding: 14,
    gap: 8,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.neutral[600],
    flex: 1,
  },
  progress: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.neutral[900],
  },
  trackBg: {
    height: 6,
    backgroundColor: Colors.neutral[100],
    borderRadius: 3,
    overflow: 'hidden',
  },
  trackFill: {
    height: 6,
    borderRadius: 3,
  },
});
