/**
 * Button Component — Redesign 2026
 * Variants: primary, secondary, ghost, danger
 * Premium feel with refined animations and better touch feedback
 */

import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  PressableProps,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { Colors } from '../../constants/colors';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<PressableProps, 'style'> {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  style?: ViewStyle;
}

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  leftIcon,
  rightIcon,
  style,
  onPress,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        styles[`size_${size}`],
        styles[`variant_${variant}`],
        isDisabled && styles[`variant_${variant}_disabled`],
        pressed && !isDisabled && styles[`variant_${variant}_pressed`],
        fullWidth && styles.fullWidth,
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' || variant === 'danger' ? Colors.neutral[0] : Colors.brand[500]}
        />
      ) : (
        <View style={styles.content}>
          {leftIcon && <View style={styles.iconLeft}>{leftIcon}</View>}
          <Text
            style={[
              styles.label,
              styles[`label_${size}`],
              styles[`label_${variant}`],
              isDisabled && styles[`label_${variant}_disabled`],
            ]}
            numberOfLines={1}
          >
            {label}
          </Text>
          {rightIcon && <View style={styles.iconRight}>{rightIcon}</View>}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  fullWidth: {
    width: '100%',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconLeft: {
    marginRight: 8,
  },
  iconRight: {
    marginLeft: 8,
  },

  // Sizes
  size_sm: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  size_md: {
    height: 48,
    paddingHorizontal: 20,
    borderRadius: 14,
  },
  size_lg: {
    height: 56,
    paddingHorizontal: 28,
    borderRadius: 16,
  },

  // Primary variant — gradient-like solid with subtle shadow
  variant_primary: {
    backgroundColor: Colors.brand[500],
    shadowColor: Colors.brand[500],
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  variant_primary_pressed: {
    backgroundColor: Colors.brand[600],
    shadowOpacity: 0.15,
    transform: [{ scale: 0.98 }],
  },
  variant_primary_disabled: {
    backgroundColor: Colors.neutral[200],
    shadowOpacity: 0,
    elevation: 0,
  },

  // Secondary variant — clean outline
  variant_secondary: {
    backgroundColor: Colors.neutral[0],
    borderWidth: 1.5,
    borderColor: Colors.neutral[300],
  },
  variant_secondary_pressed: {
    backgroundColor: Colors.brand[50],
    borderColor: Colors.brand[300],
    transform: [{ scale: 0.98 }],
  },
  variant_secondary_disabled: {
    borderColor: Colors.neutral[200],
    backgroundColor: Colors.neutral[50],
  },

  // Ghost variant
  variant_ghost: {
    backgroundColor: 'transparent',
  },
  variant_ghost_pressed: {
    backgroundColor: Colors.brand[50],
    transform: [{ scale: 0.98 }],
  },
  variant_ghost_disabled: {
    backgroundColor: 'transparent',
  },

  // Danger variant
  variant_danger: {
    backgroundColor: Colors.error[500],
    shadowColor: Colors.error[500],
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  variant_danger_pressed: {
    backgroundColor: Colors.error[600],
    shadowOpacity: 0.15,
    transform: [{ scale: 0.98 }],
  },
  variant_danger_disabled: {
    backgroundColor: Colors.neutral[200],
    shadowOpacity: 0,
    elevation: 0,
  },

  // Labels
  label: {
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  label_sm: {
    fontSize: 14,
  },
  label_md: {
    fontSize: 16,
  },
  label_lg: {
    fontSize: 17,
    fontWeight: '700',
  },
  label_primary: {
    color: Colors.neutral[0],
  },
  label_primary_disabled: {
    color: Colors.neutral[400],
  },
  label_secondary: {
    color: Colors.neutral[800],
  },
  label_secondary_disabled: {
    color: Colors.neutral[400],
  },
  label_ghost: {
    color: Colors.brand[600],
  },
  label_ghost_disabled: {
    color: Colors.neutral[400],
  },
  label_danger: {
    color: Colors.neutral[0],
  },
  label_danger_disabled: {
    color: Colors.neutral[400],
  },
});
