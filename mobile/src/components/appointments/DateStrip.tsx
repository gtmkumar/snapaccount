/**
 * DateStrip / DateChip — horizontal date selector for the CA slot picker.
 * Wave 7 / GAP-031 · component-library.md "Wave 7 Additions".
 *
 * - Each chip ≥44pt wide × 56pt tall; weekday + day-of-month (IST).
 * - Today gets a brand ring; selected is brand-filled; zero-slot days are
 *   disabled (textDisabled + no tap) with the reason in the a11y label —
 *   availability is never conveyed by colour alone.
 * - Day availability comes from GET /appointments/slots/day-map (Wave 7
 *   reconciliation) — see SlotPickerScreen, which feeds the `days` prop.
 */

import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { useHaptics } from '../../hooks/useHaptics';
import { formatIstDate, formatIstDayOfMonth, formatIstWeekday } from '../../lib/ist';

export interface DateStripDay {
  /** IST calendar date `YYYY-MM-DD`. */
  date: string;
  hasSlots: boolean;
  isToday?: boolean;
}

interface DateStripProps {
  days: DateStripDay[];
  selected: string | null;
  onSelect: (date: string) => void;
  testID?: string;
}

export function DateStrip({ days, selected, onSelect, testID = 'date-strip' }: DateStripProps) {
  const styles = useStyles();
  const haptics = useHaptics();
  const { t } = useTranslation();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      testID={testID}
    >
      {days.map((day) => {
        const iso = `${day.date}T00:00:00+05:30`;
        const isSelected = day.date === selected;
        const disabled = !day.hasSlots;
        const a11yLabel = disabled
          ? t('mobile.ca.slot.dayFullA11y', { date: formatIstDate(iso) })
          : formatIstDate(iso);
        return (
          <Pressable
            key={day.date}
            style={[
              styles.chip,
              day.isToday && styles.chipToday,
              isSelected && styles.chipSelected,
              disabled && styles.chipDisabled,
            ]}
            onPress={
              disabled
                ? undefined
                : () => {
                    haptics.lightTap();
                    onSelect(day.date);
                  }
            }
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={a11yLabel}
            accessibilityState={{ selected: isSelected, disabled }}
            testID={`${testID}-chip-${day.date}`}
          >
            <Text
              style={[
                styles.weekday,
                isSelected && styles.textSelected,
                disabled && styles.textDisabled,
              ]}
            >
              {formatIstWeekday(iso)}
            </Text>
            <Text
              style={[
                styles.dayNum,
                isSelected && styles.textSelected,
                disabled && styles.textDisabled,
              ]}
            >
              {formatIstDayOfMonth(iso)}
            </Text>
          </Pressable>
        );
      })}
      <View style={styles.endSpacer} />
    </ScrollView>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
    row: {
      gap: 8,
      paddingHorizontal: 16,
      paddingVertical: 8,
      alignItems: 'center',
    },
    chip: {
      minWidth: 48,
      height: 56,
      borderRadius: 14,
      backgroundColor: tk.sunken,
      borderWidth: 1,
      borderColor: tk.border,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
      gap: 2,
    },
    chipToday: {
      borderColor: tk.brand500,
      borderWidth: 2,
    },
    chipSelected: {
      backgroundColor: tk.brand500,
      borderColor: tk.brand500,
    },
    chipDisabled: {
      opacity: 0.55,
    },
    weekday: {
      fontSize: 11,
      fontWeight: '600',
      color: tk.textSecondary,
    },
    dayNum: {
      fontSize: 16,
      fontWeight: '800',
      color: tk.textPrimary,
    },
    textSelected: {
      color: tk.textOnBrand,
    },
    textDisabled: {
      color: tk.textDisabled,
    },
    endSpacer: { width: 8 },
  }),
);
