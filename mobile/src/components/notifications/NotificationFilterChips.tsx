/**
 * NotificationFilterChips — horizontal category filter chip row.
 * Phase 6E (DG-NOTIF-05) · spec notification-center-enhancements.md §4.3.
 *
 * Chips: All, GST, ITR, Docs, Loan, Callback, Billing, System. Selected chip
 * uses the category module color (per spec table §4.3); inactive chips use the
 * sunken/secondary tokens. Implemented as role="radiogroup" for a11y (§7).
 */

import React from 'react';
import { ScrollView, StyleSheet, Text, Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import type { NotificationCategory } from '../../api/notifications';

/** null = "All" (no category filter). */
export type FilterValue = NotificationCategory | null;

interface ChipDef {
  value: FilterValue;
  /** i18n key suffix under mobile.notifications.filter.* */
  labelKey: string;
}

const CHIPS: ChipDef[] = [
  { value: null, labelKey: 'all' },
  { value: 'GST', labelKey: 'gst' },
  { value: 'ITR', labelKey: 'itr' },
  { value: 'DOCS', labelKey: 'docs' },
  { value: 'LOAN', labelKey: 'loan' },
  { value: 'CALLBACK', labelKey: 'callback' },
  { value: 'BILLING', labelKey: 'billing' },
  { value: 'SYSTEM', labelKey: 'system' },
];

interface Props {
  selected: FilterValue;
  onSelect: (value: FilterValue) => void;
  testID?: string;
}

export function NotificationFilterChips({ selected, onSelect, testID = 'notif-filter-chips' }: Props) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();

  // §4.3 active-chip color mapping.
  const activeColorFor = (value: FilterValue): string => {
    switch (value) {
      case 'GST':
        return tokens.gstAccent;
      case 'ITR':
        return tokens.itrAccent;
      case 'DOCS':
        return tokens.brand500;
      case 'LOAN':
        return tokens.loanAccent;
      case 'CALLBACK':
        return tokens.brand500;
      case 'BILLING':
        return tokens.textSecondary;
      case 'SYSTEM':
        return tokens.textTertiary;
      default:
        return tokens.brand500; // All
    }
  };

  return (
    <View
      accessibilityRole="radiogroup"
      testID={testID}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {CHIPS.map((chip) => {
          const isActive = selected === chip.value;
          const activeColor = activeColorFor(chip.value);
          return (
            <Pressable
              key={chip.labelKey}
              onPress={() => onSelect(chip.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={t(`mobile.notifications.filter.${chip.labelKey}`)}
              style={[
                styles.chip,
                isActive ? { backgroundColor: activeColor } : styles.chipInactive,
              ]}
              testID={`${testID}-${chip.labelKey}`}
            >
              <Text
                style={[styles.chipText, isActive ? styles.chipTextActive : styles.chipTextInactive]}
              >
                {t(`mobile.notifications.filter.${chip.labelKey}`)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
    scroll: {
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 8,
    },
    chip: {
      minHeight: 36,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipInactive: {
      backgroundColor: tk.sunken,
    },
    chipText: {
      fontSize: 13,
      fontWeight: '600',
    },
    chipTextActive: {
      color: '#FFFFFF',
    },
    chipTextInactive: {
      color: tk.textSecondary,
    },
  }),
);
