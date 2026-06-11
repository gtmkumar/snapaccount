/**
 * ApprovalCountdown — live mm:ss countdown for the 10-minute device-approval
 * window (Wave 7A / GAP-047). The day-based CountdownCard is unsuitable for a
 * minutes-scale window, so this is a dedicated small composite.
 *
 * A11y: announces at milestones only (2:00, 1:00, expiry) — not every second
 * (avoid AT spam, spec §4.6). Warn styling ≤2 minutes.
 */

import React, { useEffect, useRef } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { useNowMs } from '../../hooks/useNowMs';
import { formatMmSs } from '../../lib/ist';

const WARN_THRESHOLD_MS = 2 * 60 * 1000;

interface ApprovalCountdownProps {
  /** Window end, UTC ISO. */
  expiresAt: string;
  /** Called once when the countdown crosses zero. */
  onExpire?: () => void;
  testID?: string;
}

export function ApprovalCountdown({
  expiresAt,
  onExpire,
  testID = 'approval-countdown',
}: ApprovalCountdownProps) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const nowMs = useNowMs(1000);

  const remaining = new Date(expiresAt).getTime() - nowMs;
  const expired = remaining <= 0;
  const warn = !expired && remaining <= WARN_THRESHOLD_MS;
  const label = expired
    ? t('mobile.device.countdown.expired')
    : t('mobile.device.countdown.expiresIn', { time: formatMmSs(remaining) });

  // Milestone announcements + single onExpire dispatch.
  const announcedRef = useRef<{ two: boolean; one: boolean; expired: boolean }>({
    two: false,
    one: false,
    expired: false,
  });
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    const flags = announcedRef.current;
    if (remaining <= 0 && !flags.expired) {
      flags.expired = true;
      AccessibilityInfo.announceForAccessibility(t('mobile.device.countdown.expired'));
      onExpireRef.current?.();
    } else if (remaining > 0 && remaining <= 60_000 && !flags.one) {
      flags.one = true;
      AccessibilityInfo.announceForAccessibility(
        t('mobile.device.countdown.milestone', { time: '1:00' }),
      );
    } else if (remaining > 60_000 && remaining <= WARN_THRESHOLD_MS && !flags.two) {
      flags.two = true;
      AccessibilityInfo.announceForAccessibility(
        t('mobile.device.countdown.milestone', { time: '2:00' }),
      );
    }
  }, [remaining, t]);

  return (
    <View
      style={[
        styles.card,
        warn && styles.cardWarn,
        expired && styles.cardExpired,
      ]}
      accessible
      accessibilityLabel={label}
      testID={testID}
    >
      <Ionicons
        name={expired ? 'alert-circle' : 'timer-outline'}
        size={18}
        color={expired ? tokens.errorFg : warn ? tokens.warningFg : tokens.brandFg}
      />
      <Text
        style={[
          styles.text,
          warn && styles.textWarn,
          expired && styles.textExpired,
        ]}
        testID={`${testID}-label`}
      >
        {label}
      </Text>
    </View>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: tk.brandTint,
      borderColor: tk.brandTintBorder,
      borderWidth: 1,
      borderRadius: 12,
      minHeight: 44,
      paddingHorizontal: 16,
    },
    cardWarn: {
      backgroundColor: tk.warningTint,
      borderColor: tk.warningTintBorder,
    },
    cardExpired: {
      backgroundColor: tk.errorTint,
      borderColor: tk.errorTintBorder,
    },
    text: {
      fontSize: 15,
      fontWeight: '700',
      color: tk.brandFg,
      fontVariant: ['tabular-nums'],
    },
    textWarn: { color: tk.warningFg },
    textExpired: { color: tk.errorFg },
  }),
);
