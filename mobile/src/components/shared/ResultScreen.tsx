/**
 * ResultScreen — Generic post-action confirmation screen component.
 * Used after nil-return filing, e-verification, etc.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';

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

const VARIANT_CONFIG: Record<
  ResultVariant,
  { iconName: React.ComponentProps<typeof Ionicons>['name']; color: string; bg: string }
> = {
  success: {
    iconName: 'checkmark-circle',
    color: Colors.success[600],
    bg: Colors.success[50],
  },
  error: {
    iconName: 'close-circle',
    color: Colors.error[600],
    bg: Colors.error[50],
  },
  info: {
    iconName: 'information-circle',
    color: Colors.brand[600],
    bg: Colors.brand[50],
  },
};

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
  const config = VARIANT_CONFIG[variant];

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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.base,
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
    color: Colors.neutral[900],
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.neutral[600],
    textAlign: 'center',
    lineHeight: 24,
  },
  detail: {
    fontSize: 13,
    color: Colors.neutral[400],
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
    backgroundColor: Colors.brand[600],
  },
  btnPrimaryText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  btnSecondary: {
    backgroundColor: Colors.neutral[100],
  },
  btnSecondaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.neutral[700],
  },
});
