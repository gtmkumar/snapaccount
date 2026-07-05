/**
 * QueueChip — compact header pill summarising the document upload queue.
 * DG-MOBUX-09 · docs/design/mobile/ux/offline-first-photo-capture.md §6.2 / §6.3 / §16.
 *
 * Live states (priority order):
 *   - "{{count}} failed"          (any FAILED items)     — error triangle.
 *   - "{{count}} waiting · offline" (offline w/ pending) — neutral cloud-off.
 *   - "Syncing {{count}}"          (active uploads)       — animated arrow.
 *   - "All synced"                 (queue empty)          — green check.
 *
 * Tap opens the QueueDetailSheet (bulk Retry-all / Delete-all-failed).
 *
 * Also owns two transient toasts (offline §6.3 / §12):
 *   - First-capture-while-offline hint, shown once-per-user (AsyncStorage flag).
 *   - "All documents synced" when the queue drains from non-empty → empty.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme, createThemedStyles, type ThemeTokens } from '../../contexts/ThemeContext';
import type { QueueItem } from '../../hooks/useDocumentQueue';
import { QueueDetailSheet } from './QueueDetailSheet';

/** Once-per-user flag: the first offline-capture hint has been shown. */
const OFFLINE_HINT_SHOWN_KEY = '@snapaccount/queue_offline_hint_shown';
const TOAST_DURATION_MS = 4000;

type ChipState = 'allSynced' | 'syncing' | 'offlineWaiting' | 'failed';

interface Props {
  /** Live queue (in-flight + failed items). READY+server items can be filtered by the caller. */
  queue: QueueItem[];
  /** Retry every retryable FAILED item (bulk). */
  onRetryAll: () => void;
  /** Remove every FAILED item (bulk). */
  onDeleteAllFailed: () => void;
  testID?: string;
}

export function QueueChip({ queue, onRetryAll, onDeleteAllFailed, testID }: Props) {
  const { tokens } = useTheme();
  const styles = useStyles();
  const { t } = useTranslation();
  const [isOffline, setIsOffline] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pendingCount = queue.filter(
    (i) => i.status === 'QUEUED' || i.status === 'UPLOADING' || i.status === 'PROCESSING',
  ).length;
  const failedCount = queue.filter((i) => i.status === 'FAILED').length;

  // ── Network listener ───────────────────────────────────────────────────────
  useEffect(() => {
    NetInfo.fetch().then((s) => setIsOffline(!s.isConnected));
    const unsub = NetInfo.addEventListener((s) => setIsOffline(!s.isConnected));
    return () => { unsub(); };
  }, []);

  // ── Transient toast helper ─────────────────────────────────────────────────
  const showToast = useCallback((message: string) => {
    setToast({ message });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_DURATION_MS);
  }, []);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  // ── First-time offline hint (offline §6.3) ─────────────────────────────────
  // Fire once-per-user the first time something is queued while offline.
  const offlineHintArmed = useRef(true);
  useEffect(() => {
    if (!isOffline || pendingCount === 0 || !offlineHintArmed.current) return;
    offlineHintArmed.current = false;
    let active = true;
    AsyncStorage.getItem(OFFLINE_HINT_SHOWN_KEY).then((shown) => {
      if (!active || shown === 'true') return;
      void AsyncStorage.setItem(OFFLINE_HINT_SHOWN_KEY, 'true');
      showToast(t('mobile.queue.firstTimeHint'));
    });
    return () => { active = false; };
  }, [isOffline, pendingCount, showToast, t]);

  // ── All-synced toast (offline §6.2) ────────────────────────────────────────
  // Show once when the queue drains from "had outstanding work" → "nothing left".
  const hadOutstanding = useRef(false);
  useEffect(() => {
    const outstanding = pendingCount > 0 || failedCount > 0;
    if (hadOutstanding.current && !outstanding) {
      showToast(t('mobile.queue.toastAllSynced'));
    }
    hadOutstanding.current = outstanding;
  }, [pendingCount, failedCount, showToast, t]);

  // ── Derive chip state ──────────────────────────────────────────────────────
  let state: ChipState;
  if (failedCount > 0) state = 'failed';
  else if (isOffline && pendingCount > 0) state = 'offlineWaiting';
  else if (pendingCount > 0) state = 'syncing';
  else state = 'allSynced';

  const count = state === 'failed' ? failedCount : pendingCount;

  const iconName: React.ComponentProps<typeof Ionicons>['name'] =
    state === 'failed'
      ? 'warning-outline'
      : state === 'offlineWaiting'
        ? 'cloud-offline-outline'
        : state === 'syncing'
          ? 'sync-outline'
          : 'checkmark-circle-outline';

  const color =
    state === 'failed'
      ? tokens.errorFg
      : state === 'offlineWaiting'
        ? tokens.textSecondary
        : state === 'syncing'
          ? tokens.infoFg
          : tokens.successFg;

  const bg =
    state === 'failed'
      ? tokens.errorTint
      : state === 'offlineWaiting'
        ? tokens.sunken
        : state === 'syncing'
          ? tokens.infoTint
          : tokens.successTint;

  const label = t(`mobile.queue.header.${state}`, { count });
  const a11yLabel = t(`mobile.queue.headerA11y.${state}`, { count });

  // ── Spin the syncing icon ──────────────────────────────────────────────────
  const [spin] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (state !== 'syncing') { spin.setValue(0); return; }
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 1100, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [state, spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <>
      <Pressable
        testID={testID ?? 'queue-chip'}
        style={[styles.chip, { backgroundColor: bg }]}
        onPress={() => setSheetOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
      >
        <Animated.View style={state === 'syncing' ? { transform: [{ rotate }] } : undefined}>
          <Ionicons name={iconName} size={13} color={color} />
        </Animated.View>
        <Text style={[styles.label, { color }]} numberOfLines={1}>{label}</Text>
      </Pressable>

      <QueueDetailSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        items={queue}
        onRetryAll={() => { onRetryAll(); setSheetOpen(false); }}
        onDeleteAllFailed={() => { onDeleteAllFailed(); setSheetOpen(false); }}
      />

      {toast && (
        <View style={styles.toast} accessibilityLiveRegion="polite" testID="queue-toast">
          <Text style={styles.toastText} numberOfLines={2}>{toast.message}</Text>
        </View>
      )}
    </>
  );
}

const useStyles = createThemedStyles((tk: ThemeTokens) =>
  StyleSheet.create({
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 100,
      minHeight: 28,
      maxWidth: 160,
    },
    label: {
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.1,
    },
    toast: {
      position: 'absolute',
      left: 16,
      right: 16,
      bottom: 24,
      backgroundColor: tk.textPrimary, // inverse surface — high contrast both modes
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 12,
      ...tk.elevation3,
    },
    toastText: {
      fontSize: 13,
      fontWeight: '600',
      color: tk.canvas,
    },
  }),
);
