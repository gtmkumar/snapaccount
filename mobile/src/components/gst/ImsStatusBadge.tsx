/**
 * ImsStatusBadge / Gstr1aStatusBadge — IMS + GSTR-1A status maps.
 * Spec: docs/design/ims-inbox-spec.md §8; component-library.md
 * "Phase 7 — GSTN IMS Additions".
 *
 * Always icon + text, never colour-only (a11y 1.4.1). Tint pairs come from
 * ThemeContext (validated ≥4.5:1 in both light and dark).
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, type ThemeTokens } from '../../contexts/ThemeContext';
import type { Gstr1aStatus, ImsInvoiceStatus } from '../../api/gstIms';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

interface BadgeVisual {
  bg: string;
  fg: string;
  icon: IoniconName;
  labelKey: string;
}

function imsConfig(tk: ThemeTokens): Record<ImsInvoiceStatus, BadgeVisual> {
  return {
    PENDING: {
      bg: tk.warningTint,
      fg: tk.warningFg,
      icon: 'time-outline',
      labelKey: 'mobile.gst.ims.status.PENDING',
    },
    ACCEPTED: {
      bg: tk.successTint,
      fg: tk.successFg, // success[700]-equivalent foreground (a11y §4 rule 3)
      icon: 'checkmark-circle',
      labelKey: 'mobile.gst.ims.status.ACCEPTED',
    },
    REJECTED: {
      bg: tk.errorTint,
      fg: tk.errorFg,
      icon: 'close-circle',
      labelKey: 'mobile.gst.ims.status.REJECTED',
    },
    PENDING_KEPT: {
      bg: tk.infoTint,
      fg: tk.infoFg,
      icon: 'pause-circle',
      labelKey: 'mobile.gst.ims.status.PENDING_KEPT',
    },
  };
}

function gstr1aConfig(tk: ThemeTokens): Record<Gstr1aStatus, BadgeVisual> {
  return {
    DRAFT: {
      bg: tk.sunken,
      fg: tk.textSecondary,
      icon: 'create-outline',
      labelKey: 'mobile.gst.gstr1a.status.DRAFT',
    },
    SUBMITTED: {
      bg: tk.infoTint,
      fg: tk.infoFg,
      icon: 'send',
      labelKey: 'mobile.gst.gstr1a.status.SUBMITTED',
    },
    FILED: {
      bg: tk.successTint,
      fg: tk.successFg,
      icon: 'checkmark-circle',
      labelKey: 'mobile.gst.gstr1a.status.FILED',
    },
  };
}

interface ImsStatusBadgeProps {
  status: ImsInvoiceStatus;
  /** Appends a muted "Deemed" tag beside the ACCEPTED badge. */
  deemedAccepted?: boolean;
  testID?: string;
}

export function ImsStatusBadge({ status, deemedAccepted, testID }: ImsStatusBadgeProps) {
  const { t } = useTranslation();
  const { tokens } = useTheme();
  const config = imsConfig(tokens)[status];
  if (!config) return null;

  const label = t(config.labelKey);

  return (
    <View style={styles.row} testID={testID}>
      <View
        style={[styles.badge, { backgroundColor: config.bg }]}
        accessibilityLabel={label}
      >
        <Ionicons name={config.icon} size={12} color={config.fg} />
        <Text style={[styles.label, { color: config.fg }]}>{label}</Text>
      </View>
      {status === 'ACCEPTED' && deemedAccepted ? (
        <View
          style={[styles.badge, styles.deemedTag, { backgroundColor: tokens.sunken }]}
          accessibilityLabel={t('mobile.gst.ims.status.deemed')}
          testID={testID ? `${testID}-deemed` : undefined}
        >
          <Text style={[styles.label, { color: tokens.textSecondary }]}>
            {t('mobile.gst.ims.status.deemed')}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

interface Gstr1aStatusBadgeProps {
  status: Gstr1aStatus;
  testID?: string;
}

export function Gstr1aStatusBadge({ status, testID }: Gstr1aStatusBadgeProps) {
  const { t } = useTranslation();
  const { tokens } = useTheme();
  const config = gstr1aConfig(tokens)[status];
  if (!config) return null;

  const label = t(config.labelKey);

  return (
    <View
      style={[styles.badge, { backgroundColor: config.bg }]}
      accessibilityLabel={label}
      testID={testID}
    >
      <Ionicons name={config.icon} size={12} color={config.fg} />
      <Text style={[styles.label, { color: config.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  deemedTag: {
    paddingHorizontal: 6,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
