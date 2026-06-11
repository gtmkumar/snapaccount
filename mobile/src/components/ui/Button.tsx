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
import {
  createThemedStyles,
  useTheme,
  type ThemeTokens,
} from '../../contexts/ThemeContext';

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
  const { tokens } = useTheme();
  const styles = useStyles();
  const isDisabled = disabled || loading;

  // The visual styles (background, border, shadow) live on a plain inner View,
  // NOT on the Pressable. Under the New Architecture (RN 0.85 / Fabric) a
  // Pressable with a function `style` does not reliably apply `backgroundColor`,
  // which made enabled primary buttons render with no fill (white-on-white, i.e.
  // "invisible"). A plain View applies backgroundColor reliably. The Pressable
  // now only handles touch + width; the inner View carries the look and the
  // pressed state.
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={fullWidth ? styles.fullWidth : undefined}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      {...rest}
    >
      {({ pressed }) => (
        <View
          style={[
            styles.base,
            styles[`size_${size}`],
            styles[`variant_${variant}`],
            isDisabled && styles[`variant_${variant}_disabled`],
            pressed && !isDisabled && styles[`variant_${variant}_pressed`],
            fullWidth && styles.fullWidth,
            style,
          ]}
        >
          {loading ? (
            <ActivityIndicator
              size="small"
              color={
                variant === 'danger'
                  ? '#FFFFFF'
                  : variant === 'primary'
                    ? tokens.textOnBrand
                    : tokens.brand500
              }
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
        </View>
      )}
    </Pressable>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
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

    // Primary variant — solid CTA fill (≥4.5:1 with textOnBrand in both modes)
    variant_primary: {
      backgroundColor: tk.brandCta,
      shadowColor: tk.brandCta,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 4,
    },
    variant_primary_pressed: {
      backgroundColor: tk.brandCtaPressed,
      shadowOpacity: 0.15,
      transform: [{ scale: 0.98 }],
    },
    variant_primary_disabled: {
      backgroundColor: tk.skeleton1,
      shadowOpacity: 0,
      elevation: 0,
    },

    // Secondary variant — clean outline
    variant_secondary: {
      backgroundColor: tk.raised,
      borderWidth: 1.5,
      borderColor: tk.border,
    },
    variant_secondary_pressed: {
      backgroundColor: tk.brandTint,
      borderColor: tk.brand400,
      transform: [{ scale: 0.98 }],
    },
    variant_secondary_disabled: {
      borderColor: tk.border,
      backgroundColor: tk.sunken,
    },

    // Ghost variant
    variant_ghost: {
      backgroundColor: 'transparent',
    },
    variant_ghost_pressed: {
      backgroundColor: tk.brandTint,
      transform: [{ scale: 0.98 }],
    },
    variant_ghost_disabled: {
      backgroundColor: 'transparent',
    },

    // Danger variant — errorCta keeps white label ≥4.5:1 in both modes
    variant_danger: {
      backgroundColor: tk.errorCta,
      shadowColor: tk.errorCta,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 4,
    },
    variant_danger_pressed: {
      backgroundColor: tk.errorCta,
      shadowOpacity: 0.15,
      transform: [{ scale: 0.98 }],
    },
    variant_danger_disabled: {
      backgroundColor: tk.skeleton1,
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
      color: tk.textOnBrand,
    },
    label_primary_disabled: {
      color: tk.textDisabled,
    },
    label_secondary: {
      color: tk.textPrimary,
    },
    label_secondary_disabled: {
      color: tk.textDisabled,
    },
    label_ghost: {
      color: tk.brandFg,
    },
    label_ghost_disabled: {
      color: tk.textDisabled,
    },
    label_danger: {
      color: '#FFFFFF',
    },
    label_danger_disabled: {
      color: tk.textDisabled,
    },
  }),
);
