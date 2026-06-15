/**
 * CallbackStatusScreen — Live status, reschedule/cancel, deep-link target.
 * Deep link: snapaccount://callbacks/{id}
 * Phase 6E — docs/design/mobile/callbacks/callback-status-screen.md
 */

import React, { useState } from 'react';
import {
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
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import { ErrorState } from '../../components/shared/ListStates';
import { useHaptics } from '../../hooks/useHaptics';
import {
  getCallback,
  rescheduleCallback,
  cancelCallback,
  addCallbackNote,
  type CallbackDetail,
  type CallbackStatus,
} from '../../api/callbacks';
import { Card } from '../../components/ui/Card';
import { StatusTimeline } from '../../components/shared/StatusTimeline';
import { useNowMs } from '../../hooks/useNowMs';
import type { MoreStackParamList } from '../../navigation/MoreStack';

type NavProp = NativeStackNavigationProp<MoreStackParamList, 'CallbackStatus'>;
type RouteProps = RouteProp<MoreStackParamList, 'CallbackStatus'>;
interface Props { navigation: NavProp; route: RouteProps }

// ─────────────────────────────────────────────────────────────────────────────
// Status hero config
// ─────────────────────────────────────────────────────────────────────────────

type HeroConfig = {
  icon: keyof typeof Ionicons.glyphMap;
  bg: string;
  iconColor: string;
};

const heroMapFor = (tk: ThemeTokens): Record<CallbackStatus, HeroConfig> => ({
  Pending:   { icon: 'time-outline', bg: tk.warningTint, iconColor: tk.warningFg },
  Assigned:  { icon: 'person-circle-outline', bg: tk.infoTint, iconColor: tk.infoFg },
  Confirmed: { icon: 'calendar-outline', bg: tk.infoTint, iconColor: tk.infoFg },
  Completed: { icon: 'checkmark-circle-outline', bg: tk.successTint, iconColor: tk.successFg },
  Escalated: { icon: 'arrow-up-circle-outline', bg: tk.errorTint, iconColor: tk.errorFg },
  Cancelled: { icon: 'close-circle-outline', bg: tk.sunken, iconColor: tk.textSecondary },
});

// ─────────────────────────────────────────────────────────────────────────────
// Category label (AND-15)
// ─────────────────────────────────────────────────────────────────────────────
//
// The backend serializes CallbackCategory as the enum's numeric value in some
// payloads (e.g. Gst → 1), so the raw `callback.category` cannot be rendered
// directly. Map numeric IDs and string names onto localized labels.
// Enum order mirrors backend CallbackService.Domain/Enums/CallbackCategory.cs.

const CATEGORY_ID_TO_SLUG: Record<number, string> = {
  0: 'general',
  1: 'gst',
  2: 'itr',
  3: 'loan',
  4: 'accounting',
  5: 'subscription',
  6: 'technical',
};

const KNOWN_CATEGORY_SLUGS = new Set(Object.values(CATEGORY_ID_TO_SLUG));

function getCategoryLabel(
  category: unknown,
  t: (k: string) => string,
): string {
  const raw = category == null ? '' : String(category);
  if (!raw) return '—';
  const slug = /^\d+$/.test(raw)
    ? CATEGORY_ID_TO_SLUG[Number(raw)]
    : KNOWN_CATEGORY_SLUGS.has(raw.toLowerCase())
      ? raw.toLowerCase()
      : undefined;
  // Unknown values (future categories) fall back to the raw string rather
  // than a broken i18n key.
  return slug ? t(`mobile.callback.status.category.${slug}`) : raw;
}

function formatISTTime(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();

  const timeStr = d.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
  });
  return isToday ? `${timeStr} today` : `${timeStr}, ${d.toLocaleDateString('en-IN')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hero copy
// ─────────────────────────────────────────────────────────────────────────────

function getHeroCopy(cb: CallbackDetail, t: (k: string, o?: Record<string, unknown>) => string): { primary: string; secondary: string } {
  const name = cb.assignedAgentName ?? '';
  const time = formatISTTime(cb.scheduledAt);

  switch (cb.status) {
    case 'Pending':
      return name
        ? { primary: t('mobile.callback.status.hero.pendingAssigned', { name }), secondary: t('mobile.callback.status.hero.pendingAssignedSub', { window: time ?? '—' }) }
        : { primary: t('mobile.callback.status.hero.pending'), secondary: t('mobile.callback.status.hero.pendingSub') };
    case 'Assigned':
    case 'Confirmed':
      return {
        primary: time ? t('mobile.callback.status.hero.scheduled', { time }) : t('mobile.callback.status.hero.pendingAssigned', { name }),
        secondary: name ? t('mobile.callback.status.hero.scheduledSub', { name }) : '',
      };
    case 'Completed':
      return { primary: t('mobile.callback.status.hero.completed'), secondary: t('mobile.callback.status.hero.completedSub', { duration: '—' }) };
    case 'Escalated':
      return { primary: t('mobile.callback.status.hero.escalated'), secondary: t('mobile.callback.status.hero.escalatedSub') };
    case 'Cancelled':
      return { primary: t('mobile.callback.status.hero.cancelled'), secondary: cb.cancelReason ?? '' };
    default:
      return { primary: '—', secondary: '' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reschedule modal (inline lightweight)
// ─────────────────────────────────────────────────────────────────────────────

function RescheduleModal({ callbackId, onDone, onClose }: {
  callbackId: string; onDone: () => void; onClose: () => void;
}) {
  const rsStyles = useRsStyles();
  const { t } = useTranslation();
  const [hour, setHour] = useState(10);

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      const now = new Date();
      const start = new Date(now);
      start.setDate(start.getDate() + 1);
      start.setHours(hour, 0, 0, 0);
      const end = new Date(start);
      end.setHours(hour + 2, 0, 0, 0);
      await rescheduleCallback(callbackId, start.toISOString(), end.toISOString());
    },
    onSuccess: () => { onDone(); onClose(); },
    onError: () => Alert.alert('Error', 'Reschedule failed. Please try again.'),
  });

  return (
    <View style={rsStyles.sheet}>
      <Text style={rsStyles.title}>{t('mobile.callback.status.actions.rescheduleTitle')}</Text>
      <Text style={rsStyles.label}>Choose start hour for tomorrow:</Text>
      <View style={rsStyles.hourRow}>
        {[9, 10, 11, 14, 15, 16, 17].map((h) => (
          <Pressable
            key={h}
            style={[rsStyles.hourChip, hour === h && rsStyles.hourChipActive]}
            onPress={() => setHour(h)}
          >
            <Text style={[rsStyles.hourText, hour === h && rsStyles.hourTextActive]}>{h}:00</Text>
          </Pressable>
        ))}
      </View>
      <View style={rsStyles.actions}>
        <Pressable style={rsStyles.cancelBtn} onPress={onClose}>
          <Text style={rsStyles.cancelBtnText}>Cancel</Text>
        </Pressable>
        <Pressable
          style={[rsStyles.submitBtn, isPending && rsStyles.submitBtnDisabled]}
          onPress={() => mutate()}
          disabled={isPending}
        >
          <Text style={rsStyles.submitBtnText}>
            {isPending ? 'Saving…' : t('mobile.callback.status.actions.rescheduleSubmit')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const useRsStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
  sheet: { padding: 20, backgroundColor: tk.raised, borderRadius: 16, gap: 12 },
  title: { fontSize: 17, fontWeight: '700', color: tk.textPrimary },
  label: { fontSize: 13, color: tk.textSecondary },
  hourRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hourChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, backgroundColor: tk.sunken, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  hourChipActive: { backgroundColor: tk.brandTint, borderColor: tk.brand400, borderWidth: 1 },
  hourText: { fontSize: 13, color: tk.textSecondary },
  hourTextActive: { color: tk.brandFg, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 12 },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: tk.border, borderRadius: 10, paddingVertical: 12, alignItems: 'center', minHeight: 48 },
  cancelBtnText: { fontSize: 14, color: tk.textSecondary },
  submitBtn: { flex: 1, backgroundColor: tk.brand500, borderRadius: 10, paddingVertical: 12, alignItems: 'center', minHeight: 48 },
  submitBtnDisabled: { backgroundColor: tk.border },
  submitBtnText: { fontSize: 14, fontWeight: '700', color: tk.textOnBrand },
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────

export function CallbackStatusScreen({ navigation, route }: Props) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const haptics = useHaptics();
  const { callbackId } = route.params;
  const queryClient = useQueryClient();
  // Refreshes every 30s so the stale-in-progress banner appears without a refetch.
  const nowMs = useNowMs(30_000);

  const [showReschedule, setShowReschedule] = useState(false);
  const [showAddContext, setShowAddContext] = useState(false);
  const [contextNote, setContextNote] = useState('');

  const {
    data: callback,
    isLoading,
    isError,
    refetch,
    isRefetching,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ['callback', callbackId],
    queryFn: () => getCallback(callbackId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      // Poll more frequently when in-progress
      if (status === 'Confirmed' || status === 'Assigned') return 30_000;
      return false; // Otherwise rely on push + manual refresh
    },
    staleTime: 5 * 60 * 1000,
  });

  const { mutate: doCancel, isPending: isCancelling } = useMutation({
    mutationFn: (reason?: string) => cancelCallback(callbackId, reason),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['callback', callbackId] }),
    onError: () => Alert.alert('Error', 'Cancel failed. Please try again.'),
  });

  const { mutate: doAddNote, isPending: isAddingNote } = useMutation({
    mutationFn: (content: string) => addCallbackNote(callbackId, content),
    onSuccess: () => {
      setShowAddContext(false);
      setContextNote('');
      queryClient.invalidateQueries({ queryKey: ['callback', callbackId] });
    },
    onError: () => Alert.alert('Error', 'Failed to add note. Please try again.'),
  });

  const handleCancel = () => {
    Alert.alert(
      t('mobile.callback.status.actions.cancelConfirmTitle'),
      t('mobile.callback.status.actions.cancelConfirmBody'),
      [
        { text: 'Back', style: 'cancel' },
        {
          text: t('mobile.callback.status.actions.cancelConfirmOk'),
          style: 'destructive',
          onPress: () => doCancel(undefined),
        },
      ],
    );
  };

  const staleMinutes = dataUpdatedAt
    ? Math.floor((nowMs - dataUpdatedAt) / 60_000)
    : null;
  const isStaleInProgress =
    callback?.status === 'Confirmed' && staleMinutes !== null && staleMinutes >= 2;

  // ── Loading state ─────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={8}>
            <Ionicons name="arrow-back" size={22} color={tokens.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('mobile.callback.status.title')}</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.loadingState}>
          <View style={styles.skeletonCircle} />
          <View style={styles.skeletonLine} />
          <View style={[styles.skeletonLine, { width: '60%', height: 14 }]} />
        </View>
      </SafeAreaView>
    );
  }

  // ── Error / not found ─────────────────────────────────────────────────────

  if (isError || !callback) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={8}>
            <Ionicons name="arrow-back" size={22} color={tokens.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('mobile.callback.status.title')}</Text>
          <View style={styles.headerSpacer} />
        </View>
        <ErrorState
          message={t('mobile.callback.status.notFound')}
          retryLabel={t('mobile.common.retry')}
          onRetry={() => void refetch()}
          secondaryLabel={t('mobile.callback.status.backHome')}
          onSecondaryPress={() => navigation.popToTop()}
          testID="callback-error-state"
        />
      </SafeAreaView>
    );
  }

  const heroMap = heroMapFor(tokens);
  const hero = heroMap[callback.status] ?? heroMap.Pending;
  const heroCopy = getHeroCopy(callback, t);

  const canReschedule = ['Pending', 'Assigned', 'Confirmed'].includes(callback.status);
  const canCancel = ['Pending', 'Assigned', 'Confirmed'].includes(callback.status);

  // ── Timeline steps ────────────────────────────────────────────────────────
  const timelineEvents = callback.notes.map((note) => ({
    id: note.id,
    label: note.content,
    status: 'completed' as const,
    timestamp: new Date(note.createdAt).toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
    }),
  }));

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={8} accessibilityRole="button">
          <Ionicons name="arrow-back" size={22} color={tokens.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('mobile.callback.status.title')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => {
              haptics.lightTap();
              void refetch();
            }}
            tintColor={tokens.brand500}
            colors={[tokens.brand500]}
          />
        }
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Stale refresh hint */}
        {isStaleInProgress && (
          <Pressable style={styles.refreshBanner} onPress={() => refetch()}>
            <Ionicons name="refresh-outline" size={14} color={tokens.brandCta} />
            <Text style={styles.refreshBannerText}>{t('mobile.callback.status.actions.refresh')}</Text>
          </Pressable>
        )}

        {/* Hero */}
        <View style={styles.hero}>
          <View style={[styles.heroGlyph, { backgroundColor: hero.bg }]}>
            <Ionicons name={hero.icon} size={44} color={hero.iconColor} />
          </View>
          <Text style={styles.heroPrimary}>{heroCopy.primary}</Text>
          {heroCopy.secondary ? (
            <Text style={styles.heroSecondary}>{heroCopy.secondary}</Text>
          ) : null}
          {callback.assignedAgentName && (
            <Text style={styles.heroAgent}>{callback.assignedAgentName}</Text>
          )}
          {/* Phone number row */}
          <View style={styles.phoneRow}>
            <Ionicons name="call-outline" size={14} color={tokens.textSecondary} />
            <Text style={styles.phoneLabel}>{t('mobile.callback.status.actions.phone')}</Text>
            <Text style={styles.phoneNumber}>{callback.phoneNumber}</Text>
          </View>
        </View>

        {/* Reschedule inline modal */}
        {showReschedule && (
          <RescheduleModal
            callbackId={callbackId}
            onDone={() => queryClient.invalidateQueries({ queryKey: ['callback', callbackId] })}
            onClose={() => setShowReschedule(false)}
          />
        )}

        {/* Timeline */}
        {timelineEvents.length > 0 && (
          <Card shadow="sm" padding="md" style={styles.timelineCard}>
            <StatusTimeline steps={timelineEvents} />
          </Card>
        )}

        {/* About card */}
        <Card shadow="sm" padding="md" style={styles.aboutCard}>
          <Text style={styles.aboutTitle}>{t('mobile.callback.status.about.title')}</Text>
          <View style={styles.aboutRow}>
            <Text style={styles.aboutKey}>{t('mobile.callback.status.about.category')}</Text>
            <Text style={styles.aboutVal}>{getCategoryLabel(callback.category, t)}</Text>
          </View>
          {callback.issueDescription && (
            <View style={styles.aboutRow}>
              <Text style={styles.aboutKey}>{t('mobile.callback.status.about.note')}</Text>
              <Text style={styles.aboutVal} numberOfLines={3}>{callback.issueDescription}</Text>
            </View>
          )}
        </Card>

        {/* Add context */}
        {showAddContext && (
          <Card shadow="sm" padding="md" style={styles.contextCard}>
            <Text style={styles.contextTitle}>{t('mobile.callback.status.actions.addContext')}</Text>
            <TextInput
              style={styles.contextInput}
              value={contextNote}
              onChangeText={setContextNote}
              placeholder="Add more details…"
              placeholderTextColor={tokens.textTertiary}
              multiline
              numberOfLines={3}
              maxLength={500}
            />
            <View style={styles.contextActions}>
              <Pressable
                style={styles.contextCancelBtn}
                onPress={() => { setShowAddContext(false); setContextNote(''); }}
              >
                <Text style={styles.contextCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.contextSubmitBtn, (!contextNote.trim() || isAddingNote) && styles.contextSubmitBtnDisabled]}
                onPress={() => contextNote.trim() && doAddNote(contextNote.trim())}
                disabled={!contextNote.trim() || isAddingNote}
              >
                <Text style={styles.contextSubmitText}>{isAddingNote ? 'Sending…' : 'Send'}</Text>
              </Pressable>
            </View>
          </Card>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          {canReschedule && !showReschedule && (
            <Pressable
              style={styles.rescheduleBtn}
              onPress={() => setShowReschedule(true)}
              accessibilityRole="button"
            >
              <Ionicons name="calendar-outline" size={18} color={tokens.brandCta} />
              <Text style={styles.rescheduleBtnText}>{t('mobile.callback.status.actions.reschedule')}</Text>
            </Pressable>
          )}

          {!showAddContext && (
            <Pressable
              style={styles.addContextBtn}
              onPress={() => setShowAddContext(true)}
              accessibilityRole="button"
            >
              <Ionicons name="chatbubble-outline" size={18} color={tokens.textSecondary} />
              <Text style={styles.addContextBtnText}>{t('mobile.callback.status.actions.addContext')}</Text>
            </Pressable>
          )}

          {canCancel && (
            <Pressable
              style={styles.cancelCallbackBtn}
              onPress={handleCancel}
              disabled={isCancelling}
              accessibilityRole="button"
            >
              <Ionicons name="close-circle-outline" size={18} color={tokens.errorFg} />
              <Text style={styles.cancelCallbackBtnText}>
                {isCancelling ? 'Cancelling…' : t('mobile.callback.status.actions.cancel')}
              </Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: tk.canvas },
  scrollContent: { padding: 16, gap: 16, paddingBottom: 40 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: tk.raised,
    borderBottomWidth: 1, borderBottomColor: tk.border,
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: tk.textPrimary },
  headerSpacer: { width: 44 },

  // Loading
  loadingState: { flex: 1, alignItems: 'center', gap: 16, paddingTop: 60 },
  skeletonCircle: { width: 96, height: 96, borderRadius: 48, backgroundColor: tk.sunken },
  skeletonLine: { width: '70%', height: 20, borderRadius: 8, backgroundColor: tk.sunken },

  // Error
  errorState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 },
  errorTitle: { fontSize: 16, color: tk.textSecondary, textAlign: 'center' },
  errorBackBtn: { paddingHorizontal: 24, paddingVertical: 12, backgroundColor: tk.brandCta, borderRadius: 10, minHeight: 44 },
  errorBackBtnText: { color: tk.textOnBrand, fontWeight: '700' },

  // Stale refresh
  refreshBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: tk.brandTint, borderRadius: 8,
    padding: 10, alignSelf: 'center',
  },
  refreshBannerText: { fontSize: 13, color: tk.brandCta, fontWeight: '600' },

  // Hero
  hero: { alignItems: 'center', gap: 8, paddingVertical: 24 },
  heroGlyph: {
    width: 96, height: 96, borderRadius: 48,
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  heroPrimary: { fontSize: 22, fontWeight: '800', color: tk.textPrimary, textAlign: 'center', letterSpacing: -0.3 },
  heroSecondary: { fontSize: 15, color: tk.textSecondary, textAlign: 'center', lineHeight: 22 },
  heroAgent: { fontSize: 13, color: tk.textSecondary, fontWeight: '500' },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  phoneLabel: { fontSize: 12, color: tk.textSecondary },
  phoneNumber: { fontSize: 13, fontWeight: '600', color: tk.textSecondary },

  // Timeline card
  timelineCard: { marginBottom: 0 },

  // About card
  aboutCard: { gap: 8 },
  aboutTitle: { fontSize: 14, fontWeight: '700', color: tk.textPrimary, marginBottom: 4 },
  aboutRow: { flexDirection: 'row', gap: 8 },
  aboutKey: { fontSize: 13, color: tk.textSecondary, width: 80 },
  aboutVal: { fontSize: 13, color: tk.textPrimary, flex: 1 },

  // Add context card
  contextCard: { gap: 10 },
  contextTitle: { fontSize: 14, fontWeight: '600', color: tk.textPrimary },
  contextInput: {
    borderWidth: 1, borderColor: tk.border, borderRadius: 10,
    padding: 12, fontSize: 14, color: tk.textPrimary,
    minHeight: 80, textAlignVertical: 'top',
  },
  contextActions: { flexDirection: 'row', gap: 10 },
  contextCancelBtn: { flex: 1, borderWidth: 1, borderColor: tk.border, borderRadius: 8, paddingVertical: 10, alignItems: 'center', minHeight: 44 },
  contextCancelText: { fontSize: 14, color: tk.textSecondary },
  contextSubmitBtn: { flex: 1, backgroundColor: tk.brand500, borderRadius: 8, paddingVertical: 10, alignItems: 'center', minHeight: 44 },
  contextSubmitBtnDisabled: { backgroundColor: tk.border },
  contextSubmitText: { fontSize: 14, fontWeight: '700', color: tk.textOnBrand },

  // Actions
  actions: { gap: 10 },
  rescheduleBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderColor: tk.brandTintBorder, borderRadius: 12,
    paddingVertical: 14, minHeight: 52,
    backgroundColor: tk.brandTint,
  },
  rescheduleBtnText: { fontSize: 15, fontWeight: '600', color: tk.brandCta },
  addContextBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 12, paddingVertical: 14, minHeight: 52,
  },
  addContextBtnText: { fontSize: 15, color: tk.textSecondary },
  cancelCallbackBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 12, paddingVertical: 14, minHeight: 52,
  },
  cancelCallbackBtnText: { fontSize: 15, color: tk.errorFg, fontWeight: '600' },
  }),
);
