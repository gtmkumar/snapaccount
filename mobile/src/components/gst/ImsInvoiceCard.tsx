/**
 * ImsInvoiceCard — one IMS inbox invoice (mobile list composition).
 * Spec: docs/design/ims-inbox-spec.md §3.1 (mobile card), §6 (action zone),
 * §10.1 (composed single-unit SR label), §10.2 (≥44pt action targets).
 *
 * The info zone announces as ONE unit; per-row action buttons are separate
 * ≥44pt touch targets that stop card-tap propagation.
 */

import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import {
  createThemedStyles,
  useTheme,
  type ThemeTokens,
} from '../../contexts/ThemeContext';
import { formatINR } from '../../lib/utils';
import { formatDateDDMMYYYY, formatDateDDMMMYYYY } from '../../lib/imsPeriod';
import type { ImsInvoiceSummary } from '../../api/gstIms';
import { ImsStatusBadge } from './ImsStatusBadge';
import { ImsDeemedChip } from './ImsDeemedChip';

export interface ImsLegalActions {
  accept: boolean;
  reject: boolean;
  keepPending: boolean;
  fixViaGstr1a: boolean;
}

/**
 * Mirror of the server state machine — the UI must never offer an illegal
 * transition (ACCEPTED→REJECTED etc. are 409s). Spec §0/§6.
 */
export function legalImsActions(
  status: ImsInvoiceSummary['status'],
  gstr2bGenerationPast: boolean,
): ImsLegalActions {
  if (gstr2bGenerationPast) {
    return {
      accept: false,
      reject: false,
      keepPending: false,
      // Post-window the ONLY correction route is GSTR-1A (§6.5).
      fixViaGstr1a: status === 'ACCEPTED' || status === 'REJECTED',
    };
  }
  switch (status) {
    case 'PENDING':
      return { accept: true, reject: true, keepPending: true, fixViaGstr1a: false };
    case 'PENDING_KEPT':
      return { accept: true, reject: true, keepPending: false, fixViaGstr1a: false };
    case 'ACCEPTED':
    case 'REJECTED':
    default:
      return { accept: false, reject: false, keepPending: false, fixViaGstr1a: true };
  }
}

interface Props {
  invoice: ImsInvoiceSummary;
  gstr2bGenerationPast: boolean;
  daysLeft: number;
  onPress: () => void;
  onAccept: () => void;
  onReject: () => void;
  onKeepPending: () => void;
  onFixViaGstr1a: () => void;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  /** Disables the action zone while a mutation is in flight. */
  actionBusy?: boolean;
  testID?: string;
}

export function ImsInvoiceCard({
  invoice,
  gstr2bGenerationPast,
  daysLeft,
  onPress,
  onAccept,
  onReject,
  onKeepPending,
  onFixViaGstr1a,
  selectionMode = false,
  selected = false,
  onToggleSelect,
  actionBusy = false,
  testID,
}: Props) {
  const { t } = useTranslation();
  const { tokens } = useTheme();
  const styles = useStyles();

  const taxTotal =
    invoice.igstAmount + invoice.cgstAmount + invoice.sgstAmount + invoice.cessAmount;
  const actions = legalImsActions(invoice.status, gstr2bGenerationPast);

  // Composed single-unit SR label (a11y KFS-2 pattern, spec §10.1).
  const statusLabel = t(`mobile.gst.ims.status.${invoice.status}`);
  let countdownPhrase = '';
  if (gstr2bGenerationPast || invoice.deemedAccepted) {
    countdownPhrase = t('mobile.gst.ims.deadline.deemedA11y');
  } else if (invoice.status === 'PENDING' || invoice.status === 'PENDING_KEPT') {
    countdownPhrase =
      daysLeft <= 0
        ? t('mobile.gst.ims.deadline.dueTodayA11y')
        : t('mobile.gst.ims.deadline.a11y', { count: daysLeft });
  }
  const rowA11yLabel = t('mobile.gst.ims.row.a11y', {
    supplier: invoice.supplierName,
    gstin: invoice.supplierGstin,
    invoiceNumber: invoice.invoiceNumber,
    date: formatDateDDMMMYYYY(invoice.invoiceDate),
    taxable: formatINR(invoice.taxableValue),
    tax: formatINR(taxTotal),
    total: formatINR(invoice.invoiceValue),
    status: statusLabel,
    countdown: countdownPhrase,
  });

  const handleCardPress = selectionMode && onToggleSelect ? onToggleSelect : onPress;

  return (
    <View style={[styles.card, selected && styles.cardSelected]} testID={testID}>
      <Pressable
        onPress={handleCardPress}
        accessibilityRole="button"
        accessibilityLabel={rowA11yLabel}
        accessibilityState={selectionMode ? { selected } : undefined}
        style={styles.infoZone}
        testID={testID ? `${testID}-press` : undefined}
      >
        <View
          style={styles.infoInner}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
        >
          {/* Row 1: supplier + status */}
          <View style={styles.rowBetween}>
            <View style={styles.supplierWrap}>
              {selectionMode ? (
                <View
                  style={[styles.checkbox, selected && styles.checkboxOn]}
                  testID={testID ? `${testID}-checkbox` : undefined}
                >
                  {selected ? (
                    <Ionicons name="checkmark" size={14} color={tokens.textOnBrand} />
                  ) : null}
                </View>
              ) : null}
              <Text style={styles.supplierName} numberOfLines={2}>
                {invoice.supplierName}
              </Text>
            </View>
            <ImsStatusBadge
              status={invoice.status}
              deemedAccepted={invoice.deemedAccepted}
              testID={testID ? `${testID}-status` : undefined}
            />
          </View>

          {/* Row 2: GSTIN (mono, never truncated) */}
          <Text style={styles.gstin}>{invoice.supplierGstin}</Text>

          {/* Row 3: invoice number + date */}
          <Text style={styles.invoiceLine}>
            <Text style={styles.mono}>{invoice.invoiceNumber}</Text>
            {'  ·  '}
            {formatDateDDMMYYYY(invoice.invoiceDate)}
          </Text>

          {/* Row 4: amounts */}
          <View style={styles.amountRow}>
            <View style={styles.amountCell}>
              <Text style={styles.amountLabel}>{t('mobile.gst.ims.col.taxableValue')}</Text>
              <Text style={styles.amountValue}>{formatINR(invoice.taxableValue)}</Text>
            </View>
            <View style={styles.amountCell}>
              <Text style={styles.amountLabel}>{t('mobile.gst.ims.col.tax')}</Text>
              <Text style={styles.amountValue}>{formatINR(taxTotal)}</Text>
            </View>
            <View style={styles.amountCell}>
              <Text style={styles.amountLabel}>{t('mobile.gst.ims.col.invoiceValue')}</Text>
              <Text style={[styles.amountValue, styles.amountTotal]}>
                {formatINR(invoice.invoiceValue)}
              </Text>
            </View>
          </View>

          {/* Row 5: source + countdown */}
          <View style={styles.rowBetween}>
            <View style={styles.sourceTag}>
              <Text style={styles.sourceTagText}>{invoice.source}</Text>
            </View>
            <ImsDeemedChip
              status={invoice.status}
              deemedAccepted={invoice.deemedAccepted}
              gstr2bGenerationPast={gstr2bGenerationPast}
              daysLeft={daysLeft}
              testID={testID ? `${testID}-chip` : undefined}
            />
          </View>
        </View>
      </Pressable>

      {/* Row 6: action zone — only legal actions; each ≥44pt (spec §10.2) */}
      {!selectionMode &&
      (actions.accept || actions.reject || actions.keepPending || actions.fixViaGstr1a) ? (
        <View style={styles.actionZone}>
          {actions.accept ? (
            <ActionButton
              label={t('mobile.gst.ims.action.accept')}
              icon="checkmark-circle-outline"
              fg={tokens.successFg}
              bg={tokens.successTint}
              border={tokens.successTintBorder}
              disabled={actionBusy}
              onPress={onAccept}
              testID={testID ? `${testID}-accept` : undefined}
            />
          ) : null}
          {actions.reject ? (
            <ActionButton
              label={t('mobile.gst.ims.action.reject')}
              icon="close-circle-outline"
              fg={tokens.errorFg}
              bg={tokens.errorTint}
              border={tokens.errorTintBorder}
              disabled={actionBusy}
              onPress={onReject}
              testID={testID ? `${testID}-reject` : undefined}
            />
          ) : null}
          {actions.keepPending ? (
            <ActionButton
              label={t('mobile.gst.ims.action.keepPending')}
              icon="pause-circle-outline"
              fg={tokens.infoFg}
              bg={tokens.infoTint}
              border={tokens.border}
              disabled={actionBusy}
              onPress={onKeepPending}
              accessibilityHint={t('mobile.gst.ims.keepPending.hint')}
              testID={testID ? `${testID}-keep` : undefined}
            />
          ) : null}
          {actions.fixViaGstr1a ? (
            <ActionButton
              label={t('mobile.gst.ims.action.fixViaGstr1a')}
              icon="construct-outline"
              fg={tokens.brandFg}
              bg={tokens.brandTint}
              border={tokens.brandTintBorder}
              disabled={actionBusy}
              onPress={onFixViaGstr1a}
              testID={testID ? `${testID}-fix` : undefined}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function ActionButton({
  label,
  icon,
  fg,
  bg,
  border,
  onPress,
  disabled,
  accessibilityHint,
  testID,
}: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  fg: string;
  bg: string;
  border: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityHint?: string;
  testID?: string;
}) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.actionBtn, { backgroundColor: bg, borderColor: border }, disabled && styles.actionBtnDisabled]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      testID={testID}
    >
      <Ionicons name={icon} size={15} color={fg} />
      <Text style={[styles.actionBtnText, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
    card: {
      backgroundColor: tk.raised,
      borderRadius: 16,
      padding: 14,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: tk.border,
      ...tk.elevation1,
    },
    cardSelected: {
      borderWidth: 2,
      borderColor: tk.brand500,
    },
    infoZone: {
      gap: 0,
    },
    infoInner: {
      gap: 6,
    },
    rowBetween: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 8,
    },
    supplierWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flex: 1,
      minWidth: 0,
    },
    supplierName: {
      fontSize: 15,
      fontWeight: '700',
      color: tk.textPrimary,
      flexShrink: 1,
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: tk.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: tk.inputBg,
    },
    checkboxOn: {
      backgroundColor: tk.brandCta,
      borderColor: tk.brandCta,
    },
    // GSTIN is meaningful identifying text — textSecondary keeps ≥4.5:1 (a11y X-1).
    gstin: {
      fontSize: 12,
      color: tk.textSecondary,
      fontFamily: Platform.OS === 'ios' ? 'SF Mono' : 'monospace',
    },
    invoiceLine: {
      fontSize: 13,
      color: tk.textSecondary,
    },
    mono: {
      fontFamily: Platform.OS === 'ios' ? 'SF Mono' : 'monospace',
      color: tk.textPrimary,
    },
    amountRow: {
      flexDirection: 'row',
      gap: 12,
      paddingVertical: 6,
      borderTopWidth: 1,
      borderTopColor: tk.border,
    },
    amountCell: {
      flex: 1,
      minWidth: 0,
    },
    amountLabel: {
      fontSize: 11,
      color: tk.textSecondary,
      marginBottom: 2,
    },
    amountValue: {
      fontSize: 13,
      fontWeight: '600',
      color: tk.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    amountTotal: {
      fontWeight: '700',
    },
    sourceTag: {
      backgroundColor: tk.gstAccent + '15',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 6,
      alignSelf: 'flex-start',
    },
    sourceTagText: {
      fontSize: 11,
      fontWeight: '700',
      color: tk.gstAccent,
    },
    actionZone: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 12,
    },
    actionBtn: {
      flex: 1,
      minHeight: 44, // a11y 2.5.8 house rule
      borderRadius: 10,
      borderWidth: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      paddingHorizontal: 6,
    },
    actionBtnDisabled: {
      opacity: 0.5,
    },
    actionBtnText: {
      fontSize: 13,
      fontWeight: '700',
    },
  }),
);
