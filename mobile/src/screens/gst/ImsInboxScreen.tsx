/**
 * ImsInboxScreen (IMS-M1) — GSTN Invoice Management System inbox.
 * GAP-101 / board #32 · Spec: docs/design/ims-inbox-spec.md (§1.2, §2, §3, §4,
 * §6, §7, §10). Mandatory regulatory surface from 1 Apr 2026.
 *
 * - Summary header: period pills (MMYYYY ↔ "March 2026"), 2×2 status KPI grid,
 *   Sync from GSTN + last-synced, deemed-acceptance banner.
 * - List: ImsInvoiceCard rows, status chips filter, debounced search,
 *   load-more pagination, select mode with bulk actions (cap 100, pre-flight
 *   eligibility filter), optimistic accept/keep + refetch reject, 5s undo.
 * - a11y: composed SR labels, polite live region + announcements, ≥44pt.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
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
  currentOpenImsPeriod,
  daysUntilDate,
  formatDateDDMMMYYYY,
  formatTimestampIST,
  lastPeriods,
  periodToLabel,
} from '../../lib/imsPeriod';
import {
  actOnImsInvoice,
  bulkActOnImsInvoices,
  getImsSummary,
  listImsInvoices,
  syncImsInvoices,
  type ImsAction,
  type ImsBulkActionResponse,
  type ImsInvoiceListResponse,
  type ImsInvoiceStatus,
  type ImsInvoiceSummary,
  type ImsSummary,
} from '../../api/gstIms';
import { ImsInvoiceCard, legalImsActions } from '../../components/gst/ImsInvoiceCard';
import { RejectReasonSheet } from '../../components/gst/RejectReasonSheet';
import { ImsEducationSheet } from '../../components/gst/ImsEducationSheet';
import { ImsUndoToast } from '../../components/gst/ImsUndoToast';
import type { GstStackParamList } from '../../navigation/GstStack';

type NavProp = NativeStackNavigationProp<GstStackParamList, 'ImsInbox'>;
type RoutePropType = RouteProp<GstStackParamList, 'ImsInbox'>;

interface Props {
  navigation: NavProp;
  route: RoutePropType;
}

export const IMS_BULK_CAP = 100;
const PAGE_SIZE = 20;

type StatusFilter = 'ALL' | ImsInvoiceStatus;

// ── Session-scoped state (spec §2.3: last-synced per (org, period); §2.1:
// persist last-selected period in session; §2.4: banner dismissed per session).
const lastSyncedAt = new Map<string, Date>();
let sessionPeriod: string | null = null;
const dismissedBanners = new Set<string>();

interface ToastState {
  message: string;
  onUndo?: () => void;
}

export function ImsInboxScreen({ navigation, route }: Props) {
  useSensitiveScreen();
  const { t } = useTranslation();
  const { tokens } = useTheme();
  const styles = useStyles();
  const qc = useQueryClient();
  const srEnabled = useScreenReaderEnabled();

  const organization = useAuthStore((s) => s.currentOrganization);
  const user = useAuthStore((s) => s.user);
  const orgId = organization?.id ?? '';
  const gstin = organization?.gstin ?? '';
  const userId = user?.id ?? '';

  const periods = useMemo(() => lastPeriods(12), []);
  const [period, setPeriod] = useState<string>(
    () => route.params?.period ?? sessionPeriod ?? currentOpenImsPeriod(),
  );
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [rejectTarget, setRejectTarget] = useState<ImsInvoiceSummary | 'bulk' | null>(null);
  const [eduVisible, setEduVisible] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [liveMessage, setLiveMessage] = useState('');
  const [bannerTick, setBannerTick] = useState(0);
  const [syncTick, setSyncTick] = useState(0);

  // Debounce search 300ms (spec §3.2)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    sessionPeriod = period;
  }, [period]);

  const announce = useCallback(
    (message: string) => {
      setLiveMessage(message);
      if (srEnabled) AccessibilityInfo.announceForAccessibility(message);
    },
    [srEnabled],
  );

  // ── Queries ────────────────────────────────────────────────────────────────

  const summaryQuery = useQuery<ImsSummary>({
    queryKey: ['ims-summary', orgId, period],
    queryFn: () => getImsSummary(orgId, period),
    enabled: !!orgId,
  });

  const listKey = ['ims-invoices', orgId, period, statusFilter, debouncedSearch];
  const listQuery = useInfiniteQuery({
    queryKey: listKey,
    queryFn: ({ pageParam }) =>
      listImsInvoices({
        organizationId: orgId,
        period,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        search: debouncedSearch || undefined,
        page: pageParam as number,
        pageSize: PAGE_SIZE,
      }),
    initialPageParam: 1,
    getNextPageParam: (last: ImsInvoiceListResponse) =>
      last.page * last.pageSize < last.totalCount ? last.page + 1 : undefined,
    enabled: !!orgId,
  });

  const invoices = useMemo(
    () => (listQuery.data?.pages ?? []).flatMap((p) => p.items),
    [listQuery.data],
  );
  const invoiceById = useMemo(() => {
    const map = new Map<string, ImsInvoiceSummary>();
    invoices.forEach((i) => map.set(i.id, i));
    return map;
  }, [invoices]);

  const summary = summaryQuery.data;
  const windowPast = summary?.gstr2bGenerationPast ?? false;
  const daysLeft = summary ? daysUntilDate(summary.gstr2bGenerationDeadline) : 99;

  const refetchAll = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['ims-invoices', orgId, period] });
    void qc.invalidateQueries({ queryKey: ['ims-summary', orgId, period] });
  }, [qc, orgId, period]);

  // ── Error helper ───────────────────────────────────────────────────────────

  const describeActionError = useCallback(
    (err: unknown, action: ImsAction, invoice?: ImsInvoiceSummary): string => {
      const resp = (err as { response?: { status?: number; data?: { error?: string; code?: string } } })
        ?.response;
      if (resp?.status === 409 || resp?.data?.code === 'ImsInvoice.InvalidTransition') {
        return t('mobile.gst.ims.error.alreadySettled', {
          status: invoice ? t(`mobile.gst.ims.status.${invoice.status}`) : '',
          action: t(`mobile.gst.ims.status.${action}`),
        });
      }
      return resp?.data?.error ?? t('mobile.gst.ims.error.actionFailed');
    },
    [t],
  );

  // ── Sync (spec §2.3) ───────────────────────────────────────────────────────

  const syncMutation = useMutation({
    mutationFn: () => syncImsInvoices({ organizationId: orgId, gstin, period }),
    onSuccess: (res) => {
      lastSyncedAt.set(`${orgId}:${period}`, new Date());
      setSyncTick((n) => n + 1);
      const msg = t('mobile.gst.ims.sync.success', {
        inserted: res.inserted,
        skipped: res.skipped,
      });
      setToast({ message: msg });
      announce(msg);
      refetchAll();
    },
    onError: (err: unknown) => {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const serverMsg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? '';
      const msg =
        status === 429
          ? t('mobile.gst.ims.sync.rateLimited')
          : t('mobile.gst.ims.sync.error', { message: serverMsg });
      setToast({ message: msg });
      announce(msg);
    },
  });

  // ── Single actions (spec §6.1–6.3, §6.6) ───────────────────────────────────

  const setInvoiceStatusInCache = useCallback(
    (invoiceId: string, status: ImsInvoiceStatus) => {
      qc.setQueriesData<{ pages: ImsInvoiceListResponse[]; pageParams: unknown[] }>(
        { queryKey: ['ims-invoices', orgId, period] },
        (data) =>
          data
            ? {
                ...data,
                pages: data.pages.map((page) => ({
                  ...page,
                  items: page.items.map((i) =>
                    i.id === invoiceId ? { ...i, status, deemedAccepted: false } : i,
                  ),
                })),
              }
            : data,
      );
    },
    [qc, orgId, period],
  );

  const undoAction = useCallback(
    (invoiceId: string) => {
      // Undo = re-action to PENDING_KEPT (no API transition to raw PENDING, §6.6)
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
        .catch(() => {
          setToast({ message: t('mobile.gst.ims.error.actionFailed') });
        })
        .finally(refetchAll);
    },
    [orgId, userId, t, announce, refetchAll],
  );

  const singleActionMutation = useMutation({
    mutationFn: ({
      invoice,
      action,
      reason,
    }: {
      invoice: ImsInvoiceSummary;
      action: ImsAction;
      reason?: string;
    }) =>
      actOnImsInvoice(invoice.id, {
        organizationId: orgId,
        actionedBy: userId,
        action,
        reason,
      }),
    onMutate: ({ invoice, action }) => {
      // Optimistic flip for accept / keep-pending only; reject reconciles via refetch (§6.6)
      if (action === 'ACCEPTED' || action === 'PENDING_KEPT') {
        setInvoiceStatusInCache(invoice.id, action);
      }
    },
    onSuccess: (_res, { invoice, action }) => {
      const msg =
        action === 'ACCEPTED'
          ? t('mobile.gst.ims.accept.success', { invoiceNumber: invoice.invoiceNumber })
          : action === 'REJECTED'
            ? t('mobile.gst.ims.reject.success', { invoiceNumber: invoice.invoiceNumber })
            : t('mobile.gst.ims.keepPending.success', { invoiceNumber: invoice.invoiceNumber });
      announce(msg);
      // 5s undo only while the window is still open (§6.6)
      setToast({
        message: msg,
        onUndo: windowPast ? undefined : () => undoAction(invoice.id),
      });
      if (action === 'REJECTED') setRejectTarget(null);
      refetchAll();
    },
    onError: (err, { invoice, action }) => {
      const msg = describeActionError(err, action, invoice);
      setToast({ message: msg });
      announce(msg);
      if (action === 'REJECTED') setRejectTarget(null);
      refetchAll(); // roll back any optimistic change
    },
  });

  // ── Bulk actions (spec §6.4) ───────────────────────────────────────────────

  const bulkMutation = useMutation({
    mutationFn: (items: { invoiceId: string; action: ImsAction; reason?: string }[]) =>
      bulkActOnImsInvoices({ organizationId: orgId, actionedBy: userId, items }),
    onSuccess: (res: ImsBulkActionResponse) => {
      const msg = t('mobile.gst.ims.bulk.result', {
        changed: res.changed,
        skipped: res.skipped,
        failed: res.failed,
      });
      setToast({ message: msg }); // no bulk undo (§6.6)
      announce(msg);
      if (res.failed > 0) {
        const failedLines = res.results
          .filter((r) => !r.success)
          .map((r) => {
            const inv = invoiceById.get(r.invoiceId);
            return `${inv?.invoiceNumber ?? r.invoiceId}: ${r.errorMessage ?? r.errorCode ?? ''}`;
          })
          .join('\n');
        Alert.alert(t('mobile.gst.ims.bulk.failedTitle'), failedLines);
      }
      setSelectionMode(false);
      setSelectedIds(new Set());
      setRejectTarget(null);
      refetchAll();
    },
    onError: () => {
      const msg = t('mobile.gst.ims.error.actionFailed');
      setToast({ message: msg });
      announce(msg);
      setRejectTarget(null);
    },
  });

  const eligibleForBulk = useCallback(
    (action: ImsAction): { eligible: ImsInvoiceSummary[]; skipped: number } => {
      const selected = [...selectedIds]
        .map((id) => invoiceById.get(id))
        .filter((i): i is ImsInvoiceSummary => !!i);
      const eligible = selected.filter((i) => {
        const legal = legalImsActions(i.status, windowPast);
        if (action === 'ACCEPTED') return legal.accept;
        if (action === 'REJECTED') return legal.reject;
        return legal.keepPending;
      });
      return { eligible, skipped: selected.length - eligible.length };
    },
    [selectedIds, invoiceById, windowPast],
  );

  const startBulk = useCallback(
    (action: ImsAction) => {
      if (selectedIds.size > IMS_BULK_CAP) return; // submit disabled in UI too
      const { eligible, skipped } = eligibleForBulk(action);
      if (eligible.length === 0) {
        Alert.alert(t('mobile.gst.ims.bulk.noneEligible'));
        return;
      }
      if (action === 'REJECTED') {
        setRejectTarget('bulk');
        return;
      }
      const actionLabel = t(`mobile.gst.ims.status.${action}`);
      Alert.alert(
        t('mobile.gst.ims.bulk.confirmTitle'),
        t('mobile.gst.ims.bulk.preflight', {
          change: eligible.length,
          action: actionLabel,
          skip: skipped,
        }),
        [
          { text: t('mobile.common.cancel'), style: 'cancel' },
          {
            text: actionLabel,
            onPress: () =>
              bulkMutation.mutate(eligible.map((i) => ({ invoiceId: i.id, action }))),
          },
        ],
      );
    },
    [selectedIds, eligibleForBulk, t, bulkMutation],
  );

  // ── Row handlers ───────────────────────────────────────────────────────────

  const goToGstr1a = useCallback(
    (invoice: ImsInvoiceSummary) => {
      navigation.navigate('Gstr1aAmendments', {
        prefill: {
          originalImsInvoiceId: invoice.id,
          originalInvoiceNumber: invoice.invoiceNumber,
          originalSupplierGstin: invoice.supplierGstin,
          period: invoice.period,
        },
      });
    },
    [navigation],
  );

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ── Filter helpers ─────────────────────────────────────────────────────────

  const statusFilters: { key: StatusFilter; label: string; count?: number }[] = [
    { key: 'ALL', label: t('mobile.gst.ims.filter.all'), count: summary?.total },
    { key: 'PENDING', label: t('mobile.gst.ims.status.PENDING'), count: summary?.pending },
    { key: 'ACCEPTED', label: t('mobile.gst.ims.status.ACCEPTED'), count: summary?.accepted },
    { key: 'REJECTED', label: t('mobile.gst.ims.status.REJECTED'), count: summary?.rejected },
    {
      key: 'PENDING_KEPT',
      label: t('mobile.gst.ims.status.PENDING_KEPT'),
      count: summary?.pendingKept,
    },
  ];

  const applyStatusFilter = useCallback(
    (key: StatusFilter) => {
      setStatusFilter(key);
      const label =
        key === 'ALL' ? t('mobile.gst.ims.filter.all') : t(`mobile.gst.ims.status.${key}`);
      announce(
        t('mobile.gst.ims.announce.filtered', {
          status: label,
          period: periodToLabel(period),
        }),
      );
    },
    [announce, t, period],
  );

  // ── Banner (spec §2.4) ─────────────────────────────────────────────────────

  const pendingTotal = (summary?.pending ?? 0) + (summary?.pendingKept ?? 0);
  const bannerKind: 'warning' | 'info' | null = summary
    ? windowPast
      ? 'info'
      : pendingTotal > 0
        ? 'warning'
        : null
    : null;
  const bannerKey = `${orgId}:${period}:${bannerKind ?? ''}`;
  const bannerVisible =
    bannerKind !== null && !dismissedBanners.has(bannerKey) && bannerTick >= 0;

  const dismissBanner = useCallback(() => {
    dismissedBanners.add(bannerKey);
    setBannerTick((n) => n + 1);
  }, [bannerKey]);

  // ── Derived UI state ───────────────────────────────────────────────────────

  const synced = syncTick >= 0 ? lastSyncedAt.get(`${orgId}:${period}`) : undefined;
  const neverSynced = !synced;
  const hasFilters = statusFilter !== 'ALL' || debouncedSearch.length > 0;
  const isInitialLoading = summaryQuery.isLoading || listQuery.isLoading;
  const overCap = selectedIds.size > IMS_BULK_CAP;

  const bulkRejectInfo = rejectTarget === 'bulk' ? eligibleForBulk('REJECTED') : null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          style={styles.headerBtn}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel={t('mobile.common.back')}
          hitSlop={8}
        >
          <Ionicons name="arrow-back" size={22} color={tokens.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('mobile.gst.ims.nav.title')}</Text>
        <View style={styles.headerRight}>
          <Pressable
            style={styles.headerBtn}
            onPress={() => navigation.navigate('Gstr1aAmendments', {})}
            accessibilityRole="button"
            accessibilityLabel={t('mobile.gst.gstr1a.nav.title')}
            hitSlop={8}
            testID="ims-gstr1a-nav"
          >
            <Ionicons name="document-text-outline" size={20} color={tokens.textPrimary} />
          </Pressable>
          <Pressable
            style={[styles.headerBtn, selectionMode && styles.headerBtnActive]}
            onPress={() => {
              setSelectionMode((m) => !m);
              setSelectedIds(new Set());
            }}
            accessibilityRole="button"
            accessibilityLabel={t('mobile.gst.ims.bulk.select')}
            accessibilityState={{ selected: selectionMode }}
            hitSlop={8}
            testID="ims-select-toggle"
          >
            <Ionicons
              name="checkbox-outline"
              size={20}
              color={selectionMode ? tokens.brandFg : tokens.textPrimary}
            />
          </Pressable>
        </View>
      </View>

      {/* Hidden polite live region (a11y 4.1.3) */}
      <Text
        style={styles.liveRegion}
        accessibilityLiveRegion="polite"
        testID="ims-live-region"
      >
        {liveMessage}
      </Text>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={listQuery.isRefetching && !listQuery.isFetchingNextPage}
            onRefresh={refetchAll}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Period selector (spec §2.1) */}
        <Text style={styles.fieldLabel}>{t('mobile.gst.ims.period.label')}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.periodRow}
        >
          {periods.map((p, idx) => {
            const active = p === period;
            return (
              <Pressable
                key={p}
                style={[styles.periodPill, active && styles.periodPillActive]}
                onPress={() => setPeriod(p)}
                accessibilityRole="button"
                accessibilityLabel={
                  idx === 0
                    ? `${periodToLabel(p)}, ${t('mobile.gst.ims.period.current')}`
                    : periodToLabel(p)
                }
                accessibilityState={{ selected: active }}
                testID={`ims-period-${p}`}
              >
                <Text style={[styles.periodPillText, active && styles.periodPillTextActive]}>
                  {periodToLabel(p)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Sync row (spec §2.3) */}
        <View style={styles.syncRow}>
          <Pressable
            style={[styles.syncBtn, syncMutation.isPending && styles.syncBtnBusy]}
            onPress={() => {
              if (!syncMutation.isPending) syncMutation.mutate();
            }}
            disabled={syncMutation.isPending}
            accessibilityRole="button"
            accessibilityLabel={t('mobile.gst.ims.sync.button')}
            accessibilityHint={t('mobile.gst.ims.sync.hint')}
            accessibilityState={{ busy: syncMutation.isPending, disabled: syncMutation.isPending }}
            testID="ims-sync-button"
          >
            {syncMutation.isPending ? (
              <ActivityIndicator size="small" color={tokens.brandFg} />
            ) : (
              <Ionicons name="sync" size={16} color={tokens.brandFg} />
            )}
            <Text style={styles.syncBtnText}>{t('mobile.gst.ims.sync.button')}</Text>
          </Pressable>
          <Text style={styles.lastSynced}>
            {synced
              ? t('mobile.gst.ims.sync.lastSynced', {
                  datetime: formatTimestampIST(synced),
                })
              : t('mobile.gst.ims.sync.never')}
          </Text>
        </View>

        {/* Deemed-acceptance banner (spec §2.4) */}
        {bannerVisible && summary ? (
          <View
            style={[
              styles.banner,
              bannerKind === 'warning' ? styles.bannerWarning : styles.bannerInfo,
            ]}
            testID={`ims-banner-${bannerKind}`}
          >
            <Ionicons
              name={bannerKind === 'warning' ? 'alert-circle' : 'information-circle'}
              size={18}
              color={bannerKind === 'warning' ? tokens.warningFg : tokens.infoFg}
            />
            <View style={styles.bannerBody}>
              <Text
                style={[
                  styles.bannerText,
                  { color: bannerKind === 'warning' ? tokens.warningFg : tokens.infoFg },
                ]}
              >
                {bannerKind === 'warning'
                  ? t('mobile.gst.ims.banner.actionRequired', {
                      date: formatDateDDMMMYYYY(summary.gstr2bGenerationDeadline),
                      count: pendingTotal,
                    })
                  : t('mobile.gst.ims.banner.windowPast', {
                      period: periodToLabel(period),
                    })}
              </Text>
              <Pressable
                onPress={() => setEduVisible(true)}
                accessibilityRole="button"
                accessibilityLabel={t('mobile.gst.ims.banner.learnMore')}
                style={styles.learnMoreBtn}
                testID="ims-learn-more"
              >
                <Text style={styles.learnMoreText}>
                  {t('mobile.gst.ims.banner.learnMore')}
                </Text>
              </Pressable>
            </View>
            <Pressable
              onPress={dismissBanner}
              accessibilityRole="button"
              accessibilityLabel={t('mobile.common.close')}
              hitSlop={8}
              style={styles.bannerClose}
              testID="ims-banner-dismiss"
            >
              <Ionicons name="close" size={16} color={tokens.textSecondary} />
            </Pressable>
          </View>
        ) : null}

        {/* KPI 2×2 grid (spec §2.2) */}
        {summaryQuery.isLoading ? (
          <View style={styles.kpiGrid}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={[styles.kpiCard, styles.kpiSkeleton]} />
            ))}
          </View>
        ) : summary ? (
          <>
            <View style={styles.kpiGrid}>
              <KpiCard
                label={t('mobile.gst.ims.summary.pending')}
                count={summary.pending}
                value={summary.totalPendingValue}
                fg={tokens.warningFg}
                bg={tokens.warningTint}
                border={tokens.warningTintBorder}
                active={statusFilter === 'PENDING'}
                onPress={() => applyStatusFilter('PENDING')}
                testID="ims-kpi-pending"
              />
              <KpiCard
                label={t('mobile.gst.ims.summary.accepted')}
                count={summary.accepted}
                value={summary.totalAcceptedValue}
                fg={tokens.successFg}
                bg={tokens.successTint}
                border={tokens.successTintBorder}
                active={statusFilter === 'ACCEPTED'}
                onPress={() => applyStatusFilter('ACCEPTED')}
                testID="ims-kpi-accepted"
              />
              <KpiCard
                label={t('mobile.gst.ims.summary.rejected')}
                count={summary.rejected}
                value={summary.totalRejectedValue}
                fg={tokens.errorFg}
                bg={tokens.errorTint}
                border={tokens.errorTintBorder}
                active={statusFilter === 'REJECTED'}
                onPress={() => applyStatusFilter('REJECTED')}
                testID="ims-kpi-rejected"
              />
              <KpiCard
                label={t('mobile.gst.ims.summary.pendingKept')}
                count={summary.pendingKept}
                fg={tokens.infoFg}
                bg={tokens.infoTint}
                border={tokens.border}
                active={statusFilter === 'PENDING_KEPT'}
                onPress={() => applyStatusFilter('PENDING_KEPT')}
                testID="ims-kpi-pendingKept"
              />
            </View>
            <Text style={styles.totalLine}>
              {t('mobile.gst.ims.summary.total', { count: summary.total })}
            </Text>
          </>
        ) : null}

        {/* Status filter chips (spec §3.2) */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {statusFilters.map((f) => {
            const active = statusFilter === f.key;
            return (
              <Pressable
                key={f.key}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => applyStatusFilter(f.key)}
                accessibilityRole="tab"
                accessibilityLabel={
                  f.count !== undefined ? `${f.label} (${f.count})` : f.label
                }
                accessibilityState={{ selected: active }}
                testID={`ims-filter-${f.key}`}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                  {f.count !== undefined ? `${f.label} (${f.count})` : f.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Search (spec §3.2) */}
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color={tokens.textSecondary} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder={t('mobile.gst.ims.filter.searchPlaceholder')}
            placeholderTextColor={tokens.textTertiary}
            accessibilityLabel={t('mobile.gst.ims.filter.searchPlaceholder')}
            testID="ims-search-input"
          />
          {hasFilters ? (
            <Pressable
              onPress={() => {
                setSearch('');
                setStatusFilter('ALL');
              }}
              accessibilityRole="button"
              accessibilityLabel={t('mobile.gst.ims.filter.clear')}
              hitSlop={8}
              testID="ims-clear-filters"
            >
              <Text style={styles.clearText}>{t('mobile.gst.ims.filter.clear')}</Text>
            </Pressable>
          ) : null}
        </View>

        {/* List body (spec §3, §7) */}
        {isInitialLoading ? (
          <View>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <View key={i} style={styles.skeletonCard} testID="ims-skeleton-card" />
            ))}
          </View>
        ) : listQuery.isError ? (
          <View style={styles.stateWrap}>
            <Ionicons name="alert-circle-outline" size={40} color={tokens.errorFg} />
            <Text style={styles.stateText}>{t('mobile.gst.ims.error.loadFailed')}</Text>
            <Pressable
              style={styles.retryBtn}
              onPress={refetchAll}
              accessibilityRole="button"
              accessibilityLabel={t('mobile.gst.ims.error.retry')}
            >
              <Text style={styles.retryText}>{t('mobile.gst.ims.error.retry')}</Text>
            </Pressable>
          </View>
        ) : invoices.length === 0 ? (
          <View style={styles.stateWrap} testID="ims-empty-state">
            <View style={styles.emptyIcon}>
              <Ionicons name="file-tray-outline" size={36} color={tokens.gstAccent} />
            </View>
            <Text style={styles.stateText}>
              {hasFilters
                ? t('mobile.gst.ims.empty.filtered', {
                    status:
                      statusFilter === 'ALL'
                        ? t('mobile.gst.ims.filter.all')
                        : t(`mobile.gst.ims.status.${statusFilter}`),
                  })
                : neverSynced
                  ? t('mobile.gst.ims.empty.neverSynced', { period: periodToLabel(period) })
                  : t('mobile.gst.ims.empty.noInvoices', { period: periodToLabel(period) })}
            </Text>
            {hasFilters ? (
              <Pressable
                style={styles.retryBtn}
                onPress={() => {
                  setSearch('');
                  setStatusFilter('ALL');
                }}
                accessibilityRole="button"
                accessibilityLabel={t('mobile.gst.ims.filter.clear')}
              >
                <Text style={styles.retryText}>{t('mobile.gst.ims.filter.clear')}</Text>
              </Pressable>
            ) : (
              <Pressable
                style={styles.retryBtn}
                onPress={() => syncMutation.mutate()}
                accessibilityRole="button"
                accessibilityLabel={t('mobile.gst.ims.sync.button')}
              >
                <Text style={styles.retryText}>{t('mobile.gst.ims.sync.button')}</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <>
            {invoices.map((invoice) => (
              <ImsInvoiceCard
                key={invoice.id}
                invoice={invoice}
                gstr2bGenerationPast={windowPast}
                daysLeft={daysLeft}
                selectionMode={selectionMode}
                selected={selectedIds.has(invoice.id)}
                onToggleSelect={() => toggleSelect(invoice.id)}
                onPress={() =>
                  navigation.navigate('ImsInvoiceDetail', { invoiceId: invoice.id })
                }
                onAccept={() =>
                  singleActionMutation.mutate({ invoice, action: 'ACCEPTED' })
                }
                onReject={() => setRejectTarget(invoice)}
                onKeepPending={() =>
                  singleActionMutation.mutate({ invoice, action: 'PENDING_KEPT' })
                }
                onFixViaGstr1a={() => goToGstr1a(invoice)}
                actionBusy={singleActionMutation.isPending || bulkMutation.isPending}
                testID={`ims-card-${invoice.id}`}
              />
            ))}
            {listQuery.hasNextPage ? (
              <Pressable
                style={styles.loadMoreBtn}
                onPress={() => void listQuery.fetchNextPage()}
                disabled={listQuery.isFetchingNextPage}
                accessibilityRole="button"
                accessibilityLabel={t('mobile.gst.ims.loadMore')}
                testID="ims-load-more"
              >
                {listQuery.isFetchingNextPage ? (
                  <ActivityIndicator size="small" color={tokens.brandFg} />
                ) : (
                  <Text style={styles.loadMoreText}>{t('mobile.gst.ims.loadMore')}</Text>
                )}
              </Pressable>
            ) : null}
          </>
        )}
        {/* Spacer so the bulk bar / toast never cover the last card */}
        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Bulk action bar (spec §6.4, §10.4) */}
      {selectionMode ? (
        <View style={styles.bulkBar} accessibilityLiveRegion="polite" testID="ims-bulk-bar">
          <Text style={styles.bulkCount}>
            {t('mobile.gst.ims.bulk.selectedCount', { count: selectedIds.size })}
          </Text>
          {overCap ? (
            <View style={styles.bulkCapWrap}>
              <Text style={styles.bulkCapText}>{t('mobile.gst.ims.bulk.cap')}</Text>
              <Pressable
                onPress={() =>
                  setSelectedIds(new Set([...selectedIds].slice(0, IMS_BULK_CAP)))
                }
                accessibilityRole="button"
                accessibilityLabel={t('mobile.gst.ims.bulk.keepFirst', { count: IMS_BULK_CAP })}
                style={styles.bulkCapBtn}
              >
                <Text style={styles.bulkCapBtnText}>
                  {t('mobile.gst.ims.bulk.keepFirst', { count: IMS_BULK_CAP })}
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.bulkBtnRow}>
              <BulkButton
                label={t('mobile.gst.ims.action.accept')}
                fg={tokens.successFg}
                bg={tokens.successTint}
                disabled={selectedIds.size === 0 || bulkMutation.isPending || windowPast}
                onPress={() => startBulk('ACCEPTED')}
                testID="ims-bulk-accept"
              />
              <BulkButton
                label={t('mobile.gst.ims.action.reject')}
                fg={tokens.errorFg}
                bg={tokens.errorTint}
                disabled={selectedIds.size === 0 || bulkMutation.isPending || windowPast}
                onPress={() => startBulk('REJECTED')}
                testID="ims-bulk-reject"
              />
              <BulkButton
                label={t('mobile.gst.ims.action.keepPending')}
                fg={tokens.infoFg}
                bg={tokens.infoTint}
                disabled={selectedIds.size === 0 || bulkMutation.isPending || windowPast}
                onPress={() => startBulk('PENDING_KEPT')}
                testID="ims-bulk-keep"
              />
            </View>
          )}
        </View>
      ) : null}

      {/* Reject reason sheet — single + bulk (spec §6.2/§6.4) */}
      <RejectReasonSheet
        visible={rejectTarget !== null}
        invoiceNumber={
          rejectTarget && rejectTarget !== 'bulk' ? rejectTarget.invoiceNumber : undefined
        }
        bulkEligibleCount={bulkRejectInfo?.eligible.length}
        bulkSkippedCount={bulkRejectInfo?.skipped}
        busy={singleActionMutation.isPending || bulkMutation.isPending}
        onConfirm={(reason) => {
          if (rejectTarget === 'bulk' && bulkRejectInfo) {
            bulkMutation.mutate(
              bulkRejectInfo.eligible.map((i) => ({
                invoiceId: i.id,
                action: 'REJECTED' as const,
                reason,
              })),
            );
          } else if (rejectTarget && rejectTarget !== 'bulk') {
            singleActionMutation.mutate({
              invoice: rejectTarget,
              action: 'REJECTED',
              reason,
            });
          }
        }}
        onClose={() => setRejectTarget(null)}
      />

      {/* Education sheet (spec §5) */}
      <ImsEducationSheet
        visible={eduVisible}
        deadline={summary?.gstr2bGenerationDeadline}
        onClose={() => setEduVisible(false)}
      />

      {/* Toast + undo (spec §6.6) */}
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
        testID="ims-toast"
      />
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  count,
  value,
  fg,
  bg,
  border,
  active,
  onPress,
  testID,
}: {
  label: string;
  count: number;
  value?: number;
  fg: string;
  bg: string;
  border: string;
  active: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const styles = useStyles();
  return (
    <Pressable
      style={[styles.kpiCard, { backgroundColor: bg, borderColor: border }, active && styles.kpiCardActive]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        value !== undefined ? `${label}: ${count}, ${formatINR(value)}` : `${label}: ${count}`
      }
      accessibilityState={{ selected: active }}
      testID={testID}
    >
      <Text style={[styles.kpiCount, { color: fg }]}>{count}</Text>
      <Text style={[styles.kpiLabel, { color: fg }]} numberOfLines={2}>
        {label}
      </Text>
      {value !== undefined ? (
        <Text style={[styles.kpiValue, { color: fg }]} numberOfLines={1}>
          {formatINR(value)}
        </Text>
      ) : null}
    </Pressable>
  );
}

function BulkButton({
  label,
  fg,
  bg,
  disabled,
  onPress,
  testID,
}: {
  label: string;
  fg: string;
  bg: string;
  disabled: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const styles = useStyles();
  return (
    <Pressable
      style={[styles.bulkBtn, { backgroundColor: bg }, disabled && styles.bulkBtnDisabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      testID={testID}
    >
      <Text style={[styles.bulkBtnText, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

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
    headerTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: tk.textPrimary,
      letterSpacing: -0.2,
    },
    headerRight: { flexDirection: 'row', gap: 8 },
    headerBtn: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: tk.sunken,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerBtnActive: {
      backgroundColor: tk.brandTint,
      borderWidth: 1,
      borderColor: tk.brandTintBorder,
    },
    liveRegion: {
      position: 'absolute',
      width: 1,
      height: 1,
      opacity: 0,
    },
    scrollContent: { padding: 16 },
    fieldLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: tk.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 8,
    },
    periodRow: { gap: 8, paddingBottom: 12 },
    periodPill: {
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: 14,
      borderRadius: 22,
      backgroundColor: tk.sunken,
      borderWidth: 1,
      borderColor: tk.border,
    },
    periodPillActive: {
      backgroundColor: tk.gstAccent + '22',
      borderColor: tk.gstAccent,
    },
    periodPillText: { fontSize: 13, fontWeight: '600', color: tk.textSecondary },
    periodPillTextActive: { color: tk.gstAccent, fontWeight: '700' },
    syncRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 12,
    },
    syncBtn: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      borderRadius: 12,
      backgroundColor: tk.brandTint,
      borderWidth: 1,
      borderColor: tk.brandTintBorder,
    },
    syncBtnBusy: { opacity: 0.7 },
    syncBtnText: { fontSize: 13, fontWeight: '700', color: tk.brandFg },
    // Last-synced is meaningful caption text — textSecondary ≥4.5:1 (a11y X-1)
    lastSynced: { flex: 1, fontSize: 12, color: tk.textSecondary },
    banner: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      borderRadius: 12,
      borderWidth: 1,
      padding: 12,
      marginBottom: 12,
    },
    bannerWarning: {
      backgroundColor: tk.warningTint,
      borderColor: tk.warningTintBorder,
    },
    bannerInfo: {
      backgroundColor: tk.infoTint,
      borderColor: tk.border,
    },
    bannerBody: { flex: 1, gap: 6 },
    bannerText: { fontSize: 13, fontWeight: '600', lineHeight: 19 },
    learnMoreBtn: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
    learnMoreText: {
      fontSize: 13,
      fontWeight: '800',
      color: tk.brandFg,
      textDecorationLine: 'underline',
    },
    bannerClose: {
      width: 32,
      height: 32,
      alignItems: 'center',
      justifyContent: 'center',
    },
    kpiGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginBottom: 8,
    },
    kpiCard: {
      width: '48%',
      flexGrow: 1,
      borderRadius: 14,
      borderWidth: 1,
      padding: 12,
      minHeight: 84,
    },
    kpiCardActive: { borderWidth: 2 },
    kpiSkeleton: { backgroundColor: tk.skeleton1, borderColor: tk.skeleton1 },
    kpiCount: { fontSize: 22, fontWeight: '800' },
    kpiLabel: { fontSize: 12, fontWeight: '700', marginTop: 2 },
    kpiValue: { fontSize: 12, fontWeight: '600', marginTop: 4, fontVariant: ['tabular-nums'] },
    totalLine: { fontSize: 12, color: tk.textSecondary, marginBottom: 12 },
    chipRow: { gap: 8, paddingBottom: 12 },
    filterChip: {
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: 14,
      borderRadius: 22,
      backgroundColor: tk.sunken,
      borderWidth: 1,
      borderColor: tk.border,
    },
    filterChipActive: { backgroundColor: tk.gstAccent, borderColor: tk.gstAccent },
    filterChipText: { fontSize: 13, fontWeight: '600', color: tk.textSecondary },
    filterChipTextActive: { color: '#FFFFFF' },
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: tk.inputBg,
      borderWidth: 1,
      borderColor: tk.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      minHeight: 44,
      marginBottom: 16,
    },
    searchInput: { flex: 1, fontSize: 14, color: tk.textPrimary, paddingVertical: 10 },
    clearText: { fontSize: 13, fontWeight: '700', color: tk.brandFg },
    skeletonCard: {
      height: 148,
      backgroundColor: tk.skeleton1,
      borderRadius: 16,
      marginBottom: 12,
    },
    stateWrap: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 48,
      gap: 12,
    },
    emptyIcon: {
      width: 72,
      height: 72,
      borderRadius: 20,
      backgroundColor: tk.gstAccent + '15',
      alignItems: 'center',
      justifyContent: 'center',
    },
    stateText: {
      fontSize: 14,
      color: tk.textSecondary,
      textAlign: 'center',
      lineHeight: 21,
      paddingHorizontal: 16,
    },
    retryBtn: {
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: 24,
      backgroundColor: tk.brandCta,
      borderRadius: 12,
    },
    retryText: { fontSize: 14, fontWeight: '700', color: tk.textOnBrand },
    loadMoreBtn: {
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: tk.border,
      backgroundColor: tk.raised,
      marginBottom: 12,
    },
    loadMoreText: { fontSize: 14, fontWeight: '700', color: tk.brandFg },
    bottomSpacer: { height: 96 },
    bulkBar: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: tk.raised,
      borderTopWidth: 1,
      borderTopColor: tk.border,
      padding: 12,
      paddingBottom: 24,
      gap: 8,
      ...tk.elevation3,
    },
    bulkCount: { fontSize: 13, fontWeight: '700', color: tk.textPrimary },
    bulkBtnRow: { flexDirection: 'row', gap: 8 },
    bulkBtn: {
      flex: 1,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 10,
      paddingHorizontal: 8,
    },
    bulkBtnDisabled: { opacity: 0.45 },
    bulkBtnText: { fontSize: 13, fontWeight: '700' },
    bulkCapWrap: { gap: 8 },
    bulkCapText: { fontSize: 13, fontWeight: '600', color: tk.errorFg },
    bulkCapBtn: {
      minHeight: 44,
      justifyContent: 'center',
      alignSelf: 'flex-start',
      paddingHorizontal: 14,
      borderRadius: 10,
      backgroundColor: tk.brandTint,
      borderWidth: 1,
      borderColor: tk.brandTintBorder,
    },
    bulkCapBtnText: { fontSize: 13, fontWeight: '700', color: tk.brandFg },
  }),
);
