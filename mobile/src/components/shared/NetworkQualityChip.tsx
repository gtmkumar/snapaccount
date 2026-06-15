/**
 * NetworkQualityChip — shows amber "Slow connection" or "Offline" pill in TopBar.
 * Phase 6F · Track F4 · docs/design/mobile/ux/network-aware-ux.md §3
 *
 * - Hidden when connection is Good/Excellent.
 * - "Slow connection" shown when downlink < 1Mbps for > 5s.
 * - "Offline" shown when isInternetReachable === false.
 * - Tap opens NetworkSheet (basic summary — full sheet is Phase 7).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Pressable,
  StyleSheet,
  Text,
} from 'react-native';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Quality = 'good' | 'slow' | 'offline' | 'cellular-paused';

const SLOW_THRESHOLD_KBPS = 100; // < 100kbps shows chip (spec: < 1Mbps; using 100kbps per task description)
const SLOW_DURATION_MS = 5_000; // must persist 5s before showing

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  testID?: string;
}

export function NetworkQualityChip({ testID }: Props) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const [quality, setQuality] = useState<Quality>('good');
  const slowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [opacityAnim] = useState(() => new Animated.Value(0));
  const prevQuality = useRef<Quality>('good');

  const deriveQuality = useCallback((state: NetInfoState): Quality => {
    if (!state.isInternetReachable) return 'offline';
    const downlink = state.details
      ? (state.details as unknown as Record<string, unknown>).downlink
      : undefined;
    const downlinkKbps =
      typeof downlink === 'number' ? downlink * 1000 : undefined;
    if (downlinkKbps !== undefined && downlinkKbps < SLOW_THRESHOLD_KBPS) {
      return 'slow';
    }
    // Effective type (3g or slower)
    const effectiveType =
      state.type === 'cellular'
        ? (state.details as unknown as Record<string, unknown> | null)?.effectiveType
        : undefined;
    if (effectiveType === '2g' || effectiveType === '3g') {
      return 'slow';
    }
    return 'good';
  }, []);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const derived = deriveQuality(state);

      if (derived === 'slow') {
        // Only show chip after sustained slow for SLOW_DURATION_MS
        if (prevQuality.current !== 'slow') {
          if (slowTimer.current) clearTimeout(slowTimer.current);
          slowTimer.current = setTimeout(() => {
            setQuality('slow');
            prevQuality.current = 'slow';
          }, SLOW_DURATION_MS);
        }
      } else {
        // Clear pending slow timer if connection improves
        if (slowTimer.current) {
          clearTimeout(slowTimer.current);
          slowTimer.current = null;
        }
        setQuality(derived);
        prevQuality.current = derived;
      }
    });

    return () => {
      unsubscribe();
      if (slowTimer.current) clearTimeout(slowTimer.current);
    };
  }, [deriveQuality]);

  // Animate chip in/out
  useEffect(() => {
    const visible = quality !== 'good';
    Animated.timing(opacityAnim, {
      toValue: visible ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [quality, opacityAnim]);

  const handlePress = useCallback(() => {
    // NetworkSheet (full implementation Phase 7); for now show basic alert
    Alert.alert(
      t('net.sheet.title'),
      quality === 'offline'
        ? t('net.quality.offline')
        : t('net.quality.slow'),
    );
  }, [t, quality]);

  if (quality === 'good') return null;

  const isOffline = quality === 'offline';
  const label = isOffline
    ? t('net.quality.offline')
    : t('net.quality.slow');
  const iconName: React.ComponentProps<typeof Ionicons>['name'] = isOffline
    ? 'cloud-offline-outline'
    : 'wifi-outline';
  const chipColor = isOffline ? tokens.textTertiary : tokens.warningFg;
  const chipBg = isOffline ? tokens.sunken : tokens.warningTint;

  return (
    <Animated.View style={{ opacity: opacityAnim }}>
      <Pressable
        testID={testID ?? 'network-quality-chip'}
        style={[styles.chip, { backgroundColor: chipBg }]}
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={t('net.chip.accessibilityLabel', {
          quality: label,
          defaultValue: `${label}, double-tap for details`,
        })}
      >
        <Ionicons name={iconName} size={12} color={chipColor} />
        <Text style={[styles.label, { color: chipColor }]}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

const useStyles = createThemedStyles((_tk: ThemeTokens) =>
  StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 100,
    minHeight: 24,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  }),
);
