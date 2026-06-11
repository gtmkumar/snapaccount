/**
 * ImsDeemedChip — days-until-deemed-acceptance countdown chip.
 * Spec: docs/design/ims-inbox-spec.md §4 (IMS-specific DueDateChip thresholds).
 *
 * Rules:
 * - Suppressed entirely for explicitly actioned terminal rows
 *   (ACCEPTED without deemedAccepted, REJECTED).
 * - "Deemed accepted" (info) once the window has passed or the sweep ran.
 * - daysLeft ≤ 0 → "Due today" (error); 1–3 → error; 4–7 → warning; >7 → neutral.
 * - Never colour-only: icon + text always (a11y 1.4.1).
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../contexts/ThemeContext';
import type { ImsInvoiceStatus } from '../../api/gstIms';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

interface Props {
  status: ImsInvoiceStatus;
  deemedAccepted: boolean;
  gstr2bGenerationPast: boolean;
  /** Whole days until the GSTR-2B generation deadline (IST). */
  daysLeft: number;
  testID?: string;
}

export function ImsDeemedChip({
  status,
  deemedAccepted,
  gstr2bGenerationPast,
  daysLeft,
  testID,
}: Props) {
  const { t } = useTranslation();
  const { tokens } = useTheme();

  // Swept rows keep the "Deemed accepted" explanation chip.
  if (gstr2bGenerationPast || deemedAccepted) {
    return (
      <View
        style={[styles.chip, { backgroundColor: tokens.infoTint }]}
        accessibilityLabel={t('mobile.gst.ims.deadline.deemedA11y')}
        testID={testID}
      >
        <Ionicons name="checkmark-circle" size={11} color={tokens.infoFg} />
        <Text style={[styles.text, { color: tokens.infoFg }]}>
          {t('mobile.gst.ims.status.deemed')}
        </Text>
      </View>
    );
  }

  // Countdown only matters for still-actionable rows — settled rows show status only.
  if (status === 'ACCEPTED' || status === 'REJECTED') return null;

  let bg: string;
  let fg: string;
  let icon: IoniconName;
  let label: string;
  let a11yLabel: string;

  if (daysLeft <= 0) {
    bg = tokens.errorTint;
    fg = tokens.errorFg;
    icon = 'alert-circle';
    label = t('mobile.gst.ims.deadline.dueToday');
    a11yLabel = t('mobile.gst.ims.deadline.dueTodayA11y');
  } else {
    label = t('mobile.gst.ims.deadline.inDays', { count: daysLeft });
    a11yLabel = t('mobile.gst.ims.deadline.a11y', { count: daysLeft });
    icon = 'time-outline';
    if (daysLeft <= 3) {
      bg = tokens.errorTint;
      fg = tokens.errorFg;
    } else if (daysLeft <= 7) {
      bg = tokens.warningTint;
      fg = tokens.warningFg;
    } else {
      bg = tokens.sunken;
      fg = tokens.textSecondary;
    }
  }

  return (
    <View
      style={[styles.chip, { backgroundColor: bg }]}
      accessible
      accessibilityLabel={a11yLabel}
      testID={testID}
    >
      <Ionicons name={icon} size={11} color={fg} />
      <Text style={[styles.text, { color: fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 11,
    fontWeight: '600',
  },
});
