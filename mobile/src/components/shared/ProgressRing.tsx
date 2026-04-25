/**
 * ProgressRing — Circular progress indicator.
 * Used in DocChecklistScreen for document completion tracking.
 * Pure RN implementation (no SVG dependency required).
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../constants/colors';

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
  color = Colors.brand[500],
  label,
  centerText,
  testID,
}: ProgressRingProps) {
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
              borderColor: Colors.neutral[100],
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
                borderColor: color,
                // Approximate arc using border transparency
                borderTopColor: fillDegrees >= 90 ? color : 'transparent',
                borderRightColor: fillDegrees >= 180 ? color : 'transparent',
                borderBottomColor: fillDegrees >= 270 ? color : 'transparent',
                borderLeftColor: fillDegrees >= 360 ? color : 'transparent',
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

const styles = StyleSheet.create({
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
    color: Colors.neutral[900],
    letterSpacing: -0.5,
  },
  label: {
    fontSize: 12,
    color: Colors.neutral[500],
    fontWeight: '500',
    textAlign: 'center',
  },
});
