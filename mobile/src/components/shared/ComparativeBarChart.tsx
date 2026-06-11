/**
 * ComparativeBarChart — grouped bars for YoY/MoM revenue / expenses / profit.
 * Wave 7 / GAP-044. Pure RN implementation following the RegimeBarChart
 * precedent (no chart-library dependency; react-native-svg not required for
 * simple proportional bars).
 *
 * A11y: each period group carries a full text summary; values never conveyed
 * by colour alone (legend has labels; amounts printed under each group).
 */

import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { formatINRCompact } from '../../lib/utils';
import type { ComparativePeriod } from '../../api/accounting';

const TRACK_HEIGHT = 120;

interface ComparativeBarChartProps {
  periods: ComparativePeriod[];
  testID?: string;
}

export function ComparativeBarChart({ periods, testID = 'comparative-chart' }: ComparativeBarChartProps) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();

  const maxAbs = Math.max(
    1,
    ...periods.flatMap((p) => [Math.abs(p.revenue), Math.abs(p.expenses), Math.abs(p.netProfit)]),
  );

  const series = [
    { key: 'revenue' as const, color: tokens.brand500, label: t('mobile.reports.comparative.revenue') },
    { key: 'expenses' as const, color: tokens.loanAccent, label: t('mobile.reports.comparative.expenses') },
    { key: 'netProfit' as const, color: tokens.successFg, label: t('mobile.reports.comparative.profit') },
  ];

  return (
    <View style={styles.container} testID={testID}>
      {/* Legend — colour + text label (never colour-only) */}
      <View style={styles.legend}>
        {series.map((s) => (
          <View key={s.key} style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: s.color }]} />
            <Text style={styles.legendLabel}>{s.label}</Text>
          </View>
        ))}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.groupsRow}>
          {periods.map((p) => {
            const summary = t('mobile.reports.comparative.groupA11y', {
              period: p.label,
              revenue: formatINRCompact(p.revenue),
              expenses: formatINRCompact(p.expenses),
              profit: formatINRCompact(p.netProfit),
            });
            return (
              <View
                key={p.periodKey}
                style={styles.group}
                accessible
                accessibilityLabel={summary}
                testID={`${testID}-group-${p.periodKey}`}
              >
                <View style={styles.barsRow}>
                  {series.map((s) => {
                    const value = p[s.key];
                    const ratio = Math.min(1, Math.abs(value) / maxAbs);
                    const negative = value < 0;
                    return (
                      <View key={s.key} style={styles.barTrack}>
                        <View
                          style={[
                            styles.barFill,
                            {
                              height: Math.max(4, Math.round(ratio * TRACK_HEIGHT)),
                              backgroundColor: negative ? tokens.errorCta : s.color,
                            },
                          ]}
                        />
                      </View>
                    );
                  })}
                </View>
                <Text style={styles.groupLabel} numberOfLines={2}>
                  {p.label}
                </Text>
                <Text
                  style={[
                    styles.profitLabel,
                    { color: p.netProfit >= 0 ? tokens.successFg : tokens.errorFg },
                  ]}
                >
                  {formatINRCompact(p.netProfit)}
                </Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
    container: {
      backgroundColor: tk.raised,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: tk.border,
      padding: 16,
      gap: 16,
    },
    legend: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 14,
    },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendSwatch: { width: 12, height: 12, borderRadius: 4 },
    legendLabel: { fontSize: 12, fontWeight: '600', color: tk.textSecondary },
    groupsRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 18,
      paddingVertical: 4,
    },
    group: {
      alignItems: 'center',
      gap: 6,
      minWidth: 64,
    },
    barsRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: 4,
      height: TRACK_HEIGHT,
    },
    barTrack: {
      width: 14,
      height: TRACK_HEIGHT,
      backgroundColor: tk.sunken,
      borderRadius: 5,
      overflow: 'hidden',
      justifyContent: 'flex-end',
    },
    barFill: {
      width: '100%',
      borderRadius: 5,
    },
    groupLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: tk.textSecondary,
      textAlign: 'center',
      maxWidth: 76,
    },
    profitLabel: {
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: -0.2,
    },
  }),
);
