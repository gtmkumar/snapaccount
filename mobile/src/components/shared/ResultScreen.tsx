/**
 * ResultScreen — Generic post-action confirmation screen component.
 * Used after nil-return filing, e-verification, etc.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';

export type ResultVariant = 'success' | 'error' | 'info';

interface ResultScreenProps {
  variant?: ResultVariant;
  title: string;
  subtitle?: string;
  detail?: string;
  primaryLabel?: string;
  secondaryLabel?: string;
  onPrimary?: () => void;
  onSecondary?: () => void;
  testID?: string;
}

const variantConfigFor = (tk: ThemeTokens): Record<
  ResultVariant,
  { iconName: React.ComponentProps<typeof Ionicons>['name']; color: string; bg: string }
> => ({
  success: {
    iconName: 'checkmark-circle',
    color: tk.successFg,
    bg: tk.successTint,
  },
  error: {
    iconName: 'close-circle',
    color: tk.errorFg,
    bg: tk.errorTint,
  },
  info: {
    iconName: 'information-circle',
    color: tk.brandCta,
    bg: tk.brandTint,
  },
});

export function ResultScreen({
  variant = 'success',
  title,
  subtitle,
  detail,
  primaryLabel,
  secondaryLabel,
  onPrimary,
  onSecondary,
  testID,
}: ResultScreenProps) {
  const styles = useStyles();
  const { tokens } = useTheme();
  const config = variantConfigFor(tokens)[variant];

  return (
    <SafeAreaView style={styles.container} testID={testID}>
      <View style={styles.body}>
        <View style={[styles.iconWrap, { backgroundColor: config.bg }]}>
          <Ionicons name={config.iconName} size={52} color={config.color} />
        </View>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      </View>

      {(primaryLabel || secondaryLabel) && (
        <View style={styles.actions}>
          {primaryLabel && onPrimary && (
            <Pressable
              style={[styles.btn, styles.btnPrimary]}
              onPress={onPrimary}
              accessibilityRole="button"
              accessibilityLabel={primaryLabel}
            >
              <Text style={styles.btnPrimaryText}>{primaryLabel}</Text>
            </Pressable>
          )}
          {secondaryLabel && onSecondary && (
            <Pressable
              style={[styles.btn, styles.btnSecondary]}
              onPress={onSecondary}
              accessibilityRole="button"
              accessibilityLabel={secondaryLabel}
            >
              <Text style={styles.btnSecondaryText}>{secondaryLabel}</Text>
            </Pressable>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tk.canvas,
    justifyContent: 'space-between',
    padding: 24,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: tk.textPrimary,
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 16,
    color: tk.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  detail: {
    fontSize: 13,
    color: tk.textTertiary,
    textAlign: 'center',
    lineHeight: 20,
  },
  actions: {
    gap: 12,
  },
  btn: {
    borderRadius: 14,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  btnPrimary: {
    backgroundColor: tk.brandCta,
  },
  btnPrimaryText: {
    fontSize: 16,
    fontWeight: '700',
    color: tk.textOnBrand,
  },
  btnSecondary: {
    backgroundColor: tk.sunken,
  },
  btnSecondaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: tk.textSecondary,
  },
  }),
);
