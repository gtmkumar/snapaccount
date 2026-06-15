/**
 * SummaryList — Label / value / Edit row list for filing summaries.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';

export interface SummaryItem {
  label: string;
  value: string;
  onEdit?: () => void;
  editLabel?: string;
  testID?: string;
}

interface SummaryListProps {
  items: SummaryItem[];
  testID?: string;
}

export function SummaryList({ items, testID }: SummaryListProps) {
  const styles = useStyles();
  return (
    <View testID={testID} style={styles.container}>
      {items.map((item, index) => (
        <View
          key={item.label}
          style={[styles.row, index < items.length - 1 && styles.rowDivider]}
          testID={item.testID}
        >
          <Text style={styles.label}>{item.label}</Text>
          <View style={styles.valueRow}>
            <Text style={styles.value} numberOfLines={2}>
              {item.value}
            </Text>
            {item.onEdit && (
              <Pressable
                onPress={item.onEdit}
                style={styles.editBtn}
                accessibilityRole="button"
                accessibilityLabel={item.editLabel ?? `Edit ${item.label}`}
                hitSlop={8}
              >
                <Text style={styles.editText}>{item.editLabel ?? 'Edit'}</Text>
              </Pressable>
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
  container: {
    backgroundColor: tk.raised,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: tk.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    minHeight: 52,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: tk.border,
  },
  label: {
    fontSize: 13,
    color: tk.textSecondary,
    flex: 1,
    lineHeight: 20,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1.5,
    justifyContent: 'flex-end',
  },
  value: {
    fontSize: 13,
    fontWeight: '600',
    color: tk.textPrimary,
    textAlign: 'right',
    flex: 1,
  },
  editBtn: {
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  editText: {
    fontSize: 13,
    fontWeight: '600',
    color: tk.brandCta,
  },
  }),
);
