/**
 * BadgeQual — Qualification status badge for LoanProductCard.
 * Variants: qualified (success), nearMatch (warning), notQualified (neutral), unchecked (neutral-dim).
 * Phase 6C — docs/design/component-library.md addendum
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';

export type QualLevel = 'QUALIFIED' | 'NEAR_MATCH' | 'NOT_QUALIFIED' | 'UNCHECKED';

interface BadgeQualProps {
  level: QualLevel;
  label: string;
  testID?: string;
}

const BADGE_CONFIG: Record<
  QualLevel,
  { bg: string; text: string; icon: React.ComponentProps<typeof Ionicons>['name'] }
> = {
  QUALIFIED: {
    bg: Colors.success[50],
    text: Colors.success[700],
    icon: 'checkmark-circle',
  },
  NEAR_MATCH: {
    bg: Colors.warning[50],
    text: Colors.warning[700],
    icon: 'alert-circle',
  },
  NOT_QUALIFIED: {
    bg: Colors.neutral[100],
    text: Colors.neutral[500],
    icon: 'remove-circle',
  },
  UNCHECKED: {
    bg: Colors.neutral[100],
    text: Colors.neutral[400],
    icon: 'help-circle-outline',
  },
};

export function BadgeQual({ level, label, testID }: BadgeQualProps) {
  const config = BADGE_CONFIG[level];
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

const styles = StyleSheet.create({
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
});
