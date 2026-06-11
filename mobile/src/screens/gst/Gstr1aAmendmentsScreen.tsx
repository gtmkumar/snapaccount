/**
 * Gstr1aAmendmentsScreen (IMS-M3) — rejected-invoice follow-up list + create.
 * Spec: docs/design/ims-inbox-spec.md §9. GSTR-1A is the ONLY correction route
 * once an IMS invoice reaches a terminal/filed state.
 *
 * Draft-only workflow at this stage: created amendments start in DRAFT;
 * submit/file is a later flow (§9.3).
 */

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
import { useAuthStore } from '../../store/authStore';
import {
  currentOpenImsPeriod,
  formatDateDDMMYYYY,
  periodToShortLabel,
} from '../../lib/imsPeriod';
import {
  createGstr1aAmendment,
  listGstr1aAmendments,
  type Gstr1aAmendmentType,
  type Gstr1aStatus,
} from '../../api/gstIms';
import { Gstr1aStatusBadge } from '../../components/gst/ImsStatusBadge';
import { Button } from '../../components/ui/Button';
import type { GstStackParamList } from '../../navigation/GstStack';

type NavProp = NativeStackNavigationProp<GstStackParamList, 'Gstr1aAmendments'>;
type RoutePropType = RouteProp<GstStackParamList, 'Gstr1aAmendments'>;

interface Props {
  navigation: NavProp;
  route: RoutePropType;
}

const AMENDMENT_TYPES: Gstr1aAmendmentType[] = [
  'B2B_AMENDMENT',
  'B2BA',
  'CDNR_AMENDMENT',
  'CDNRA',
];

const STATUS_FILTERS: (Gstr1aStatus | 'ALL')[] = ['ALL', 'DRAFT', 'SUBMITTED', 'FILED'];

export function Gstr1aAmendmentsScreen({ navigation, route }: Props) {
  useSensitiveScreen();
  const { t } = useTranslation();
  const { tokens } = useTheme();
  const styles = useStyles();
  const qc = useQueryClient();

  const organization = useAuthStore((s) => s.currentOrganization);
  const orgId = organization?.id ?? '';
  const prefill = route.params?.prefill;

  const [statusFilter, setStatusFilter] = useState<Gstr1aStatus | 'ALL'>('ALL');
  // Launched from a rejected invoice → open the create sheet pre-filled (§9.1)
  const [createVisible, setCreateVisible] = useState(() => !!prefill);

  // Form state
  const [amendmentType, setAmendmentType] = useState<Gstr1aAmendmentType>('B2B_AMENDMENT');
  const [invoiceNumber, setInvoiceNumber] = useState(prefill?.originalInvoiceNumber ?? '');
  const [supplierGstin, setSupplierGstin] = useState(prefill?.originalSupplierGstin ?? '');
  const [taxable, setTaxable] = useState('');
  const [igst, setIgst] = useState('');
  const [cgst, setCgst] = useState('');
  const [sgst, setSgst] = useState('');
  const [cess, setCess] = useState('');
  const period = prefill?.period ?? currentOpenImsPeriod();

  const listQuery = useQuery({
    queryKey: ['gstr1a', orgId, statusFilter],
    queryFn: () =>
      listGstr1aAmendments({
        organizationId: orgId,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        page: 1,
        pageSize: 50,
      }),
    enabled: !!orgId,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createGstr1aAmendment({
        organizationId: orgId,
        originalImsInvoiceId: prefill?.originalImsInvoiceId ?? null,
        originalInvoiceNumber: invoiceNumber.trim(),
        originalSupplierGstin: supplierGstin.trim(),
        amendmentType,
        amendmentPayloadJson: JSON.stringify({
          correctedTaxableValue: Number(taxable) || 0,
          correctedIgst: Number(igst) || 0,
          correctedCgst: Number(cgst) || 0,
          correctedSgst: Number(sgst) || 0,
          correctedCess: Number(cess) || 0,
        }),
        period,
      }),
    onSuccess: () => {
      setCreateVisible(false);
      void qc.invalidateQueries({ queryKey: ['gstr1a', orgId] });
    },
  });

  const items = listQuery.data?.items ?? [];
  const formValid = invoiceNumber.trim().length > 0 && supplierGstin.trim().length > 0;

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
        <Text style={styles.headerTitle}>{t('mobile.gst.gstr1a.nav.title')}</Text>
        <Pressable
          style={styles.backBtn}
          onPress={() => setCreateVisible(true)}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.gst.gstr1a.create.cta')}
          hitSlop={8}
          testID="gstr1a-create-open"
        >
          <Ionicons name="add" size={24} color={tokens.brandFg} />
        </Pressable>
      </View>

      {/* Status filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
        style={styles.chipScroller}
      >
        {STATUS_FILTERS.map((key) => {
          const active = statusFilter === key;
          const label =
            key === 'ALL'
              ? t('mobile.gst.ims.filter.all')
              : t(`mobile.gst.gstr1a.status.${key}`);
          return (
            <Pressable
              key={key}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setStatusFilter(key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={label}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* List */}
      {listQuery.isLoading ? (
        <View style={styles.centerWrap}>
          <ActivityIndicator size="large" color={tokens.gstAccent} />
        </View>
      ) : listQuery.isError ? (
        <View style={styles.centerWrap}>
          <Ionicons name="alert-circle-outline" size={40} color={tokens.errorFg} />
          <Text style={styles.stateText}>{t('mobile.gst.ims.error.loadFailed')}</Text>
          <Button
            label={t('mobile.gst.ims.error.retry')}
            onPress={() => void listQuery.refetch()}
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={listQuery.isRefetching}
              onRefresh={() => void listQuery.refetch()}
            />
          }
        >
          {items.length === 0 ? (
            <View style={styles.centerWrap} testID="gstr1a-empty">
              <View style={styles.emptyIcon}>
                <Ionicons name="document-text-outline" size={36} color={tokens.gstAccent} />
              </View>
              <Text style={styles.stateText}>{t('mobile.gst.gstr1a.empty')}</Text>
            </View>
          ) : (
            items.map((a) => (
              <View
                key={a.id}
                style={styles.card}
                accessible
                accessibilityLabel={`${a.originalInvoiceNumber}, ${a.originalSupplierGstin}, ${t(
                  `mobile.gst.gstr1a.type.${a.amendmentType}`,
                )}, ${periodToShortLabel(a.period)}, ${t(`mobile.gst.gstr1a.status.${a.status}`)}`}
                testID={`gstr1a-row-${a.id}`}
              >
                <View style={styles.rowBetween}>
                  <Text style={styles.mono}>{a.originalInvoiceNumber}</Text>
                  <Gstr1aStatusBadge status={a.status} />
                </View>
                <Text style={styles.monoSmall}>{a.originalSupplierGstin}</Text>
                <View style={styles.tagRow}>
                  <View style={styles.typeTag}>
                    <Text style={styles.typeTagText}>
                      {t(`mobile.gst.gstr1a.type.${a.amendmentType}`)}
                    </Text>
                  </View>
                  <Text style={styles.meta}>{periodToShortLabel(a.period)}</Text>
                </View>
                <View style={styles.metaRow}>
                  <Text style={styles.meta}>
                    {t('mobile.gst.gstr1a.col.arn')}: {a.arnNumber ?? '—'}
                  </Text>
                  <Text style={styles.meta}>
                    {t('mobile.gst.gstr1a.col.filed')}:{' '}
                    {a.filedAt
                      ? formatDateDDMMYYYY(a.filedAt)
                      : t('mobile.gst.gstr1a.notFiled')}
                  </Text>
                </View>
              </View>
            ))
          )}
          <View style={styles.bottomSpacer} />
        </ScrollView>
      )}

      {/* Create amendment sheet (spec §9.3 — draft workflow) */}
      <Modal
        visible={createVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCreateVisible(false)}
      >
        <View style={styles.backdrop}>
          <Pressable
            style={styles.backdropTouch}
            onPress={() => setCreateVisible(false)}
            accessibilityLabel={t('mobile.common.close')}
          />
          <View style={styles.sheet} accessibilityViewIsModal>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.sheetTitle} accessibilityRole="header">
                {t('mobile.gst.gstr1a.create.cta')}
              </Text>
              <Text style={styles.draftNote}>{t('mobile.gst.gstr1a.create.draftNote')}</Text>

              <Text style={styles.fieldLabel}>{t('mobile.gst.gstr1a.create.typeLabel')}</Text>
              {AMENDMENT_TYPES.map((type) => {
                const active = amendmentType === type;
                return (
                  <Pressable
                    key={type}
                    style={[styles.typeOption, active && styles.typeOptionActive]}
                    onPress={() => setAmendmentType(type)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active }}
                    accessibilityLabel={t(`mobile.gst.gstr1a.type.${type}`)}
                    testID={`gstr1a-type-${type}`}
                  >
                    <Ionicons
                      name={active ? 'radio-button-on' : 'radio-button-off'}
                      size={18}
                      color={active ? tokens.brandFg : tokens.textSecondary}
                    />
                    <Text style={[styles.typeOptionText, active && styles.typeOptionTextActive]}>
                      {t(`mobile.gst.gstr1a.type.${type}`)}
                    </Text>
                  </Pressable>
                );
              })}

              <Text style={styles.fieldLabel}>
                {t('mobile.gst.gstr1a.create.originalInvoice')}
              </Text>
              <TextInput
                style={[styles.input, !!prefill && styles.inputReadOnly]}
                value={invoiceNumber}
                onChangeText={setInvoiceNumber}
                editable={!prefill}
                placeholder={t('mobile.gst.gstr1a.create.originalInvoice')}
                placeholderTextColor={tokens.textTertiary}
                accessibilityLabel={t('mobile.gst.gstr1a.create.originalInvoice')}
                testID="gstr1a-invoice-number"
              />

              <Text style={styles.fieldLabel}>
                {t('mobile.gst.gstr1a.create.supplierGstin')}
              </Text>
              <TextInput
                style={[styles.input, styles.monoInput, !!prefill && styles.inputReadOnly]}
                value={supplierGstin}
                onChangeText={(v) => setSupplierGstin(v.toUpperCase())}
                editable={!prefill}
                autoCapitalize="characters"
                maxLength={15}
                placeholder={t('mobile.gst.gstr1a.create.supplierGstin')}
                placeholderTextColor={tokens.textTertiary}
                accessibilityLabel={t('mobile.gst.gstr1a.create.supplierGstin')}
                testID="gstr1a-supplier-gstin"
              />

              <Text style={styles.fieldLabel}>{t('mobile.gst.ims.period.label')}</Text>
              <TextInput
                style={[styles.input, styles.inputReadOnly]}
                value={periodToShortLabel(period)}
                editable={false}
                accessibilityLabel={`${t('mobile.gst.ims.period.label')}: ${periodToShortLabel(period)}`}
              />

              {/* Corrected figures → amendmentPayloadJson */}
              <Text style={styles.fieldLabel}>
                {t('mobile.gst.gstr1a.create.correctedFigures')}
              </Text>
              {(
                [
                  ['gstr1a-taxable', t('mobile.gst.ims.col.taxableValue'), taxable, setTaxable],
                  ['gstr1a-igst', t('mobile.gst.ims.detail.igst'), igst, setIgst],
                  ['gstr1a-cgst', t('mobile.gst.ims.detail.cgst'), cgst, setCgst],
                  ['gstr1a-sgst', t('mobile.gst.ims.detail.sgst'), sgst, setSgst],
                  ['gstr1a-cess', t('mobile.gst.ims.detail.cess'), cess, setCess],
                ] as [string, string, string, (v: string) => void][]
              ).map(([key, label, value, setter]) => (
                <View key={key} style={styles.amountRow}>
                  <Text style={styles.amountLabel}>{label}</Text>
                  <TextInput
                    style={[styles.input, styles.amountInput]}
                    value={value}
                    onChangeText={(v) => setter(v.replace(/[^0-9.]/g, ''))}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor={tokens.textTertiary}
                    accessibilityLabel={label}
                    testID={key}
                  />
                </View>
              ))}

              <View style={styles.sheetButtons}>
                <Button
                  label={t('mobile.common.cancel')}
                  variant="secondary"
                  onPress={() => setCreateVisible(false)}
                  disabled={createMutation.isPending}
                  style={styles.flexBtn}
                />
                <Button
                  label={t('mobile.gst.gstr1a.create.submit')}
                  variant="primary"
                  loading={createMutation.isPending}
                  disabled={!formValid || createMutation.isPending}
                  onPress={() => createMutation.mutate()}
                  style={styles.flexBtn}
                  testID="gstr1a-create-submit"
                />
              </View>
              {createMutation.isError ? (
                <Text style={styles.errorText} accessibilityLiveRegion="assertive">
                  {t('mobile.gst.ims.error.actionFailed')}
                </Text>
              ) : null}
              {createMutation.isSuccess ? (
                <Text style={styles.successText} accessibilityLiveRegion="polite">
                  {t('mobile.gst.gstr1a.create.success')}
                </Text>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
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
    headerTitle: { fontSize: 17, fontWeight: '800', color: tk.textPrimary },
    chipScroller: { maxHeight: 64, flexGrow: 0 },
    chipRow: { gap: 8, padding: 16, paddingBottom: 8, alignItems: 'center' },
    chip: {
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: 14,
      borderRadius: 22,
      backgroundColor: tk.sunken,
      borderWidth: 1,
      borderColor: tk.border,
    },
    chipActive: { backgroundColor: tk.gstAccent, borderColor: tk.gstAccent },
    chipText: { fontSize: 13, fontWeight: '600', color: tk.textSecondary },
    chipTextActive: { color: '#FFFFFF' },
    centerWrap: { alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 48 },
    stateText: {
      fontSize: 14,
      color: tk.textSecondary,
      textAlign: 'center',
      lineHeight: 21,
      paddingHorizontal: 24,
    },
    emptyIcon: {
      width: 72,
      height: 72,
      borderRadius: 20,
      backgroundColor: tk.gstAccent + '15',
      alignItems: 'center',
      justifyContent: 'center',
    },
    listContent: { padding: 16, paddingTop: 8 },
    card: {
      backgroundColor: tk.raised,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: tk.border,
      padding: 14,
      marginBottom: 12,
      gap: 6,
      ...tk.elevation1,
    },
    rowBetween: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
    },
    mono: {
      fontSize: 14,
      fontWeight: '700',
      color: tk.textPrimary,
      fontFamily: Platform.OS === 'ios' ? 'SF Mono' : 'monospace',
    },
    monoSmall: {
      fontSize: 12,
      color: tk.textSecondary,
      fontFamily: Platform.OS === 'ios' ? 'SF Mono' : 'monospace',
    },
    tagRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    typeTag: {
      backgroundColor: tk.brandTint,
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    typeTagText: { fontSize: 11, fontWeight: '700', color: tk.brandFg },
    metaRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
    meta: { fontSize: 12, color: tk.textSecondary },
    bottomSpacer: { height: 60 },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.55)',
      justifyContent: 'flex-end',
    },
    backdropTouch: { flex: 1 },
    sheet: {
      backgroundColor: tk.raised,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 20,
      paddingBottom: 32,
      maxHeight: '88%',
      ...tk.elevation3,
    },
    sheetTitle: { fontSize: 18, fontWeight: '800', color: tk.textPrimary, marginBottom: 6 },
    draftNote: { fontSize: 13, color: tk.textSecondary, lineHeight: 19, marginBottom: 10 },
    fieldLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: tk.textPrimary,
      marginTop: 12,
      marginBottom: 6,
    },
    typeOption: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: tk.border,
      marginBottom: 6,
      backgroundColor: tk.inputBg,
    },
    typeOptionActive: { borderColor: tk.brandFg, backgroundColor: tk.brandTint },
    typeOptionText: { fontSize: 14, color: tk.textSecondary, flex: 1 },
    typeOptionTextActive: { color: tk.brandFg, fontWeight: '700' },
    input: {
      minHeight: 44,
      borderWidth: 1,
      borderColor: tk.border,
      borderRadius: 12,
      backgroundColor: tk.inputBg,
      color: tk.textPrimary,
      paddingHorizontal: 12,
      fontSize: 14,
    },
    inputReadOnly: { opacity: 0.75, backgroundColor: tk.sunken },
    monoInput: { fontFamily: Platform.OS === 'ios' ? 'SF Mono' : 'monospace' },
    amountRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 8,
    },
    amountLabel: { flex: 1, fontSize: 13, color: tk.textSecondary },
    amountInput: { width: 140, textAlign: 'right', fontVariant: ['tabular-nums'] },
    sheetButtons: { flexDirection: 'row', gap: 12, marginTop: 18 },
    flexBtn: { flex: 1 },
    errorText: { marginTop: 10, fontSize: 13, fontWeight: '600', color: tk.errorFg },
    successText: { marginTop: 10, fontSize: 13, fontWeight: '600', color: tk.successFg },
  }),
);
