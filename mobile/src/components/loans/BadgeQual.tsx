/**
 * BadgeQual — Qualification status badge for LoanProductCard.
 * Variants: qualified (success), nearMatch (warning), notQualified (neutral), unchecked (neutral-dim).
 * Phase 6C — docs/design/component-library.md addendum
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';

export type QualLevel = 'QUALIFIED' | 'NEAR_MATCH' | 'NOT_QUALIFIED' | 'UNCHECKED';

interface BadgeQualProps {
  level: QualLevel;
  label: string;
  testID?: string;
}

const badgeConfigFor = (tk: ThemeTokens): Record<
  QualLevel,
  { bg: string; text: string; icon: React.ComponentProps<typeof Ionicons>['name'] }
> => ({
  QUALIFIED: {
    bg: tk.successTint,
    text: tk.successFg,
    icon: 'checkmark-circle',
  },
  NEAR_MATCH: {
    bg: tk.warningTint,
    text: tk.warningFg,
    icon: 'alert-circle',
  },
  NOT_QUALIFIED: {
    bg: tk.sunken,
    text: tk.textSecondary,
    icon: 'remove-circle',
  },
  UNCHECKED: {
    bg: tk.sunken,
    text: tk.textTertiary,
    icon: 'help-circle-outline',
  },
});

export function BadgeQual({ level, label, testID }: BadgeQualProps) {
  const styles = useStyles();
  const { tokens } = useTheme();
  const config = badgeConfigFor(tokens)[level];
  return (
    <View
      testID={testID}
      style={[styles.badge, { backgroundColor: config.bg }]}
      accessibilityLabel={label}
    >
      <Ionicons name={config.icon} size={12} color={config.text} />
      <Text style={[styles.label, { color: config.text }]}>{label}</Text>
    </View>
  );
}

const useStyles = createThemedStyles((_tk: ThemeTokens) =>
  StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  }),
);
