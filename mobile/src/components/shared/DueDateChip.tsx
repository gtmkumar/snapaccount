/**
 * DueDateChip — countdown pill with 5 urgency buckets.
 * Buckets: overdue | today | ≤3 days | ≤7 days | safe
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';

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

const BUCKET_STYLES: Record<
  UrgencyBucket,
  { bg: string; text: string; icon: React.ComponentProps<typeof Ionicons>['name'] }
> = {
  overdue: { bg: Colors.error[50], text: Colors.error[600], icon: 'alert-circle' },
  today: { bg: Colors.error[50], text: Colors.error[600], icon: 'time' },
  urgent: { bg: Colors.warning[50], text: Colors.warning[700], icon: 'time-outline' },
  soon: { bg: Colors.warning[50], text: Colors.warning[600], icon: 'time-outline' },
  safe: { bg: Colors.neutral[100], text: Colors.neutral[600], icon: 'calendar-outline' },
};

interface Props {
  dueDate: string;
  testID?: string;
}

export function DueDateChip({ dueDate, testID }: Props) {
  const { bucket, daysLeft } = getUrgencyBucket(dueDate);
  const style = BUCKET_STYLES[bucket];

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

const styles = StyleSheet.create({
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
});
