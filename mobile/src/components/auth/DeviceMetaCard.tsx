/**
 * DeviceMetaCard — NEW-device metadata card (Wave 7A / GAP-047).
 * Shown on the OLD device's approval screen and echoed on the NEW device's
 * waiting screen. Location is IP-derived and explicitly labeled "Approximate
 * location" (a11y: never imply precise tracking).
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { formatIstDateTime } from '../../lib/ist';

interface DeviceMetaCardProps {
  model?: string | null;
  os?: string | null;
  cityApprox?: string | null;
  /** Sign-in attempt time, UTC ISO — rendered DD/MM/YYYY HH:mm IST. */
  time?: string | null;
  testID?: string;
}

export function DeviceMetaCard({
  model,
  os,
  cityApprox,
  time,
  testID = 'device-meta-card',
}: DeviceMetaCardProps) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();

  const modelLine = [model, os].filter(Boolean).join(' · ');

  const rows: {
    icon: React.ComponentProps<typeof Ionicons>['name'];
    label: string;
    value: string;
  }[] = [
    {
      icon: 'phone-portrait-outline',
      label: t('mobile.device.meta.model'),
      value: modelLine || t('mobile.device.meta.unknown'),
    },
    {
      icon: 'location-outline',
      label: t('mobile.device.meta.location'),
      value: cityApprox || t('mobile.device.meta.unknown'),
    },
    {
      icon: 'time-outline',
      label: t('mobile.device.meta.time'),
      value: time ? `${formatIstDateTime(time)} IST` : t('mobile.device.meta.unknown'),
    },
  ];

  return (
    <View style={styles.card} testID={testID}>
      {rows.map((row) => (
        <View
          key={row.label}
          style={styles.row}
          accessible
          accessibilityLabel={`${row.label}: ${row.value}`}
        >
          <Ionicons name={row.icon} size={18} color={tokens.textSecondary} />
          <Text style={styles.label}>{row.label}</Text>
          <Text style={styles.value} numberOfLines={2}>
            {row.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
    card: {
      backgroundColor: tk.raised,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: tk.border,
      padding: 16,
      gap: 14,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    label: {
      fontSize: 13,
      color: tk.textSecondary,
      flexShrink: 0,
    },
    value: {
      flex: 1,
      fontSize: 13,
      fontWeight: '600',
      color: tk.textPrimary,
      textAlign: 'right',
    },
  }),
);
