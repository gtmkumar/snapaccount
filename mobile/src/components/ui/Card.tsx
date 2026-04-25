/**
 * Card Component — Redesign 2026
 * Premium card with refined shadows and smoother interactions
 */

import React from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Colors } from '../../constants/colors';

interface CardProps {
  children: React.ReactNode;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  shadow?: 'none' | 'sm' | 'md' | 'lg';
  radius?: 'md' | 'lg' | 'xl';
  border?: boolean;
  clickable?: boolean;
  selected?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function Card({
  children,
  padding = 'md',
  shadow = 'sm',
  radius = 'xl',
  border = false,
  clickable = false,
  selected = false,
  onPress,
  style,
}: CardProps) {
  const containerStyle: ViewStyle[] = [
    styles.card,
    styles[`padding_${padding}`],
    styles[`radius_${radius}`],
    shadow !== 'none' && styles[`shadow_${shadow}`],
    border && styles.border,
    selected && styles.selected,
    style,
  ].filter(Boolean) as ViewStyle[];

  if (clickable && onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          ...containerStyle,
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
      >
        {children}
      </Pressable>
    );
  }

  return <View style={containerStyle}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface.default,
  },
  // Padding
  padding_none: {
    padding: 0,
  },
  padding_sm: {
    padding: 12,
  },
  padding_md: {
    padding: 16,
  },
  padding_lg: {
    padding: 24,
  },
  // Radius — more generous for premium feel
  radius_md: {
    borderRadius: 12,
  },
  radius_lg: {
    borderRadius: 16,
  },
  radius_xl: {
    borderRadius: 20,
  },
  // Shadows — refined, subtle, premium
  shadow_sm: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  shadow_md: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  shadow_lg: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 8,
  },
  border: {
    borderWidth: 1,
    borderColor: Colors.neutral[200],
  },
  selected: {
    borderWidth: 2,
    borderColor: Colors.brand[500],
  },
  pressed: {
    transform: [{ scale: 0.98 }],
    shadowOpacity: 0.03,
  },
});
