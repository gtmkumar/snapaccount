/**
 * ScrollHintBanner — Floating chip shown when user has not scrolled to bottom of consent doc.
 * Fades out once the user reaches the bottom (controlled externally via visible prop).
 * Phase 6C — docs/design/component-library.md addendum
 */

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Colors } from '../../constants/colors';

interface ScrollHintBannerProps {
  visible: boolean;
  testID?: string;
}

export function ScrollHintBanner({ visible, testID }: ScrollHintBannerProps) {
  const { t } = useTranslation();
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;

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
      <Ionicons name="arrow-down-circle" size={16} color={Colors.neutral[600]} />
      <Text style={styles.text}>{t('mobile.loan.consent.scrollHint')}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'center',
    backgroundColor: Colors.neutral[800],
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 8,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
