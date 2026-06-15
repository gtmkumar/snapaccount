/**
 * StarRatingInput — 1–5 star rating input (Wave 7 / GAP-031).
 * component-library.md "Wave 7 Additions".
 *
 * A11y: the group is `accessibilityRole="adjustable"` — swipe up/down (AT
 * increment/decrement) adjusts the value, announced as "{{n}} of 5 stars".
 * Each star is also an individual ≥44pt button for direct taps.
 */

import React, { useCallback } from 'react';
import {
  AccessibilityActionEvent,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { useHaptics } from '../../hooks/useHaptics';

interface StarRatingInputProps {
  value: number;
  onChange: (value: number) => void;
  max?: number;
  /** Star touch target — never below 44. */
  size?: number;
  /** Render-only mode (past, already-rated rows). */
  readOnly?: boolean;
  testID?: string;
}

export function StarRatingInput({
  value,
  onChange,
  max = 5,
  size = 44,
  readOnly = false,
  testID = 'star-rating-input',
}: StarRatingInputProps) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const haptics = useHaptics();
  const starSize = Math.max(44, size);

  const setValue = useCallback(
    (next: number) => {
      const clamped = Math.min(max, Math.max(0, next));
      if (clamped !== value) {
        haptics.lightTap();
        onChange(clamped);
      }
    },
    [max, value, onChange, haptics],
  );

  const onAccessibilityAction = useCallback(
    (event: AccessibilityActionEvent) => {
      if (readOnly) return;
      if (event.nativeEvent.actionName === 'increment') setValue(value + 1);
      if (event.nativeEvent.actionName === 'decrement') setValue(value - 1);
    },
    [readOnly, setValue, value],
  );

  return (
    <View
      style={styles.row}
      testID={testID}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={t('mobile.ca.rating.starsA11y')}
      accessibilityValue={{
        min: 0,
        max,
        now: value,
        text: t('mobile.ca.rating.valueA11y', { value, max }),
      }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={onAccessibilityAction}
    >
      {Array.from({ length: max }).map((_, i) => {
        const starIndex = i + 1;
        const filled = starIndex <= value;
        return (
          <Pressable
            key={starIndex}
            style={[styles.star, { width: starSize, height: starSize }]}
            onPress={readOnly ? undefined : () => setValue(starIndex)}
            disabled={readOnly}
            testID={`${testID}-star-${starIndex}`}
            // Stars stay inside the adjustable group for AT; direct taps for touch.
            importantForAccessibility="no"
          >
            <Ionicons
              name={filled ? 'star' : 'star-outline'}
              size={Math.round(starSize * 0.62)}
              color={filled ? tokens.warningFg : tokens.textTertiary}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = createThemedStyles((_tk: ThemeTokens) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    star: {
      alignItems: 'center',
      justifyContent: 'center',
    },
  }),
);
