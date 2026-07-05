/**
 * Document Upload Queue Hook
 * Local queue stored in AsyncStorage (queue metadata only — not tokens).
 * Drives the QUEUED → UPLOADING → PROCESSING → READY / FAILED state machine.
 *
 * Phase 6A — camera-screen-deltas.md
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { apiClient } from '../lib/api';
import NetInfo from '@react-native-community/netinfo';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { prepareDocumentImage, cleanupStagedImage } from '../lib/documentImagePrep';
import { useHaptics } from './useHaptics';

const QUEUE_KEY = '@snapaccount/doc_upload_queue';

// ─────────────────────────────────────────────────────────────────────────────
// Backoff + idempotency configuration  (offline-first-photo-capture.md §5 / §7)
// ─────────────────────────────────────────────────────────────────────────────

/** Max automatic upload attempts before an item parks in FAILED (manual retry). */
const MAX_AUTO_ATTEMPTS = 6;
/** Cap on a single backoff delay (30 minutes). */
const MAX_BACKOFF_MS = 30 * 60 * 1000;

/**
 * Exponential backoff schedule: min(60s · 2^attempt, 30min).
 * attempt 0→60s, 1→2m, 2→4m, 3→8m, 4→16m, 5→30m (capped).
 */
export function backoffDelayMs(attempt: number): number {
  return Math.min(60_000 * 2 ** attempt, MAX_BACKOFF_MS);
}

/** Header the backend (DG-DOC-08) reads to dedupe a re-sent upload → 200 existing id. */
const IDEMPOTENCY_HEADER = 'Idempotency-Key';

// ─────────────────────────────────────────────────────────────────────────────
// BackgroundFetch task — Phase 6F
// Registered at module level so TaskManager can call it even when app is
// in background. It reads persisted queue and attempts flush of QUEUED items.
// ─────────────────────────────────────────────────────────────────────────────

export const DOCUMENT_QUEUE_BG_TASK = 'SNAPACCOUNT_DOC_QUEUE_FLUSH';

// Define the task once at module level (idempotent — TaskManager ignores duplicates)
if (typeof TaskManager.isTaskDefined !== 'function' || !TaskManager.isTaskDefined(DOCUMENT_QUEUE_BG_TASK)) {
  TaskManager.defineTask(DOCUMENT_QUEUE_BG_TASK, async () => {
    try {
      const raw = await AsyncStorage.getItem(QUEUE_KEY);
      const items: QueueItem[] = raw ? (JSON.parse(raw) as QueueItem[]) : [];
      const netState = await NetInfo.fetch();
      if (!netState.isConnected) {
        return BackgroundFetch.BackgroundFetchResult.NoData;
      }
      const pending = items.filter(
        (i) => i.status === 'QUEUED' || i.failReason === 'NETWORK',
      );
      if (pending.length === 0) {
        return BackgroundFetch.BackgroundFetchResult.NoData;
      }
      // Attempt upload for each pending item (1 at a time in background)
      for (const item of pending) {
        try {
          // Idempotency-Key (DG-DOC-08): generated at enqueue. Backfill for items
          // persisted before this field existed so a background retry still dedupes.
          const idempotencyKey = item.idempotencyKey ?? Crypto.randomUUID();
          const formData = new FormData();
          formData.append('file', {
            uri: item.localUri,
            type: 'image/jpeg',
            name: item.filename,
          } as unknown as Blob);
          if (item.category) formData.append('category', item.category);
          const res = await apiClient.post<{ documentId: string }>(
            '/documents/upload',
            formData,
            {
              headers: {
                'Content-Type': 'multipart/form-data',
                [IDEMPOTENCY_HEADER]: idempotencyKey,
              },
            },
          );
          // Update persisted queue directly (hook may not be mounted)
          const updated = items.map((i) =>
            i.localId === item.localId
              ? {
                  ...i,
                  idempotencyKey,
                  serverId: res.data.documentId,
                  status: 'PROCESSING' as const,
                  uploadProgress: 100,
                }
              : i,
          );
          await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(updated));
        } catch {
          // leave item as QUEUED for next cycle
        }
      }
      return BackgroundFetch.BackgroundFetchResult.NewData;
    } catch {
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }
  });
}

/** Register (or re-register) the background fetch task. Safe to call multiple times. */
export async function registerDocumentQueueBgFetch(): Promise<void> {
  try {
    const status = await BackgroundFetch.getStatusAsync();
    if (
      status === BackgroundFetch.BackgroundFetchStatus.Restricted ||
      status === BackgroundFetch.BackgroundFetchStatus.Denied
    ) {
      return; // background fetch not permitted on this device
    }
    await BackgroundFetch.registerTaskAsync(DOCUMENT_QUEUE_BG_TASK, {
      minimumInterval: 15 * 60, // 15 minutes (system may defer further on iOS)
      stopOnTerminate: false,
      startOnBoot: true,
    });
  } catch {
    // Already registered or unsupported — safe to ignore
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type UploadStatus = 'QUEUED' | 'UPLOADING' | 'PROCESSING' | 'READY' | 'FAILED';

export type FailReason = 'NETWORK' | 'UPLOAD_REJECTED' | 'OCR_FAILED' | 'TIMEOUT';

export interface QueueItem {
  /** temp UUID generated locally, replaced by serverId once uploaded */
  localId: string;
  /** server document ID — available after upload ack */
  serverId?: string;
  /**
   * Client-generated UUIDv4 sent in the Idempotency-Key header on every upload
   * attempt (DG-DOC-08). Stable for the life of the item so a retry after a lost
   * success-ack dedupes server-side instead of creating a duplicate document.
   */
  idempotencyKey: string;
  localUri: string;
  thumbnailUri?: string;
  filename: string;
  category?: string;
  status: UploadStatus;
  uploadProgress: number; // 0-100
  failReason?: FailReason;
  failMessage?: string;
  retryCount: number;
  enqueuedAt: string;
  uploadedAt?: string;
  /** When the last upload attempt was made (manifest field). */
  lastAttemptAt?: string;
  /** Size in bytes of the staged (EXIF-stripped) image, when known (manifest field). */
  sizeBytes?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Watchdog configuration
// ─────────────────────────────────────────────────────────────────────────────

const OCR_TIMEOUT_MS = 60_000;

// ─────────────────────────────────────────────────────────────────────────────
// Persistence helpers
// ─────────────────────────────────────────────────────────────────────────────

async function loadQueue(): Promise<QueueItem[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    const items = raw ? (JSON.parse(raw) as QueueItem[]) : [];
    // Backfill idempotencyKey for items persisted before DG-DOC-08 so every
    // upload attempt — including resumed/background ones — carries the header.
    return items.map((i) =>
      i.idempotencyKey ? i : { ...i, idempotencyKey: Crypto.randomUUID() },
    );
  } catch {
    return [];
  }
}

async function persistQueue(items: QueueItem[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  } catch {
    // Storage full or unavailable — degrade gracefully
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useDocumentQueue() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const haptics = useHaptics();
  const ocrTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const retryTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // Latest uploadItem, readable from retry timers without a self-reference
  // inside its own useCallback (lint: no use-before-declare during render).
  const uploadItemRef = useRef<(localId: string) => Promise<void> | void>(() => {});
  // Always-current mirror of `queue` so async callbacks (deferred setTimeout
  // uploads, background resume) can read the live item without relying on a
  // setQueue updater being flushed synchronously.
  const queueRef = useRef<QueueItem[]>([]);

  // Load persisted queue on mount + register background fetch task
  useEffect(() => {
    loadQueue().then(setQueue);
    void registerDocumentQueueBgFetch();
  }, []);

  // Persist whenever queue changes + keep the live mirror in sync
  useEffect(() => {
    queueRef.current = queue;
    persistQueue(queue);
  }, [queue]);

  const updateItem = useCallback(
    (localId: string, patch: Partial<QueueItem>) => {
      setQueue((prev) =>
        prev.map((item) =>
          item.localId === localId ? { ...item, ...patch } : item,
        ),
      );
    },
    [],
  );

  // ── Upload a single item ───────────────────────────────────────────────────

  const uploadItem = useCallback(
    async (localId: string) => {
      setQueue((prev) =>
        prev.map((item) =>
          item.localId === localId
            ? { ...item, status: 'UPLOADING', uploadProgress: 0 }
            : item,
        ),
      );

      // Read the live item from the queue mirror (deterministic regardless of
      // whether the setQueue updaters above have flushed yet).
      let currentItem = queueRef.current.find((i) => i.localId === localId);
      if (!currentItem) {
        // Fall back to a state-snapshot read (covers a not-yet-mirrored item).
        setQueue((prev) => {
          currentItem = prev.find((i) => i.localId === localId);
          return prev;
        });
      }

      if (!currentItem) return;
      const item = currentItem;

      updateItem(localId, { lastAttemptAt: new Date().toISOString() });

      try {
        // Build multipart form
        const formData = new FormData();
        formData.append('file', {
          uri: item.localUri,
          type: 'image/jpeg',
          name: item.filename,
        } as unknown as Blob);
        if (item.category) formData.append('category', item.category);

        const uploadRes = await apiClient.post<{ documentId: string; status: string }>(
          '/documents/upload',
          formData,
          {
            headers: {
              'Content-Type': 'multipart/form-data',
              // DG-DOC-08: backend dedupes a re-sent key → 200 with the existing
              // document id, so a retry after a lost ack never duplicates.
              [IDEMPOTENCY_HEADER]: item.idempotencyKey,
            },
            onUploadProgress: (evt) => {
              const pct = evt.total
                ? Math.round((evt.loaded / evt.total) * 100)
                : 0;
              updateItem(localId, { uploadProgress: pct });
            },
          },
        );

        const serverId = uploadRes.data.documentId;
        updateItem(localId, {
          serverId,
          status: 'PROCESSING',
          uploadProgress: 100,
          uploadedAt: new Date().toISOString(),
        });

        // Fire OCR request
        await apiClient.post(`/documents/${serverId}/ocr`);

        // Start OCR timeout watchdog.
        // DG-DOC-06: key the watchdog by serverId (known here) so markReady(serverId)
        // — driven by the success poll / future server push — clears the SAME key.
        // Previously the timer was stored under localId but cleared under serverId,
        // so it was never cancelled on success and leaked a 60s timer per document.
        const timer = setTimeout(() => {
          setQueue((prev) => {
            const found = prev.find((i) => i.localId === localId);
            if (found && found.status === 'PROCESSING') {
              return prev.map((i) =>
                i.localId === localId
                  ? {
                      ...i,
                      status: 'FAILED',
                      failReason: 'TIMEOUT',
                    }
                  : i,
              );
            }
            return prev;
          });
          delete ocrTimers.current[serverId];
        }, OCR_TIMEOUT_MS);
        ocrTimers.current[serverId] = timer;
      } catch (err: unknown) {
        const axiosErr = err as { response?: { status?: number } };
        const status = axiosErr?.response?.status;
        let failReason: FailReason = 'OCR_FAILED';
        if (status === 413 || status === 415 || (status && status >= 400 && status < 500)) {
          failReason = 'UPLOAD_REJECTED';
        }

        setQueue((prev) => {
          const found = prev.find((i) => i.localId === localId);
          if (!found) return prev;
          const retryCount = found.retryCount;

          // Auto-retry with exponential backoff min(60s·2^attempt, 30min) up to
          // MAX_AUTO_ATTEMPTS, unless the server hard-rejected the upload (4xx).
          if (failReason !== 'UPLOAD_REJECTED' && retryCount < MAX_AUTO_ATTEMPTS) {
            const delay = backoffDelayMs(retryCount);
            const timer = setTimeout(() => {
              setQueue((q) =>
                q.map((i) =>
                  i.localId === localId
                    ? { ...i, status: 'QUEUED', retryCount: i.retryCount }
                    : i,
                ),
              );
              void uploadItemRef.current(localId);
            }, delay);
            retryTimers.current[localId] = timer;

            return prev.map((i) =>
              i.localId === localId
                ? { ...i, status: 'QUEUED', retryCount: i.retryCount + 1 }
                : i,
            );
          }

          return prev.map((i) =>
            i.localId === localId
              ? { ...i, status: 'FAILED', failReason, retryCount: i.retryCount + 1 }
              : i,
          );
        });
      }
    },
    [updateItem],
  );

  // Keep the ref pointing at the latest uploadItem (refs may be written in effects).
  useEffect(() => {
    uploadItemRef.current = uploadItem;
  }, [uploadItem]);

  // ── Enqueue a new capture ──────────────────────────────────────────────────

  const enqueue = useCallback(
    async (params: {
      localUri: string;
      thumbnailUri?: string;
      filename: string;
      category?: string;
    }): Promise<string> => {
      const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      // DG-DOC-08: stable client idempotency key (UUIDv4) for the item's lifetime.
      const idempotencyKey = Crypto.randomUUID();
      const newItem: QueueItem = {
        localId,
        idempotencyKey,
        localUri: params.localUri,
        thumbnailUri: params.thumbnailUri,
        filename: params.filename,
        category: params.category,
        status: 'QUEUED',
        uploadProgress: 0,
        retryCount: 0,
        enqueuedAt: new Date().toISOString(),
      };
      // Show the item as QUEUED immediately (snappy UX); EXIF-strip/staging then
      // patches localUri + sizeBytes in place before the upload kicks off.
      setQueue((prev) => [newItem, ...prev]);

      // DG-MOBUX-06: EXIF-strip + downscale + stage into documentDirectory/queue
      // so the upload payload carries no metadata and survives camera-cache eviction.
      const prepared = await prepareDocumentImage(params.localUri, idempotencyKey);
      updateItem(localId, { localUri: prepared.uri, sizeBytes: prepared.sizeBytes });

      // Start upload if online
      const netState = await NetInfo.fetch();
      if (netState.isConnected) {
        // slight delay so state settles
        setTimeout(() => uploadItem(localId), 100);
      }

      return localId;
    },
    [uploadItem, updateItem],
  );

  // ── Manual retry ──────────────────────────────────────────────────────────

  const retry = useCallback(
    (localId: string) => {
      if (retryTimers.current[localId]) {
        clearTimeout(retryTimers.current[localId]);
        delete retryTimers.current[localId];
      }
      setQueue((prev) =>
        prev.map((item) =>
          item.localId === localId
            ? { ...item, status: 'QUEUED', retryCount: 0, failReason: undefined }
            : item,
        ),
      );
      uploadItem(localId);
    },
    [uploadItem],
  );

  // ── Remove from queue ─────────────────────────────────────────────────────

  const remove = useCallback((localId: string) => {
    // Retry timers are keyed by localId; the OCR watchdog by serverId (DG-DOC-06),
    // so clear whichever key is set for this item.
    if (retryTimers.current[localId]) {
      clearTimeout(retryTimers.current[localId]);
      delete retryTimers.current[localId];
    }
    setQueue((prev) => {
      const target = prev.find((item) => item.localId === localId);
      if (target?.serverId && ocrTimers.current[target.serverId]) {
        clearTimeout(ocrTimers.current[target.serverId]);
        delete ocrTimers.current[target.serverId];
      }
      // Legacy fallback: very old items may have stored the watchdog under localId.
      if (ocrTimers.current[localId]) {
        clearTimeout(ocrTimers.current[localId]);
        delete ocrTimers.current[localId];
      }
      // Best-effort: reclaim the staged (EXIF-stripped) file from documentDirectory.
      void cleanupStagedImage(target?.localUri);
      return prev.filter((item) => item.localId !== localId);
    });
  }, []);

  // ── Mark READY on server push ─────────────────────────────────────────────

  const markReady = useCallback(
    (serverId: string) => {
      // DG-DOC-06: the watchdog is now keyed by serverId, so this clears the SAME
      // timer the success path started — fixing the leak where it was never cancelled.
      if (ocrTimers.current[serverId]) {
        clearTimeout(ocrTimers.current[serverId]);
        delete ocrTimers.current[serverId];
      }
      setQueue((prev) => {
        // offline §12 / DG-MOBUX-08: a Success notification haptic fires when an
        // item transitions to READY, but only while the app is foregrounded (so a
        // background-completed upload doesn't buzz the user's pocket).
        const transitioning = prev.some(
          (i) => i.serverId === serverId && i.status !== 'READY',
        );
        if (transitioning && AppState.currentState === 'active') {
          haptics.success();
        }
        return prev.map((item) => {
          if (item.serverId !== serverId) return item;
          // Document is safely processed server-side — reclaim its staged file.
          void cleanupStagedImage(item.localUri);
          return { ...item, status: 'READY' };
        });
      });
    },
    [haptics],
  );

  // ── Auto-resume QUEUED items when network returns ─────────────────────────

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (state.isConnected) {
        setQueue((prev) => {
          prev.forEach((item) => {
            if (item.status === 'QUEUED' || item.failReason === 'NETWORK') {
              setTimeout(() => uploadItem(item.localId), 500);
            }
          });
          return prev;
        });
      }
    });
    return () => unsubscribe();
  }, [uploadItem]);

  // ── Cleanup timers on unmount ─────────────────────────────────────────────

  useEffect(() => {
    // Copy the (stable) timer records so the cleanup reads the same objects
    // it captured, per react-hooks/exhaustive-deps guidance.
    const ocr = ocrTimers.current;
    const retry = retryTimers.current;
    return () => {
      Object.values(ocr).forEach(clearTimeout);
      Object.values(retry).forEach(clearTimeout);
    };
  }, []);

  const pendingCount = queue.filter(
    (i) => i.status === 'QUEUED' || i.status === 'UPLOADING' || i.status === 'PROCESSING',
  ).length;

  const failedCount = queue.filter((i) => i.status === 'FAILED').length;

  // Note: per-item READY → Success haptic fires in markReady (offline §12). The
  // "all-synced" affordance is owned by QueueChip (toast) to avoid double-buzzing
  // when the final item reaches READY, so no drain-level haptic is fired here.

  // ── Bulk actions for the header QueueDetailSheet (DG-MOBUX-09) ─────────────

  /** Retry every FAILED item that is eligible (not a hard server rejection). */
  const retryAllFailed = useCallback(() => {
    queueRef.current
      .filter((i) => i.status === 'FAILED' && i.failReason !== 'UPLOAD_REJECTED')
      .forEach((i) => retry(i.localId));
  }, [retry]);

  /** Remove every FAILED item from the queue. */
  const removeAllFailed = useCallback(() => {
    queueRef.current
      .filter((i) => i.status === 'FAILED')
      .forEach((i) => remove(i.localId));
  }, [remove]);

  return {
    queue,
    enqueue,
    retry,
    remove,
    markReady,
    pendingCount,
    failedCount,
    retryAllFailed,
    removeAllFailed,
  };
}
