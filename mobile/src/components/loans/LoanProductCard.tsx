/**
 * LoanProductCard — Composite card for loan product catalog.
 * Phase 6C — docs/design/component-library.md addendum
 *
 * Shows: bank name + logo placeholder, product name, amount/tenure/rate ranges,
 * BadgeQual, EligibilityHintRow, View details + Apply CTAs.
 * Touch target: full card is pressable (96pt+ height). Min CTA buttons 44pt.
 */

import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Colors } from '../../constants/colors';
import { BadgeQual, type QualLevel } from './BadgeQual';
import { EligibilityHintRow } from './EligibilityHintRow';
import type { LoanProduct } from '../../api/loans';

interface LoanProductCardProps {
  product: LoanProduct;
  bankName?: string;
  qualLevel?: QualLevel;
  hintText?: string;
  onViewDetails?: () => void;
  onApply?: () => void;
  testID?: string;
}

/** Format number in Indian grouping with lakh/crore abbreviation */
function formatIndianAmount(n: number): string {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(1)}Cr`;
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(0)}L`;
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(0)}K`;
  return `₹${n}`;
}

export function LoanProductCard({
  product,
  bankName,
  qualLevel = 'UNCHECKED',
  hintText,
  onViewDetails,
  onApply,
  testID,
}: LoanProductCardProps) {
  const { t } = useTranslation();

  const displayBankName = bankName ?? t('mobile.loan.hub.card.bank');

  return (
    <View
      testID={testID}
      style={styles.card}
      accessibilityRole="button"
      accessibilityLabel={`${displayBankName}. ${product.productName}. ${formatIndianAmount(product.minAmount)} to ${formatIndianAmount(product.maxAmount)}. ${product.tenureMonths} months. ${product.interestRate}% p.a.`}
    >
      {/* Card header — bank logo + name + badge */}
      <View style={styles.header}>
        <View style={styles.bankLogoPlaceholder} accessibilityLabel={`${displayBankName} logo`}>
          <Ionicons name="business" size={20} color={Colors.loan} />
        </View>
        <View style={styles.bankInfo}>
          <Text style={styles.bankName} numberOfLines={1}>{displayBankName}</Text>
          <Text style={styles.productName} numberOfLines={2}>{product.productName}</Text>
        </View>
        <BadgeQual
          level={qualLevel}
          label={t(`mobile.loan.hub.card.${
            qualLevel === 'QUALIFIED' ? 'qualified' :
            qualLevel === 'NEAR_MATCH' ? 'nearMatch' :
            qualLevel === 'NOT_QUALIFIED' ? 'notQualified' : 'notQualified'
          }`)}
        />
      </View>

      {/* Metrics row */}
      <View style={styles.metricsRow}>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Amount</Text>
          <Text style={styles.metricValue}>
            {formatIndianAmount(product.minAmount)} – {formatIndianAmount(product.maxAmount)}
          </Text>
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Tenure</Text>
          <Text style={styles.metricValue}>{product.tenureMonths} mo</Text>
        </View>
        <View style={styles.metricDivider} />
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Interest</Text>
          <Text style={styles.metricValue}>{product.interestRate}% p.a.</Text>
        </View>
      </View>

      {/* Eligibility hint */}
      {hintText && (
        <EligibilityHintRow level={qualLevel} text={hintText} />
      )}

      {/* CTAs */}
      <View style={styles.ctaRow}>
        <Pressable
          style={[styles.ctaBtn, styles.ctaBtnOutline]}
          onPress={onViewDetails}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.loan.hub.card.cta.viewDetails')}
          hitSlop={8}
        >
          <Text style={styles.ctaBtnOutlineText}>
            {t('mobile.loan.hub.card.cta.viewDetails')}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.ctaBtn, styles.ctaBtnPrimary]}
          onPress={onApply}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.loan.hub.card.cta.apply')}
          hitSlop={8}
        >
          <Text style={styles.ctaBtnPrimaryText}>
            {t('mobile.loan.hub.card.cta.apply')}
          </Text>
          <Ionicons name="arrow-forward" size={14} color="#FFFFFF" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface.default,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  bankLogoPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.accent[50],
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  bankInfo: {
    flex: 1,
  },
  bankName: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.neutral[500],
    letterSpacing: 0.2,
  },
  productName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.neutral[900],
    marginTop: 2,
    letterSpacing: -0.2,
    lineHeight: 20,
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bg.subtle,
    borderRadius: 10,
    padding: 10,
    gap: 4,
  },
  metric: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  metricLabel: {
    fontSize: 10,
    color: Colors.neutral[500],
    fontWeight: '500',
  },
  metricValue: {
    fontSize: 12,
    color: Colors.neutral[800],
    fontWeight: '700',
    textAlign: 'center',
  },
  metricDivider: {
    width: 1,
    height: 28,
    backgroundColor: Colors.neutral[200],
  },
  ctaRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  ctaBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  ctaBtnOutline: {
    borderWidth: 1.5,
    borderColor: Colors.neutral[200],
  },
  ctaBtnOutlineText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.neutral[700],
  },
  ctaBtnPrimary: {
    backgroundColor: Colors.loan,
  },
  ctaBtnPrimaryText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
