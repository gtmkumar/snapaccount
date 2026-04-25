/**
 * EligibilityHintRow — Small row below LoanProductCard showing eligibility reason text + icon.
 * Phase 6C
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import type { QualLevel } from './BadgeQual';

interface EligibilityHintRowProps {
  level: QualLevel;
  text: string;
  testID?: string;
}

const ICON_MAP: Record<
  QualLevel,
  { icon: React.ComponentProps<typeof Ionicons>['name']; color: string }
> = {
  QUALIFIED: { icon: 'checkmark-circle-outline', color: Colors.success[600] },
  NEAR_MATCH: { icon: 'warning-outline', color: Colors.warning[600] },
  NOT_QUALIFIED: { icon: 'information-circle-outline', color: Colors.neutral[400] },
  UNCHECKED: { icon: 'information-circle-outline', color: Colors.neutral[400] },
};

export function EligibilityHintRow({ level, text, testID }: EligibilityHintRowProps) {
  const { icon, color } = ICON_MAP[level];
  return (
    <View testID={testID} style={styles.row}>
      <Ionicons name={icon} size={14} color={color} />
      <Text style={[styles.text, { color }]} numberOfLines={2}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
});
