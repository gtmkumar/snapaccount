/**
 * ETACountdownCard — Shows typical response time + "Day N of M" progress bar.
 * Phase 6C — docs/design/component-library.md addendum
 * Phase 6F: reuse for other countdown use cases.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';

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
  const { tokens } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const progress = totalDays > 0 ? Math.min(elapsedDays / totalDays, 1) : 0;
  const pct = Math.round(progress * 100);

  const progressColor =
    pct < 50 ? tokens.successFg : pct < 80 ? tokens.warningFg : tokens.errorFg;

  return (
    <View testID={testID} style={styles.card}>
      <View style={styles.header}>
        <Ionicons name="time-outline" size={16} color={tokens.textSecondary} />
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

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
  card: {
    backgroundColor: tk.raised,
    borderRadius: 14,
    padding: 14,
    gap: 8,
    shadowColor: tk.shadowColor,
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
    color: tk.textSecondary,
    flex: 1,
  },
  progress: {
    fontSize: 15,
    fontWeight: '700',
    color: tk.textPrimary,
  },
  trackBg: {
    height: 6,
    backgroundColor: tk.sunken,
    borderRadius: 3,
    overflow: 'hidden',
  },
  trackFill: {
    height: 6,
    borderRadius: 3,
  },
  }),
);
