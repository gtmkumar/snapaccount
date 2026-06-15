/**
 * ImsInvoiceDetailScreen (IMS-M2) — full IMS invoice detail + action log.
 * Spec: docs/design/ims-inbox-spec.md §3 (detail), §6 (actions), §9.1
 * (Create GSTR-1A amendment entry from a REJECTED invoice), §10 (a11y).
 */

import React, { useCallback, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import {
  createThemedStyles,
  useTheme,
  type ThemeTokens,
} from '../../contexts/ThemeContext';
import { useSensitiveScreen } from '../../hooks/usePreventScreenCapture';
import { useScreenReaderEnabled } from '../../hooks/useScreenReaderEnabled';
import { useAuthStore } from '../../store/authStore';
import { formatINR } from '../../lib/utils';
import {
  daysUntilDate,
  formatDateDDMMMYYYY,
  formatTimestampIST,
  periodToLabel,
} from '../../lib/imsPeriod';
import {
  actOnImsInvoice,
  getImsInvoice,
  getImsSummary,
  type ImsAction,
} from '../../api/gstIms';
import { legalImsActions } from '../../components/gst/ImsInvoiceCard';
import { ImsStatusBadge } from '../../components/gst/ImsStatusBadge';
import { ImsDeemedChip } from '../../components/gst/ImsDeemedChip';
import { RejectReasonSheet } from '../../components/gst/RejectReasonSheet';
import { ImsUndoToast } from '../../components/gst/ImsUndoToast';
import { Button } from '../../components/ui/Button';
import type { GstStackParamList } from '../../navigation/GstStack';

type NavProp = NativeStackNavigationProp<GstStackParamList, 'ImsInvoiceDetail'>;
type RoutePropType = RouteProp<GstStackParamList, 'ImsInvoiceDetail'>;

interface Props {
  navigation: NavProp;
  route: RoutePropType;
}

export function ImsInvoiceDetailScreen({ navigation, route }: Props) {
  useSensitiveScreen();
  const { t } = useTranslation();
  const { tokens } = useTheme();
  const styles = useStyles();
  const qc = useQueryClient();
  const srEnabled = useScreenReaderEnabled();
  const { invoiceId } = route.params;

  const organization = useAuthStore((s) => s.currentOrganization);
  const user = useAuthStore((s) => s.user);
  const orgId = organization?.id ?? '';
  const userId = user?.id ?? '';

  const [rejectVisible, setRejectVisible] = useState(false);
  const [toast, setToast] = useState<{ message: string; onUndo?: () => void } | null>(null);

  const invoiceQuery = useQuery({
    queryKey: ['ims-invoice', orgId, invoiceId],
    queryFn: () => getImsInvoice(invoiceId, orgId),
    enabled: !!orgId,
  });
  const invoice = invoiceQuery.data;

  const summaryQuery = useQuery({
    queryKey: ['ims-summary', orgId, invoice?.period],
    queryFn: () => getImsSummary(orgId, invoice?.period ?? ''),
    enabled: !!orgId && !!invoice?.period,
  });
  const windowPast = summaryQuery.data?.gstr2bGenerationPast ?? false;
  const daysLeft = summaryQuery.data
    ? daysUntilDate(summaryQuery.data.gstr2bGenerationDeadline)
    : 99;

  const refetchAll = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['ims-invoice', orgId, invoiceId] });
    void qc.invalidateQueries({ queryKey: ['ims-invoices', orgId] });
    void qc.invalidateQueries({ queryKey: ['ims-summary', orgId] });
  }, [qc, orgId, invoiceId]);

  const announce = useCallback(
    (message: string) => {
      if (srEnabled) AccessibilityInfo.announceForAccessibility(message);
    },
    [srEnabled],
  );

  const undoAction = useCallback(() => {
    actOnImsInvoice(invoiceId, {
      organizationId: orgId,
      actionedBy: userId,
      action: 'PENDING_KEPT',
    })
      .then(() => {
        const msg = t('mobile.gst.ims.undo.movedToKept');
        setToast({ message: msg });
        announce(msg);
      })
      .catch(() => setToast({ message: t('mobile.gst.ims.error.actionFailed') }))
      .finally(refetchAll);
  }, [invoiceId, orgId, userId, t, announce, refetchAll]);

  const actionMutation = useMutation({
    mutationFn: ({ action, reason }: { action: ImsAction; reason?: string }) =>
      actOnImsInvoice(invoiceId, {
        organizationId: orgId,
        actionedBy: userId,
        action,
        reason,
      }),
    onSuccess: (_res, { action }) => {
      const number = invoice?.invoiceNumber ?? '';
      const msg =
        action === 'ACCEPTED'
          ? t('mobile.gst.ims.accept.success', { invoiceNumber: number })
          : action === 'REJECTED'
            ? t('mobile.gst.ims.reject.success', { invoiceNumber: number })
            : t('mobile.gst.ims.keepPending.success', { invoiceNumber: number });
      announce(msg);
      setToast({ message: msg, onUndo: windowPast ? undefined : undoAction });
      setRejectVisible(false);
      refetchAll();
    },
    onError: (err: unknown, { action }) => {
      const resp = (err as { response?: { status?: number; data?: { error?: string } } })
        ?.response;
      const msg =
        resp?.status === 409
          ? t('mobile.gst.ims.error.alreadySettled', {
              status: invoice ? t(`mobile.gst.ims.status.${invoice.status}`) : '',
              action: t(`mobile.gst.ims.status.${action}`),
            })
          : resp?.data?.error ?? t('mobile.gst.ims.error.actionFailed');
      setToast({ message: msg });
      announce(msg);
      setRejectVisible(false);
      refetchAll();
    },
  });

  const goToGstr1a = useCallback(() => {
    if (!invoice) return;
    navigation.navigate('Gstr1aAmendments', {
      prefill: {
        originalImsInvoiceId: invoice.id,
        originalInvoiceNumber: invoice.invoiceNumber,
        originalSupplierGstin: invoice.supplierGstin,
        period: invoice.period,
      },
    });
  }, [navigation, invoice]);

  const actions = invoice ? legalImsActions(invoice.status, windowPast) : null;
  const taxTotal = invoice
    ? invoice.igstAmount + invoice.cgstAmount + invoice.sgstAmount + invoice.cessAmount
    : 0;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.common.back')}
          hitSlop={8}
        >
          <Ionicons name="arrow-back" size={22} color={tokens.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('mobile.gst.ims.detail.title')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {invoiceQuery.isLoading ? (
        <View style={styles.centerWrap}>
          <ActivityIndicator size="large" color={tokens.gstAccent} />
        </View>
      ) : invoiceQuery.isError || !invoice ? (
        <View style={styles.centerWrap}>
          <Ionicons name="alert-circle-outline" size={40} color={tokens.errorFg} />
          <Text style={styles.stateText}>{t('mobile.gst.ims.error.loadFailed')}</Text>
          <Button
            label={t('mobile.gst.ims.error.retry')}
            onPress={() => void invoiceQuery.refetch()}
          />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Identity card */}
          <View style={styles.card}>
            <View style={styles.rowBetween}>
              <Text style={styles.supplierName}>{invoice.supplierName}</Text>
              <ImsStatusBadge
                status={invoice.status}
                deemedAccepted={invoice.deemedAccepted}
                testID="ims-detail-status"
              />
            </View>
            <Text style={styles.mono}>{invoice.supplierGstin}</Text>
            <View style={styles.kvRow}>
              <Text style={styles.kvLabel}>{t('mobile.gst.ims.col.invoice')}</Text>
              <Text style={[styles.kvValue, styles.monoValue]}>{invoice.invoiceNumber}</Text>
            </View>
            <View style={styles.kvRow}>
              <Text style={styles.kvLabel}>{t('mobile.gst.ims.detail.invoiceDate')}</Text>
              <Text style={styles.kvValue}>{formatDateDDMMMYYYY(invoice.invoiceDate)}</Text>
            </View>
            <View style={styles.kvRow}>
              <Text style={styles.kvLabel}>{t('mobile.gst.ims.period.label')}</Text>
              <Text style={styles.kvValue}>{periodToLabel(invoice.period)}</Text>
            </View>
            <View style={styles.kvRow}>
              <Text style={styles.kvLabel}>{t('mobile.gst.ims.col.source')}</Text>
              <Text style={styles.kvValue}>{invoice.source}</Text>
            </View>
            <View style={styles.chipWrap}>
              <ImsDeemedChip
                status={invoice.status}
                deemedAccepted={invoice.deemedAccepted}
                gstr2bGenerationPast={windowPast}
                daysLeft={daysLeft}
                testID="ims-detail-chip"
              />
            </View>
          </View>

          {/* Window-past info banner (spec §6.5) */}
          {windowPast ? (
            <View style={styles.infoBanner} testID="ims-detail-window-past">
              <Ionicons name="information-circle" size={18} color={tokens.infoFg} />
              <Text style={styles.infoBannerText}>
                {t('mobile.gst.ims.banner.windowPast', {
                  period: periodToLabel(invoice.period),
                })}
              </Text>
            </View>
          ) : null}

          {/* Tax breakdown — real zeros render as ₹0, never "—" (spec §3.1) */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{t('mobile.gst.ims.detail.taxBreakdown')}</Text>
            <TaxRow label={t('mobile.gst.ims.col.taxableValue')} value={invoice.taxableValue} />
            <TaxRow label={t('mobile.gst.ims.detail.igst')} value={invoice.igstAmount} />
            <TaxRow label={t('mobile.gst.ims.detail.cgst')} value={invoice.cgstAmount} />
            <TaxRow label={t('mobile.gst.ims.detail.sgst')} value={invoice.sgstAmount} />
            <TaxRow label={t('mobile.gst.ims.detail.cess')} value={invoice.cessAmount} />
            <TaxRow label={t('mobile.gst.ims.col.tax')} value={taxTotal} />
            <TaxRow
              label={t('mobile.gst.ims.col.invoiceValue')}
              value={invoice.invoiceValue}
              emphasis
            />
          </View>

          {/* Rejection reason */}
          {invoice.rejectionReason ? (
            <View style={styles.card} testID="ims-detail-rejection-reason">
              <Text style={styles.sectionTitle}>
                {t('mobile.gst.ims.detail.rejectionReason')}
              </Text>
              <Text style={styles.bodyText}>{invoice.rejectionReason}</Text>
            </View>
          ) : null}

          {/* Actions (only legal ones — spec §0/§6) */}
          {actions && (actions.accept || actions.reject || actions.keepPending) ? (
            <View style={styles.actionCol}>
              {actions.accept ? (
                <Button
                  label={t('mobile.gst.ims.action.accept')}
                  variant="primary"
                  fullWidth
                  loading={actionMutation.isPending}
                  onPress={() => actionMutation.mutate({ action: 'ACCEPTED' })}
                  testID="ims-detail-accept"
                />
              ) : null}
              {actions.keepPending ? (
                <Button
                  label={t('mobile.gst.ims.action.keepPending')}
                  variant="secondary"
                  fullWidth
                  disabled={actionMutation.isPending}
                  onPress={() => actionMutation.mutate({ action: 'PENDING_KEPT' })}
                  accessibilityHint={t('mobile.gst.ims.keepPending.hint')}
                  testID="ims-detail-keep"
                />
              ) : null}
              {actions.reject ? (
                <Button
                  label={t('mobile.gst.ims.action.reject')}
                  variant="danger"
                  fullWidth
                  disabled={actionMutation.isPending}
                  onPress={() => setRejectVisible(true)}
                  testID="ims-detail-reject"
                />
              ) : null}
              {actions.keepPending ? (
                <Text style={styles.keepHint}>{t('mobile.gst.ims.keepPending.hint')}</Text>
              ) : null}
            </View>
          ) : null}

          {/* GSTR-1A correction routes (spec §9.1) */}
          {invoice.status === 'REJECTED' ? (
            <Button
              label={t('mobile.gst.gstr1a.create.cta')}
              variant="primary"
              fullWidth
              onPress={goToGstr1a}
              testID="ims-detail-create-gstr1a"
            />
          ) : actions?.fixViaGstr1a ? (
            <Button
              label={t('mobile.gst.ims.action.fixViaGstr1a')}
              variant="secondary"
              fullWidth
              onPress={goToGstr1a}
              testID="ims-detail-fix-gstr1a"
            />
          ) : null}

          {/* Action log */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>{t('mobile.gst.ims.detail.actionLog')}</Text>
            {invoice.actionLog.length === 0 ? (
              <Text style={styles.bodyText}>{t('mobile.gst.ims.detail.noActions')}</Text>
            ) : (
              invoice.actionLog.map((entry) => (
                <View key={entry.id} style={styles.logRow}>
                  <Ionicons
                    name="ellipse"
                    size={8}
                    color={tokens.gstAccent}
                    style={styles.logDot}
                  />
                  <View style={styles.logBody}>
                    <Text style={styles.logTitle}>
                      {t(`mobile.gst.ims.status.${entry.newStatus}`, {
                        defaultValue: entry.newStatus,
                      })}
                      {entry.isBulk ? ` · ${t('mobile.gst.ims.detail.bulkTag')}` : ''}
                    </Text>
                    <Text style={styles.logMeta}>{formatTimestampIST(entry.actedAt)}</Text>
                    {entry.reason ? (
                      <Text style={styles.logReason}>{entry.reason}</Text>
                    ) : null}
                  </View>
                </View>
              ))
            )}
          </View>
          <View style={styles.bottomSpacer} />
        </ScrollView>
      )}

      <RejectReasonSheet
        visible={rejectVisible}
        invoiceNumber={invoice?.invoiceNumber}
        busy={actionMutation.isPending}
        onConfirm={(reason) => actionMutation.mutate({ action: 'REJECTED', reason })}
        onClose={() => setRejectVisible(false)}
      />

      <ImsUndoToast
        visible={toast !== null}
        message={toast?.message ?? ''}
        onUndo={
          toast?.onUndo
            ? () => {
                toast.onUndo?.();
                setToast(null);
              }
            : undefined
        }
        onDismiss={() => setToast(null)}
        testID="ims-detail-toast"
      />
    </SafeAreaView>
  );
}

function TaxRow({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: number;
  emphasis?: boolean;
}) {
  const styles = useStyles();
  return (
    <View style={styles.kvRow} accessible accessibilityLabel={`${label}: ${formatINR(value)}`}>
      <Text style={[styles.kvLabel, emphasis && styles.kvEmphasis]}>{label}</Text>
      <Text style={[styles.kvValue, styles.amount, emphasis && styles.kvEmphasis]}>
        {formatINR(value)}
      </Text>
    </View>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: tk.canvas },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: tk.raised,
      borderBottomWidth: 1,
      borderBottomColor: tk.border,
    },
    backBtn: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: tk.sunken,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: { fontSize: 18, fontWeight: '800', color: tk.textPrimary },
    headerSpacer: { width: 44 },
    centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
    stateText: { fontSize: 14, color: tk.textSecondary, textAlign: 'center' },
    scrollContent: { padding: 16, gap: 14 },
    card: {
      backgroundColor: tk.raised,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: tk.border,
      padding: 16,
      gap: 8,
      ...tk.elevation1,
    },
    rowBetween: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 8,
    },
    supplierName: { flex: 1, fontSize: 17, fontWeight: '800', color: tk.textPrimary },
    mono: {
      fontSize: 12,
      color: tk.textSecondary,
      fontFamily: Platform.OS === 'ios' ? 'SF Mono' : 'monospace',
    },
    kvRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
      minHeight: 28,
    },
    kvLabel: { fontSize: 13, color: tk.textSecondary },
    kvValue: { fontSize: 14, fontWeight: '600', color: tk.textPrimary },
    kvEmphasis: { fontWeight: '800', fontSize: 15, color: tk.textPrimary },
    monoValue: { fontFamily: Platform.OS === 'ios' ? 'SF Mono' : 'monospace' },
    amount: { fontVariant: ['tabular-nums'] },
    chipWrap: { marginTop: 4 },
    infoBanner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      backgroundColor: tk.infoTint,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: tk.border,
      padding: 12,
    },
    infoBannerText: { flex: 1, fontSize: 13, fontWeight: '600', color: tk.infoFg, lineHeight: 19 },
    sectionTitle: { fontSize: 15, fontWeight: '800', color: tk.textPrimary, marginBottom: 4 },
    bodyText: { fontSize: 14, color: tk.textSecondary, lineHeight: 21 },
    actionCol: { gap: 10 },
    keepHint: { fontSize: 12, color: tk.textSecondary, lineHeight: 18 },
    logRow: { flexDirection: 'row', gap: 10, paddingVertical: 6 },
    logDot: { marginTop: 5 },
    logBody: { flex: 1, gap: 2 },
    logTitle: { fontSize: 13, fontWeight: '700', color: tk.textPrimary },
    logMeta: { fontSize: 12, color: tk.textSecondary },
    logReason: { fontSize: 12, color: tk.textSecondary, fontStyle: 'italic' },
    bottomSpacer: { height: 60 },
  }),
);
