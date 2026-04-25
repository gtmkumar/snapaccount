/**
 * CountdownCard — Severity-graded countdown for e-verification deadline (D-30), etc.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';

interface CountdownCardProps {
  title: string;
  dueDate: string;
  description?: string;
  testID?: string;
}

function getDaysLeft(dueDate: string): number {
  const due = new Date(dueDate);
  const now = new Date();
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.ceil((due.getTime() - now.getTime()) / msPerDay);
}

export function CountdownCard({ title, dueDate, description, testID }: CountdownCardProps) {
  const daysLeft = getDaysLeft(dueDate);
  const isOverdue = daysLeft < 0;
  const isCritical = daysLeft >= 0 && daysLeft <= 5;
  const isWarning = daysLeft > 5 && daysLeft <= 15;

  let bgColor: string;
  let borderColor: string;
  let textColor: string;
  let iconName: React.ComponentProps<typeof Ionicons>['name'];

  if (isOverdue) {
    bgColor = Colors.error[50];
    borderColor = Colors.error[200];
    textColor = Colors.error[700];
    iconName = 'alert-circle';
  } else if (isCritical) {
    bgColor = Colors.error[50];
    borderColor = Colors.error[200];
    textColor = Colors.error[700];
    iconName = 'time';
  } else if (isWarning) {
    bgColor = Colors.warning[50];
    borderColor = Colors.warning[200];
    textColor = Colors.warning[700];
    iconName = 'time-outline';
  } else {
    bgColor = Colors.brand[50];
    borderColor = Colors.brand[200];
    textColor = Colors.brand[700];
    iconName = 'calendar-outline';
  }

  const countLabel = isOverdue
    ? `${Math.abs(daysLeft)} days overdue`
    : daysLeft === 0
    ? 'Due today'
    : `${daysLeft} days left`;

  return (
    <View
      testID={testID}
      style={[styles.card, { backgroundColor: bgColor, borderColor }]}
      accessibilityLabel={`${title}: ${countLabel}`}
    >
      <View style={styles.row}>
        <Ionicons name={iconName} size={20} color={textColor} />
        <View style={styles.textBlock}>
          <Text style={[styles.title, { color: textColor }]}>{title}</Text>
          {description ? (
            <Text style={[styles.description, { color: textColor + 'CC' }]}>
              {description}
            </Text>
          ) : null}
        </View>
        <View style={styles.countBadge}>
          <Text style={[styles.countNum, { color: textColor }]}>
            {isOverdue ? Math.abs(daysLeft) : daysLeft}
          </Text>
          <Text style={[styles.countUnit, { color: textColor }]}>days</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  textBlock: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
  },
  description: {
    fontSize: 12,
    lineHeight: 17,
  },
  countBadge: {
    alignItems: 'center',
    minWidth: 44,
  },
  countNum: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  countUnit: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
