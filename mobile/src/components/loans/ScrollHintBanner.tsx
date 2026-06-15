/**
 * ScrollHintBanner — Floating chip shown when user has not scrolled to bottom of consent doc.
 * Fades out once the user reaches the bottom (controlled externally via visible prop).
 * Phase 6C — docs/design/component-library.md addendum
 */

import React, { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';

interface ScrollHintBannerProps {
  visible: boolean;
  testID?: string;
}

export function ScrollHintBanner({ visible, testID }: ScrollHintBannerProps) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const [opacity] = useState(() => new Animated.Value(visible ? 1 : 0));

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [visible, opacity]);

  return (
    <Animated.View
      testID={testID}
      style={[styles.banner, { opacity }]}
      pointerEvents={visible ? 'none' : 'none'}
      accessibilityLiveRegion="polite"
    >
      <Ionicons name="arrow-down-circle" size={16} color={tokens.textSecondary} />
      <Text style={styles.text}>{t('mobile.loan.consent.scrollHint')}</Text>
    </Animated.View>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'center',
    backgroundColor: tk.textPrimary,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 8,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
    color: tk.textOnBrand,
  },
  }),
);
