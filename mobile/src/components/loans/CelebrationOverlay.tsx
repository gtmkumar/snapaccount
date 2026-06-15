/**
 * CelebrationOverlay — Full-screen celebration for APPROVED / DISBURSED status transitions.
 * Phase 6C — docs/design/component-library.md addendum
 * Phase 6F: generic reuse pattern (same API, different copy).
 *
 * Respects reduceMotion: if enabled, renders simple fade-in without confetti.
 * Auto-dismisses after 6s if no interaction.
 *
 * P6-QA-MOBILE-10: "first …" kinds are server-guarded — on mount we POST
 * /notifications/celebrations/{kind}/fire (idempotent per user × kind). If the
 * server says alreadyFired, the overlay dismisses itself without showing, so a
 * celebration can never replay across devices/sessions. Network failure is
 * fail-open (celebrating twice beats never celebrating).
 *
 * P6-QA-MOBILE-11: dismissal fires exactly ONE callback exactly once (the old
 * `onSecondary?.() ?? onPrimary()` fell through to onPrimary because a void
 * call returns undefined).
 */

import React, { useEffect, useRef, useState } from 'react';
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
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { useHaptics } from '../../hooks/useHaptics';
import { fireCelebration, type ServerCelebrationKind } from '../../api/notifications';

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

/**
 * P6-QA-MOBILE-10: kinds with a backend fired-once record. Kinds not listed
 * here (APPROVED, custom, …) are event-driven by the parent screen and show
 * unconditionally.
 */
const SERVER_GUARDED_KINDS: Partial<Record<CelebrationKind, ServerCelebrationKind>> = {
  DISBURSED: 'first_loan_disbursed',
  firstGst: 'first_gst_filed',
  firstRefund: 'first_refund_credited',
  firstItr: 'first_itr_filed',
};

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
  const { tokens } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const haptics = useHaptics();
  const [slideAnim] = useState(() => new Animated.Value(reduceMotion ? 0 : 60));
  const [opacityAnim] = useState(() => new Animated.Value(0));
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // P6-QA-MOBILE-10: server fire-guard. Guarded kinds stay hidden ('pending')
  // until the idempotent fire call answers; alreadyFired → 'skipped' (dismiss
  // without showing). Unguarded kinds show immediately.
  const serverKind = SERVER_GUARDED_KINDS[kind];
  const [gate, setGate] = useState<'pending' | 'visible' | 'skipped'>(
    serverKind ? 'pending' : 'visible',
  );

  // P6-QA-MOBILE-11: every dismissal path funnels through here — exactly one
  // callback, exactly once (auto-dismiss timer vs button press can race).
  const dismissedRef = useRef(false);
  const dismissOnce = (cb: (() => void) | undefined) => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    (cb ?? onPrimary)();
  };

  useEffect(() => {
    if (!serverKind) return;
    let active = true;
    fireCelebration(serverKind)
      .then((res) => {
        if (!active) return;
        if (res.alreadyFired) {
          // Already celebrated on this or another device — dismiss silently so
          // the parent clears its overlay state.
          setGate('skipped');
          dismissOnce(onSecondary);
        } else {
          setGate('visible');
        }
      })
      .catch(() => {
        // Fail-open: a network blip must not swallow the user's milestone.
        if (active) setGate('visible');
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (gate !== 'visible') return;
    // §3.4: one-shot celebration burst — shortened to a single Success
    // notification under reduce-motion. Haptics are additive feedback only.
    haptics.celebrationBurst(reduceMotion);
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

    // Auto-dismiss after 6s — exactly one callback (P6-QA-MOBILE-11).
    timerRef.current = setTimeout(() => {
      dismissOnce(onSecondary);
    }, 6000);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gate]);

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
          headline: t('mobile.celebration.firstGst.headline'),
          body: t('mobile.celebration.firstGst.subline', { period, ack }),
          primary: t('mobile.celebration.firstGst.cta.primary'),
          secondary: t('mobile.celebration.cta.secondary'),
        };
      case 'firstRefund':
        return {
          headline: t('mobile.celebration.firstRefund.headline'),
          body: t('mobile.celebration.firstRefund.subline', {
            amount: formatIndianAmount(amount),
            date,
          }),
          primary: t('mobile.celebration.firstRefund.cta.primary'),
          secondary: t('mobile.celebration.cta.secondary'),
        };
      case 'firstItr':
        return {
          headline: t('mobile.celebration.firstItr.headline'),
          body: t('mobile.celebration.firstItr.subline', { ay }),
          primary: t('mobile.celebration.firstItr.cta.primary'),
          secondary: t('mobile.celebration.cta.secondary'),
        };
      case 'firstNoticeResolved':
        return {
          headline: t('mobile.celebration.firstNoticeResolved.headline'),
          body: t('mobile.celebration.firstNoticeResolved.subline'),
          primary: t('mobile.celebration.firstNoticeResolved.cta.primary'),
          secondary: t('mobile.celebration.cta.secondary'),
        };
      case 'planK2Step15':
        return {
          headline: t('mobile.celebration.planK2Step15.headline'),
          body: t('mobile.celebration.planK2Step15.subline'),
          primary: t('mobile.celebration.planK2Step15.cta.primary'),
          secondary: t('mobile.celebration.cta.secondary'),
        };
      case 'firstChatResolved':
        return {
          headline: t('mobile.celebration.firstChatResolved.headline'),
          body: t('mobile.celebration.firstChatResolved.subline', { count }),
          primary: t('mobile.celebration.firstChatResolved.cta.primary'),
          secondary: t('mobile.celebration.cta.secondary'),
        };
      case 'custom':
      default:
        return {
          headline: customHeadline ?? t('mobile.celebration.custom.headline'),
          body: customSubline ?? '',
          primary: t('mobile.celebration.custom.cta.primary'),
        };
    }
  })();

  const iconName = KIND_ICON[kind];
  const iconColor = tokens.successFg;
  const headline = copy.headline;
  const body = copy.body;
  const primaryLabel = copy.primary;
  const secondaryLabel = copy.secondary;

  // P6-QA-MOBILE-10: nothing renders until the server guard clears (or for
  // unguarded kinds, immediately).
  if (gate !== 'visible') return null;

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
            onPress={() => dismissOnce(onPrimary)}
            accessibilityRole="button"
            accessibilityLabel={primaryLabel}
          >
            <Text style={styles.primaryBtnText}>{primaryLabel}</Text>
          </Pressable>

          {secondaryLabel && (
            <Pressable
              style={styles.secondaryBtn}
              onPress={() => dismissOnce(onSecondary)}
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

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15,23,42,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    padding: 24,
  },
  content: {
    backgroundColor: tk.raised,
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
    color: tk.textPrimary,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  body: {
    fontSize: 15,
    color: tk.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  actions: {
    width: '100%',
    gap: 10,
    marginTop: 8,
  },
  primaryBtn: {
    backgroundColor: tk.successFg,
    borderRadius: 14,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: tk.textOnBrand,
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
    color: tk.textSecondary,
  },
  }),
);
