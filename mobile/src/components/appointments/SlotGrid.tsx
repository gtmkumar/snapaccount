/**
 * SlotGrid / SlotChip — time-slot grid grouped by part of day (IST).
 * Wave 7 / GAP-031 · component-library.md "Wave 7 Additions".
 *
 * - Chips ≥44pt, label = IST local time ("10:30 AM").
 * - Booked/past slots disabled (textDisabled + no tap, reason in a11y label).
 * - "All times IST" caption is meaningful text → textTertiary (never neutral-400).
 */

import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { useHaptics } from '../../hooks/useHaptics';
import { formatIstTime, getIstHour } from '../../lib/ist';
import type { AppointmentSlot } from '../../api/appointments';

interface SlotGridProps {
  slots: AppointmentSlot[];
  selectedSlotId: string | null;
  onSelect: (slot: AppointmentSlot) => void;
  testID?: string;
}

type PartOfDay = 'morning' | 'afternoon' | 'evening';

function partOfDay(startIso: string): PartOfDay {
  const hour = getIstHour(startIso);
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

const PART_ORDER: PartOfDay[] = ['morning', 'afternoon', 'evening'];

export function SlotGrid({ slots, selectedSlotId, onSelect, testID = 'slot-grid' }: SlotGridProps) {
  const styles = useStyles();
  const haptics = useHaptics();
  const { t } = useTranslation();

  const groups = useMemo(() => {
    const map: Record<PartOfDay, AppointmentSlot[]> = {
      morning: [],
      afternoon: [],
      evening: [],
    };
    for (const slot of slots) map[partOfDay(slot.startsAt)].push(slot);
    return map;
  }, [slots]);

  return (
    <View style={styles.container} testID={testID}>
      <Text style={styles.istCaption}>{t('mobile.ca.slot.allTimesIst')}</Text>
      {PART_ORDER.filter((part) => groups[part].length > 0).map((part) => (
        <View key={part} style={styles.group}>
          <Text style={styles.groupTitle}>{t(`mobile.ca.slot.partOfDay.${part}`)}</Text>
          <View style={styles.grid}>
            {groups[part].map((slot) => {
              const isSelected = slot.slotId === selectedSlotId;
              const disabled = !slot.available;
              const timeLabel = formatIstTime(slot.startsAt);
              return (
                <Pressable
                  key={slot.slotId}
                  style={[
                    styles.chip,
                    isSelected && styles.chipSelected,
                    disabled && styles.chipDisabled,
                  ]}
                  onPress={
                    disabled
                      ? undefined
                      : () => {
                          haptics.lightTap();
                          onSelect(slot);
                        }
                  }
                  disabled={disabled}
                  accessibilityRole="button"
                  accessibilityLabel={
                    disabled
                      ? t('mobile.ca.slot.bookedA11y', { time: timeLabel })
                      : t('mobile.ca.slot.slotA11y', { time: timeLabel })
                  }
                  accessibilityState={{ selected: isSelected, disabled }}
                  testID={`${testID}-slot-${slot.slotId}`}
                >
                  <Text
                    style={[
                      styles.chipText,
                      isSelected && styles.chipTextSelected,
                      disabled && styles.chipTextDisabled,
                    ]}
                  >
                    {timeLabel}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
    container: { gap: 16 },
    istCaption: {
      fontSize: 12,
      fontWeight: '500',
      color: tk.textTertiary,
    },
    group: { gap: 8 },
    groupTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: tk.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chip: {
      minHeight: 44,
      minWidth: 92,
      borderRadius: 12,
      backgroundColor: tk.sunken,
      borderWidth: 1,
      borderColor: tk.border,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    chipSelected: {
      backgroundColor: tk.brand500,
      borderColor: tk.brand500,
    },
    chipDisabled: {
      opacity: 0.5,
    },
    chipText: {
      fontSize: 14,
      fontWeight: '600',
      color: tk.textPrimary,
    },
    chipTextSelected: {
      color: tk.textOnBrand,
    },
    chipTextDisabled: {
      color: tk.textDisabled,
    },
  }),
);
