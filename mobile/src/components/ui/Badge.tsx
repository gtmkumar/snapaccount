/**
 * Badge and StatusBadge Components
 * Matches component-library.md §2.3 and §2.5
 */

import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import {
  createThemedStyles,
  useTheme,
  type ThemeTokens,
} from '../../contexts/ThemeContext';

// ─────────────────────────────────────────────────────────────────────────────
// Generic Badge
// ─────────────────────────────────────────────────────────────────────────────

type BadgeVariant = 'default' | 'brand' | 'success' | 'warning' | 'error' | 'info' | 'neutral';
type BadgeSize = 'sm' | 'md';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  size?: BadgeSize;
  style?: ViewStyle;
}

export function Badge({ label, variant = 'default', size = 'md', style }: BadgeProps) {
  const styles = useStyles();
  return (
    <View style={[styles.badge, styles[`badge_${variant}`], styles[`size_${size}`], style]}>
      <Text
        style={[
          styles.label,
          styles[`label_${variant}`],
          size === 'sm' && styles.label_sm,
        ]}
      >
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Status Badge — Document statuses
// ─────────────────────────────────────────────────────────────────────────────

export type DocumentStatus =
  | 'UPLOADED'
  | 'OCR_COMPLETE'
  | 'IN_REVIEW'
  | 'PROCESSED'
  | 'REJECTED';

export type GstReturnStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'FILED'
  | 'REVISION_NEEDED';

export type ItrStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'USER_APPROVED'
  | 'FILING_IN_PROGRESS'
  | 'FILED'
  | 'E_VERIFIED'
  | 'COMPLETED';

export type LoanStatus =
  | 'INITIATED'
  | 'DOCUMENTS_READY'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'ADDITIONAL_DOCS_NEEDED'
  | 'APPROVED'
  | 'DISBURSED'
  | 'REJECTED';

type AnyStatus = DocumentStatus | GstReturnStatus | ItrStatus | LoanStatus;

/** Status → themed tint pair (contrast-gated in ThemeTokenContrast.test). */
function statusConfig(tk: ThemeTokens): Record<AnyStatus, { bg: string; text: string; label: string }> {
  return {
    // Document
    UPLOADED: { bg: tk.infoTint, text: tk.infoFg, label: 'Uploaded' },
    OCR_COMPLETE: { bg: tk.brandTint, text: tk.brandFg, label: 'OCR Complete' },
    IN_REVIEW: { bg: tk.warningTint, text: tk.warningFg, label: 'In Review' },
    PROCESSED: { bg: tk.successTint, text: tk.successFg, label: 'Processed' },
    REJECTED: { bg: tk.errorTint, text: tk.errorFg, label: 'Rejected' },
    // GST
    DRAFT: { bg: tk.sunken, text: tk.textSecondary, label: 'Draft' },
    PENDING_APPROVAL: { bg: tk.warningTint, text: tk.warningFg, label: 'Pending Approval' },
    APPROVED: { bg: tk.infoTint, text: tk.infoFg, label: 'Approved' },
    FILED: { bg: tk.successTint, text: tk.successFg, label: 'Filed' },
    REVISION_NEEDED: { bg: tk.errorTint, text: tk.errorFg, label: 'Revision Needed' },
    // ITR
    USER_APPROVED: { bg: tk.infoTint, text: tk.infoFg, label: 'User Approved' },
    FILING_IN_PROGRESS: { bg: tk.brandTint, text: tk.brandFg, label: 'Filing' },
    E_VERIFIED: { bg: tk.successTint, text: tk.successFg, label: 'E-Verified' },
    COMPLETED: { bg: tk.successTint, text: tk.successFg, label: 'Completed' },
    // Loan
    INITIATED: { bg: tk.sunken, text: tk.textSecondary, label: 'Initiated' },
    DOCUMENTS_READY: { bg: tk.infoTint, text: tk.infoFg, label: 'Docs Ready' },
    SUBMITTED: { bg: tk.brandTint, text: tk.brandFg, label: 'Submitted' },
    UNDER_REVIEW: { bg: tk.warningTint, text: tk.warningFg, label: 'Under Review' },
    ADDITIONAL_DOCS_NEEDED: { bg: tk.warningTint, text: tk.warningFg, label: 'Docs Needed' },
    DISBURSED: { bg: tk.successTint, text: tk.successFg, label: 'Disbursed' },
  };
}

interface StatusBadgeProps {
  status: AnyStatus;
  size?: 'sm' | 'md' | 'lg';
}

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const { tokens } = useTheme();
  const config = statusConfig(tokens)[status];
  if (!config) return null;

  return (
    <View style={[statusStyles.badge, { backgroundColor: config.bg }]}>
      <Text
        style={[
          statusStyles.label,
          { color: config.text },
          size === 'sm' && statusStyles.label_sm,
          size === 'lg' && statusStyles.label_lg,
        ]}
      >
        {config.label.toUpperCase()}
      </Text>
    </View>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
    badge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 4,
      alignSelf: 'flex-start',
    },
    size_sm: {
      paddingHorizontal: 6,
      paddingVertical: 1,
    },
    size_md: {
      paddingHorizontal: 8,
      paddingVertical: 2,
    },
    label: {
      fontSize: 10,
      fontWeight: '600',
      letterSpacing: 0.5,
    },
    label_sm: {
      fontSize: 9,
    },

    // Variant backgrounds — themed tint pairs
    badge_default: { backgroundColor: tk.sunken },
    badge_brand: { backgroundColor: tk.brandTint },
    badge_success: { backgroundColor: tk.successTint },
    badge_warning: { backgroundColor: tk.warningTint },
    badge_error: { backgroundColor: tk.errorTint },
    badge_info: { backgroundColor: tk.infoTint },
    badge_neutral: { backgroundColor: tk.sunken },

    // Variant text colors
    label_default: { color: tk.textSecondary },
    label_brand: { color: tk.brandFg },
    label_success: { color: tk.successFg },
    label_warning: { color: tk.warningFg },
    label_error: { color: tk.errorFg },
    label_info: { color: tk.infoFg },
    label_neutral: { color: tk.textSecondary },
  }),
);

const statusStyles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  label_sm: {
    fontSize: 10,
  },
  label_lg: {
    fontSize: 13,
  },
});
