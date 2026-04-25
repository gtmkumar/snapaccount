/**
 * CelebrationOverlay — Full-screen celebration for APPROVED / DISBURSED status transitions.
 * Phase 6C — docs/design/component-library.md addendum
 * Phase 6F: generic reuse pattern (same API, different copy).
 *
 * Respects reduceMotion: if enabled, renders simple fade-in without confetti.
 * Auto-dismisses after 6s if no interaction.
 */

import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Colors } from '../../constants/colors';

/**
 * Phase 6F: expanded kind enum.
 * Legacy kinds 'APPROVED'|'DISBURSED' preserved for backward compat (Phase 6C).
 * New kinds: firstGst, firstRefund, firstItr, firstNoticeResolved,
 *            planK2Step15, firstChatResolved, custom.
 */
export type CelebrationKind =
  | 'APPROVED'
  | 'DISBURSED'
  | 'firstGst'
  | 'firstRefund'
  | 'firstItr'
  | 'firstNoticeResolved'
  | 'planK2Step15'
  | 'firstChatResolved'
  | 'custom';

interface CelebrationOverlayProps {
  kind: CelebrationKind;
  bankName?: string;
  amount?: number;
  rate?: number;
  acctMask?: string;
  date?: string;
  /** For firstGst: filing period */
  period?: string;
  /** For firstGst: acknowledgment number */
  ack?: string;
  /** For firstChatResolved: thread count */
  count?: number;
  /** For firstItr: assessment year */
  ay?: string;
  /** For custom kind: caller-provided copy */
  customHeadline?: string;
  customSubline?: string;
  onPrimary: () => void;
  onSecondary?: () => void;
  testID?: string;
}

function formatIndianAmount(n: number): string {
  if (n >= 10_000_000) return `${(n / 10_000_000).toFixed(2)} Cr`;
  if (n >= 100_000) return `${(n / 100_000).toFixed(2)} L`;
  return n.toLocaleString('en-IN');
}

// ─── helpers ──────────────────────────────────────────────────────────────────

const KIND_ICON: Record<CelebrationKind, React.ComponentProps<typeof Ionicons>['name']> = {
  APPROVED: 'checkmark-circle',
  DISBURSED: 'cash',
  firstGst: 'receipt-outline',
  firstRefund: 'wallet-outline',
  firstItr: 'document-text-outline',
  firstNoticeResolved: 'shield-checkmark-outline',
  planK2Step15: 'sparkles-outline',
  firstChatResolved: 'chatbubble-ellipses-outline',
  custom: 'star-outline',
};

// ─────────────────────────────────────────────────────────────────────────────

export function CelebrationOverlay({
  kind,
  bankName = '',
  amount = 0,
  rate,
  acctMask = 'XXXX',
  date = '',
  period = '',
  ack = '',
  count = 0,
  ay = '',
  customHeadline,
  customSubline,
  onPrimary,
  onSecondary,
  testID,
}: CelebrationOverlayProps) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const slideAnim = useRef(new Animated.Value(reduceMotion ? 0 : 60)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: reduceMotion ? 0 : 350,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: reduceMotion ? 0 : 300,
        useNativeDriver: true,
      }),
    ]).start();

    // Auto-dismiss after 6s
    timerRef.current = setTimeout(() => {
      onSecondary?.() ?? onPrimary();
    }, 6000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Resolve copy per kind ──────────────────────────────────────────────────
  type CopyMap = { headline: string; body: string; primary: string; secondary?: string };

  const copy: CopyMap = (() => {
    switch (kind) {
      case 'APPROVED':
        return {
          headline: t('mobile.loan.status.celebrate.approved.title'),
          body: t('mobile.loan.status.celebrate.approved.body', {
            bank: bankName,
            amount: formatIndianAmount(amount),
            rate: rate ?? 0,
          }),
          primary: t('mobile.loan.status.celebrate.approved.cta.viewTerms'),
          secondary: t('mobile.loan.status.celebrate.approved.cta.continue'),
        };
      case 'DISBURSED':
        return {
          headline: t('mobile.loan.status.celebrate.disbursed.title'),
          body: t('mobile.loan.status.celebrate.disbursed.body', {
            amount: formatIndianAmount(amount),
            acctMask,
            date,
          }),
          primary: t('mobile.loan.status.celebrate.disbursed.cta.proof'),
        };
      case 'firstGst':
        return {
          headline: t('celebration.firstGst.headline'),
          body: t('celebration.firstGst.subline', { period, ack }),
          primary: t('celebration.firstGst.cta.primary'),
          secondary: t('celebration.cta.secondary'),
        };
      case 'firstRefund':
        return {
          headline: t('celebration.firstRefund.headline'),
          body: t('celebration.firstRefund.subline', {
            amount: formatIndianAmount(amount),
            date,
          }),
          primary: t('celebration.firstRefund.cta.primary'),
          secondary: t('celebration.cta.secondary'),
        };
      case 'firstItr':
        return {
          headline: t('celebration.firstItr.headline'),
          body: t('celebration.firstItr.subline', { ay }),
          primary: t('celebration.firstItr.cta.primary'),
          secondary: t('celebration.cta.secondary'),
        };
      case 'firstNoticeResolved':
        return {
          headline: t('celebration.firstNoticeResolved.headline'),
          body: t('celebration.firstNoticeResolved.subline'),
          primary: t('celebration.firstNoticeResolved.cta.primary'),
          secondary: t('celebration.cta.secondary'),
        };
      case 'planK2Step15':
        return {
          headline: t('celebration.planK2Step15.headline'),
          body: t('celebration.planK2Step15.subline'),
          primary: t('celebration.planK2Step15.cta.primary'),
          secondary: t('celebration.cta.secondary'),
        };
      case 'firstChatResolved':
        return {
          headline: t('celebration.firstChatResolved.headline'),
          body: t('celebration.firstChatResolved.subline', { count }),
          primary: t('celebration.firstChatResolved.cta.primary'),
          secondary: t('celebration.cta.secondary'),
        };
      case 'custom':
      default:
        return {
          headline: customHeadline ?? t('celebration.custom.headline'),
          body: customSubline ?? '',
          primary: t('celebration.custom.cta.primary'),
        };
    }
  })();

  const iconName = KIND_ICON[kind];
  const iconColor = Colors.success[500];
  const headline = copy.headline;
  const body = copy.body;
  const primaryLabel = copy.primary;
  const secondaryLabel = copy.secondary;

  return (
    <Animated.View
      testID={testID}
      style={[
        styles.overlay,
        { opacity: opacityAnim, transform: [{ translateY: slideAnim }] },
      ]}
      accessibilityViewIsModal
    >
      <View style={styles.content}>
        <View style={[styles.iconCircle, { backgroundColor: iconColor + '20' }]}>
          <Ionicons name={iconName} size={48} color={iconColor} />
        </View>
        <Text
          style={styles.headline}
          accessibilityRole="header"
        >
          {headline}
        </Text>
        <Text style={styles.body}>{body}</Text>

        <View style={styles.actions}>
          <Pressable
            style={styles.primaryBtn}
            onPress={onPrimary}
            accessibilityRole="button"
            accessibilityLabel={primaryLabel}
          >
            <Text style={styles.primaryBtnText}>{primaryLabel}</Text>
          </Pressable>

          {secondaryLabel && (
            <Pressable
              style={styles.secondaryBtn}
              onPress={onSecondary}
              accessibilityRole="button"
              accessibilityLabel={secondaryLabel}
            >
              <Text style={styles.secondaryBtnText}>{secondaryLabel}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    padding: 24,
  },
  content: {
    backgroundColor: Colors.surface.default,
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    width: '100%',
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 12,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headline: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.neutral[900],
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  body: {
    fontSize: 15,
    color: Colors.neutral[600],
    textAlign: 'center',
    lineHeight: 22,
  },
  actions: {
    width: '100%',
    gap: 10,
    marginTop: 8,
  },
  primaryBtn: {
    backgroundColor: Colors.success[600],
    borderRadius: 14,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  secondaryBtn: {
    borderRadius: 14,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.neutral[500],
  },
});
