/**
 * NoticeFormTypeBadge — statutory GST notice form-type badge (Wave 7B / GAP-108).
 * component-library.md "Wave 7 Additions" — map-only, no new tokens.
 *
 * Label = form code verbatim (ASMT-10 …) — never relabeled; the plain-language
 * meaning lives in the accessible name (+ optional meaning line in detail).
 * Severity is never colour-only: each variant also carries an icon.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import type { GstNoticeFormType } from '../../api/gst';

interface FormTypeVisual {
  /** Verbatim statutory code. */
  code: string;
  i18nKey: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  variant: 'warning' | 'error' | 'accent' | 'info';
}

// OTHER (server default) intentionally has no statutory badge — callers fall
// back to the legacy free-text type chip.
export const FORM_TYPE_MAP: Partial<Record<GstNoticeFormType, FormTypeVisual>> = {
  ASMT_10: { code: 'ASMT-10', i18nKey: 'mobile.gst.formType.asmt10', icon: 'search-outline', variant: 'warning' },
  DRC_01: { code: 'DRC-01', i18nKey: 'mobile.gst.formType.drc01', icon: 'alert-circle-outline', variant: 'error' },
  DRC_01A: { code: 'DRC-01A', i18nKey: 'mobile.gst.formType.drc01a', icon: 'warning-outline', variant: 'warning' },
  DRC_01B: { code: 'DRC-01B', i18nKey: 'mobile.gst.formType.drc01b', icon: 'git-compare-outline', variant: 'accent' },
  DRC_01C: { code: 'DRC-01C', i18nKey: 'mobile.gst.formType.drc01c', icon: 'git-compare-outline', variant: 'accent' },
  ADT_01: { code: 'ADT-01', i18nKey: 'mobile.gst.formType.adt01', icon: 'clipboard-outline', variant: 'info' },
};

function variantColors(variant: FormTypeVisual['variant'], tk: ThemeTokens) {
  switch (variant) {
    case 'warning':
      return { bg: tk.warningTint, fg: tk.warningFg };
    case 'error':
      return { bg: tk.errorTint, fg: tk.errorFg };
    case 'accent':
      return { bg: tk.brandTint, fg: tk.brandFg };
    case 'info':
      return { bg: tk.infoTint, fg: tk.infoFg };
  }
}

interface NoticeFormTypeBadgeProps {
  formType: GstNoticeFormType;
  /** Detail view: also render the plain-language meaning below the code. */
  showMeaning?: boolean;
  testID?: string;
}

export function NoticeFormTypeBadge({
  formType,
  showMeaning = false,
  testID,
}: NoticeFormTypeBadgeProps) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const visual = FORM_TYPE_MAP[formType];
  if (!visual) return null;

  const meaning = t(`${visual.i18nKey}.meaning`);
  const colors = variantColors(visual.variant, tokens);

  return (
    <View
      style={styles.wrap}
      accessible
      // A11y: code + plain meaning ("DRC-01B, ITC mismatch notice").
      accessibilityLabel={`${visual.code}, ${meaning}`}
      testID={testID ?? `form-type-badge-${formType}`}
    >
      <View style={[styles.badge, { backgroundColor: colors.bg }]}>
        <Ionicons name={visual.icon} size={12} color={colors.fg} />
        <Text style={[styles.code, { color: colors.fg }]}>{visual.code}</Text>
      </View>
      {showMeaning ? <Text style={styles.meaning}>{meaning}</Text> : null}
    </View>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
    wrap: { gap: 4, alignItems: 'flex-start' },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
      minWidth: 64,
      justifyContent: 'center',
    },
    code: {
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.3,
    },
    meaning: {
      fontSize: 12,
      color: tk.textSecondary,
      lineHeight: 17,
      flexShrink: 1,
    },
  }),
);
