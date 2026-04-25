/**
 * Badge and StatusBadge Components
 * Matches component-library.md §2.3 and §2.5
 */

import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Colors } from '../../constants/colors';

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

const STATUS_CONFIG: Record<AnyStatus, { bg: string; text: string; label: string }> = {
  // Document
  UPLOADED: { bg: Colors.info[100], text: Colors.info[600], label: 'Uploaded' },
  OCR_COMPLETE: { bg: Colors.brand[100], text: Colors.brand[600], label: 'OCR Complete' },
  IN_REVIEW: { bg: Colors.warning[100], text: Colors.warning[600], label: 'In Review' },
  PROCESSED: { bg: Colors.success[100], text: Colors.success[600], label: 'Processed' },
  REJECTED: { bg: Colors.error[100], text: Colors.error[600], label: 'Rejected' },
  // GST
  DRAFT: { bg: Colors.neutral[100], text: Colors.neutral[600], label: 'Draft' },
  PENDING_APPROVAL: { bg: Colors.warning[100], text: Colors.warning[600], label: 'Pending Approval' },
  APPROVED: { bg: Colors.info[100], text: Colors.info[600], label: 'Approved' },
  FILED: { bg: Colors.success[100], text: Colors.success[600], label: 'Filed' },
  REVISION_NEEDED: { bg: Colors.error[100], text: Colors.error[600], label: 'Revision Needed' },
  // ITR
  USER_APPROVED: { bg: Colors.info[100], text: Colors.info[600], label: 'User Approved' },
  FILING_IN_PROGRESS: { bg: Colors.brand[100], text: Colors.brand[600], label: 'Filing' },
  E_VERIFIED: { bg: Colors.success[100], text: Colors.success[600], label: 'E-Verified' },
  COMPLETED: { bg: Colors.success[100], text: Colors.success[600], label: 'Completed' },
  // Loan
  INITIATED: { bg: Colors.neutral[100], text: Colors.neutral[600], label: 'Initiated' },
  DOCUMENTS_READY: { bg: Colors.info[100], text: Colors.info[600], label: 'Docs Ready' },
  SUBMITTED: { bg: Colors.brand[100], text: Colors.brand[600], label: 'Submitted' },
  UNDER_REVIEW: { bg: Colors.warning[100], text: Colors.warning[600], label: 'Under Review' },
  ADDITIONAL_DOCS_NEEDED: { bg: Colors.warning[100], text: Colors.warning[600], label: 'Docs Needed' },
  DISBURSED: { bg: Colors.success[100], text: Colors.success[600], label: 'Disbursed' },
};

interface StatusBadgeProps {
  status: AnyStatus;
  size?: 'sm' | 'md' | 'lg';
}

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status];
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

const styles = StyleSheet.create({
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

  // Variant backgrounds
  badge_default: { backgroundColor: Colors.neutral[100] },
  badge_brand: { backgroundColor: Colors.brand[100] },
  badge_success: { backgroundColor: Colors.success[100] },
  badge_warning: { backgroundColor: Colors.warning[100] },
  badge_error: { backgroundColor: Colors.error[100] },
  badge_info: { backgroundColor: Colors.info[100] },
  badge_neutral: { backgroundColor: Colors.neutral[100] },

  // Variant text colors
  label_default: { color: Colors.neutral[600] },
  label_brand: { color: Colors.brand[600] },
  label_success: { color: Colors.success[600] },
  label_warning: { color: Colors.warning[600] },
  label_error: { color: Colors.error[600] },
  label_info: { color: Colors.info[600] },
  label_neutral: { color: Colors.neutral[600] },
});

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
