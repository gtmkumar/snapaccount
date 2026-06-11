/**
 * Card Component — Redesign 2026
 * Premium card with refined shadows and smoother interactions
 */

import React from 'react';
import { Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import {
  createThemedStyles,
  type ThemeTokens,
} from '../../contexts/ThemeContext';

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
  const styles = useStyles();
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

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
    card: {
      backgroundColor: tk.raised,
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
    // Shadows — named elevation tokens (design-elevation-spec §1.3)
    shadow_sm: { ...tk.elevation1 },
    shadow_md: { ...tk.elevation2 },
    shadow_lg: { ...tk.elevation3 },
    border: {
      borderWidth: 1,
      borderColor: tk.border,
    },
    selected: {
      borderWidth: 2,
      borderColor: tk.brand500,
    },
    pressed: {
      transform: [{ scale: 0.98 }],
      shadowOpacity: 0.03,
    },
  }),
);
