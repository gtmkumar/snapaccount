/**
 * ListStates — house-standard loading / empty / error states for data screens.
 * design-elevation-spec §3.1 (shaped skeletons), §3.2 (designed empty states),
 * §3.6 (recoverable error states). Board #26 · slice S3-mobile.
 *
 * Reference implementation: the IMS screens (src/screens/gst/Ims*).
 *
 * - ListSkeleton: shaped placeholder (card or row silhouettes) with a gentle
 *   shimmer that is DISABLED under reduce-motion (a11y 2.3.3 — static
 *   placeholder instead).
 * - EmptyState: icon + headline + guidance + optional primary CTA. Supports
 *   the filtered-empty variant via a secondary "clear filters" action.
 * - ErrorState: recoverable + specific + announced. Icon + plain-language
 *   cause + "Try again" (≥44pt) + optional secondary escape. The container is
 *   an assertive live region (a11y 4.1.3) and fires the error haptic once on
 *   mount (§3.3 haptics map) — haptics are additive, never the only feedback.
 *
 * All copy is passed in already-translated (t() at the call site) so the
 * en/hi/bn parity rule stays enforceable per screen.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import {
  createThemedStyles,
  useTheme,
  type ThemeTokens,
} from '../../contexts/ThemeContext';
import { useHaptics } from '../../hooks/useHaptics';

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton
// ─────────────────────────────────────────────────────────────────────────────

export type SkeletonVariant = 'card' | 'row';

interface ListSkeletonProps {
  /** Number of placeholder silhouettes (default 5). */
  count?: number;
  /** 'card' = tall rounded blocks (IMS pattern); 'row' = avatar + 2 lines. */
  variant?: SkeletonVariant;
  /** Height of each card placeholder (card variant only). */
  cardHeight?: number;
  testID?: string;
}

/**
 * Shaped skeleton list. Shimmers by pulsing opacity between the two skeleton
 * tokens; under reduce-motion the placeholders render static (no animation).
 */
export function ListSkeleton({
  count = 5,
  variant = 'card',
  cardHeight = 96,
  testID = 'list-skeleton',
}: ListSkeletonProps) {
  const styles = useStyles();
  const reduceMotion = useReducedMotion();
  // Lazy useState (not useRef) — the CelebrationOverlay precedent; safe to
  // read during render under react-hooks/refs.
  const [pulse] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (reduceMotion) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.55, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduceMotion]);

  const animatedStyle = reduceMotion ? undefined : { opacity: pulse };

  return (
    <View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {Array.from({ length: count }).map((_, i) =>
        variant === 'card' ? (
          <Animated.View
            key={i}
            style={[styles.skelCard, { height: cardHeight }, animatedStyle]}
            testID={`${testID}-item`}
          />
        ) : (
          <Animated.View key={i} style={[styles.skelRow, animatedStyle]} testID={`${testID}-item`}>
            <View style={styles.skelAvatar} />
            <View style={styles.skelLines}>
              <View style={[styles.skelLine, { width: '55%' }]} />
              <View style={[styles.skelLine, styles.skelLine2, { width: '85%' }]} />
            </View>
          </Animated.View>
        ),
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────────────────────

interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  /** Module accent for the icon medallion; defaults to brand. */
  accentColor?: string;
  title: string;
  body?: string;
  ctaLabel?: string;
  onCtaPress?: () => void;
  /** Filtered-empty escape (§3.2): e.g. "Clear filters". */
  secondaryLabel?: string;
  onSecondaryPress?: () => void;
  testID?: string;
}

export function EmptyState({
  icon = 'file-tray-outline',
  accentColor,
  title,
  body,
  ctaLabel,
  onCtaPress,
  secondaryLabel,
  onSecondaryPress,
  testID = 'empty-state',
}: EmptyStateProps) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const accent = accentColor ?? tokens.brand500;

  return (
    <View style={styles.stateWrap} testID={testID}>
      <View style={[styles.stateIconWrap, { backgroundColor: accent + '15' }]}>
        <Ionicons name={icon} size={36} color={accent} />
      </View>
      <Text style={styles.stateTitle} accessibilityRole="header">
        {title}
      </Text>
      {body ? <Text style={styles.stateBody}>{body}</Text> : null}
      {ctaLabel && onCtaPress ? (
        <Pressable
          style={styles.primaryBtn}
          onPress={onCtaPress}
          accessibilityRole="button"
          accessibilityLabel={ctaLabel}
          testID={`${testID}-cta`}
        >
          <Text style={styles.primaryBtnText}>{ctaLabel}</Text>
        </Pressable>
      ) : null}
      {secondaryLabel && onSecondaryPress ? (
        <Pressable
          style={styles.secondaryBtn}
          onPress={onSecondaryPress}
          accessibilityRole="button"
          accessibilityLabel={secondaryLabel}
          testID={`${testID}-secondary`}
        >
          <Text style={styles.secondaryBtnText}>{secondaryLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Error state
// ─────────────────────────────────────────────────────────────────────────────

interface ErrorStateProps {
  /** Plain-language cause ("Couldn't load your notices."). */
  message: string;
  retryLabel: string;
  onRetry: () => void;
  /** Secondary escape (go back / get help / request a callback). */
  secondaryLabel?: string;
  onSecondaryPress?: () => void;
  testID?: string;
}

export function ErrorState({
  message,
  retryLabel,
  onRetry,
  secondaryLabel,
  onSecondaryPress,
  testID = 'error-state',
}: ErrorStateProps) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const haptics = useHaptics();
  const announced = useRef(false);

  // §3.3 haptics map: error → notification(Error). Fire once per mount.
  useEffect(() => {
    if (!announced.current) {
      announced.current = true;
      haptics.error();
    }
  }, [haptics]);

  return (
    <View
      style={styles.stateWrap}
      accessibilityLiveRegion="assertive"
      accessibilityRole="alert"
      testID={testID}
    >
      <View style={[styles.stateIconWrap, { backgroundColor: tokens.errorTint }]}>
        <Ionicons name="cloud-offline-outline" size={36} color={tokens.errorFg} />
      </View>
      <Text style={styles.stateBody}>{message}</Text>
      <Pressable
        style={styles.primaryBtn}
        onPress={onRetry}
        accessibilityRole="button"
        accessibilityLabel={retryLabel}
        testID={`${testID}-retry`}
      >
        <Text style={styles.primaryBtnText}>{retryLabel}</Text>
      </Pressable>
      {secondaryLabel && onSecondaryPress ? (
        <Pressable
          style={styles.secondaryBtn}
          onPress={onSecondaryPress}
          accessibilityRole="button"
          accessibilityLabel={secondaryLabel}
          testID={`${testID}-secondary`}
        >
          <Text style={styles.secondaryBtnText}>{secondaryLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
    // Skeleton
    skelCard: {
      backgroundColor: tk.skeleton1,
      borderRadius: 16,
      marginBottom: 12,
    },
    skelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 4,
    },
    skelAvatar: {
      width: 48,
      height: 48,
      borderRadius: 14,
      backgroundColor: tk.skeleton1,
      flexShrink: 0,
    },
    skelLines: { flex: 1 },
    skelLine: {
      height: 14,
      borderRadius: 7,
      backgroundColor: tk.skeleton1,
    },
    skelLine2: { marginTop: 6, backgroundColor: tk.skeleton2 },

    // Shared state shell
    stateWrap: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 48,
      paddingHorizontal: 24,
      gap: 12,
    },
    stateIconWrap: {
      width: 72,
      height: 72,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stateTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: tk.textPrimary,
      textAlign: 'center',
    },
    stateBody: {
      fontSize: 14,
      color: tk.textSecondary,
      textAlign: 'center',
      lineHeight: 21,
    },
    primaryBtn: {
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: 24,
      backgroundColor: tk.brandCta,
      borderRadius: 12,
      marginTop: 4,
    },
    primaryBtnText: { fontSize: 14, fontWeight: '700', color: tk.textOnBrand },
    secondaryBtn: {
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    secondaryBtnText: { fontSize: 14, fontWeight: '600', color: tk.brandFg },
  }),
);
