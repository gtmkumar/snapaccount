/**
 * ProgressRing — Circular progress indicator.
 * Used in DocChecklistScreen for document completion tracking.
 * Pure RN implementation (no SVG dependency required).
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';

interface ProgressRingProps {
  progress: number; // 0–1
  size?: number;
  strokeWidth?: number;
  color?: string;
  label?: string;
  centerText?: string;
  testID?: string;
}

export function ProgressRing({
  progress,
  size = 72,
  strokeWidth = 6,
  color,
  label,
  centerText,
  testID,
}: ProgressRingProps) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const ringColor = color ?? tokens.brand500;
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const pct = Math.round(clampedProgress * 100);

  // Build arc using border-color transparency approach (RN doesn't have SVG built-in)
  const fillDegrees = clampedProgress * 360;

  return (
    <View testID={testID} style={styles.wrapper}>
      <View
        style={[styles.ring, { width: size, height: size, borderRadius: size / 2 }]}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: pct }}
        accessibilityLabel={label ?? `${pct}% complete`}
      >
        {/* Background ring */}
        <View
          style={[
            styles.ringBase,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderWidth: strokeWidth,
              borderColor: tokens.border,
            },
          ]}
        />

        {/* Progress ring — using clip trick */}
        {fillDegrees > 0 && (
          <View
            style={[
              styles.ringProgress,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
                borderWidth: strokeWidth,
                borderColor: ringColor,
                // Approximate arc using border transparency
                borderTopColor: fillDegrees >= 90 ? ringColor : 'transparent',
                borderRightColor: fillDegrees >= 180 ? ringColor : 'transparent',
                borderBottomColor: fillDegrees >= 270 ? ringColor : 'transparent',
                borderLeftColor: fillDegrees >= 360 ? ringColor : 'transparent',
                transform: [{ rotate: '-90deg' }],
              },
            ]}
          />
        )}

        {/* Center content */}
        <View style={styles.center}>
          <Text style={[styles.centerText, { fontSize: size * 0.22 }]}>
            {centerText ?? `${pct}%`}
          </Text>
        </View>
      </View>

      {label && <Text style={styles.label}>{label}</Text>}
    </View>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    gap: 8,
  },
  ring: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringBase: {
    position: 'absolute',
  },
  ringProgress: {
    position: 'absolute',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerText: {
    fontWeight: '800',
    color: tk.textPrimary,
    letterSpacing: -0.5,
  },
  label: {
    fontSize: 12,
    color: tk.textSecondary,
    fontWeight: '500',
    textAlign: 'center',
  },
  }),
);
