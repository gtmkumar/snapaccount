/**
 * AmountDisplay Component
 * Renders INR amounts in Indian number system (lakhs/crores)
 * Matches component-library.md §6.1
 */

import React from 'react';
import { Platform, StyleSheet, Text, TextStyle, View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { formatINR, formatINRCompact } from '../../lib/utils';

type AmountFormat = 'full' | 'compact' | 'symbol-only';
type AmountSign = 'auto' | 'positive' | 'negative' | 'none';
type AmountSize = 'sm' | 'md' | 'lg' | 'xl';

interface AmountDisplayProps {
  amount: number;
  unit?: 'paise' | 'rupees';
  format?: AmountFormat;
  sign?: AmountSign;
  size?: AmountSize;
  colorCode?: boolean;
  style?: TextStyle;
}

export function AmountDisplay({
  amount,
  unit = 'rupees',
  format = 'full',
  sign = 'auto',
  size = 'md',
  colorCode = false,
  style,
}: AmountDisplayProps) {
  const { tokens } = useTheme();
  const rupeeAmount = unit === 'paise' ? amount / 100 : amount;

  // Determine sign
  let prefix = '';
  if (sign === 'auto' && rupeeAmount > 0) prefix = '+';
  else if (sign === 'positive') prefix = '+';
  else if (sign === 'negative') prefix = '-';

  // Format amount
  let formatted: string;
  if (format === 'compact') {
    formatted = formatINRCompact(Math.abs(rupeeAmount));
  } else {
    formatted = formatINR(Math.abs(rupeeAmount));
  }

  // Color coding — themed: profit/refund vs loss/owed stay ≥4.5:1 in dark too
  let textColor: string = tokens.textPrimary;
  if (colorCode) {
    textColor = rupeeAmount >= 0 ? tokens.successFg : tokens.errorFg;
  }

  return (
    <View style={styles.container}>
      <Text
        style={[
          styles.base,
          styles[`size_${size}`],
          { color: textColor },
          style,
        ]}
      >
        {prefix}{formatted}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  base: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontWeight: '600',
  },
  size_sm: {
    fontSize: 14,
  },
  size_md: {
    fontSize: 18,
  },
  size_lg: {
    fontSize: 24,
  },
  size_xl: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
});
