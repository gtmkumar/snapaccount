/**
 * EligibilityHintRow — Small row below LoanProductCard showing eligibility reason text + icon.
 * Phase 6C
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import type { QualLevel } from './BadgeQual';

interface EligibilityHintRowProps {
  level: QualLevel;
  text: string;
  testID?: string;
}

const iconMapFor = (tk: ThemeTokens): Record<
  QualLevel,
  { icon: React.ComponentProps<typeof Ionicons>['name']; color: string }
> => ({
  QUALIFIED: { icon: 'checkmark-circle-outline', color: tk.successFg },
  NEAR_MATCH: { icon: 'warning-outline', color: tk.warningFg },
  NOT_QUALIFIED: { icon: 'information-circle-outline', color: tk.textTertiary },
  UNCHECKED: { icon: 'information-circle-outline', color: tk.textTertiary },
});

export function EligibilityHintRow({ level, text, testID }: EligibilityHintRowProps) {
  const styles = useStyles();
  const { tokens } = useTheme();
  const { icon, color } = iconMapFor(tokens)[level];
  return (
    <View testID={testID} style={styles.row}>
      <Ionicons name={icon} size={14} color={color} />
      <Text style={[styles.text, { color }]} numberOfLines={2}>
        {text}
      </Text>
    </View>
  );
}

const useStyles = createThemedStyles((_tk: ThemeTokens) =>
  StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 8,
  },
  text: {
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
    lineHeight: 17,
  },
  }),
);
