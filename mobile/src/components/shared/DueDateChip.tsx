/**
 * DueDateChip — countdown pill with 5 urgency buckets.
 * Buckets: overdue | today | ≤3 days | ≤7 days | safe
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';

export type UrgencyBucket = 'overdue' | 'today' | 'urgent' | 'soon' | 'safe';

function getUrgencyBucket(dueDate: string): { bucket: UrgencyBucket; daysLeft: number } {
  const due = new Date(dueDate);
  const now = new Date();
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysLeft = Math.floor((due.getTime() - now.getTime()) / msPerDay);

  if (daysLeft < 0) return { bucket: 'overdue', daysLeft };
  if (daysLeft === 0) return { bucket: 'today', daysLeft };
  if (daysLeft <= 3) return { bucket: 'urgent', daysLeft };
  if (daysLeft <= 7) return { bucket: 'soon', daysLeft };
  return { bucket: 'safe', daysLeft };
}

const bucketStylesFor = (tk: ThemeTokens): Record<
  UrgencyBucket,
  { bg: string; text: string; icon: React.ComponentProps<typeof Ionicons>['name'] }
> => ({
  overdue: { bg: tk.errorTint, text: tk.errorFg, icon: 'alert-circle' },
  today: { bg: tk.errorTint, text: tk.errorFg, icon: 'time' },
  urgent: { bg: tk.warningTint, text: tk.warningFg, icon: 'time-outline' },
  soon: { bg: tk.warningTint, text: tk.warningFg, icon: 'time-outline' },
  safe: { bg: tk.sunken, text: tk.textSecondary, icon: 'calendar-outline' },
});

interface Props {
  dueDate: string;
  testID?: string;
}

export function DueDateChip({ dueDate, testID }: Props) {
  const styles = useStyles();
  const { tokens } = useTheme();
  const { bucket, daysLeft } = getUrgencyBucket(dueDate);
  const style = bucketStylesFor(tokens)[bucket];

  let label: string;
  if (bucket === 'overdue') label = `${Math.abs(daysLeft)}d overdue`;
  else if (bucket === 'today') label = 'Due today';
  else label = `${daysLeft}d left`;

  return (
    <View
      testID={testID}
      style={[styles.chip, { backgroundColor: style.bg }]}
      accessibilityLabel={label}
    >
      <Ionicons name={style.icon} size={11} color={style.text} />
      <Text style={[styles.text, { color: style.text }]}>{label}</Text>
    </View>
  );
}

const useStyles = createThemedStyles((_tk: ThemeTokens) =>
  StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  text: {
    fontSize: 11,
    fontWeight: '600',
  },
  }),
);
