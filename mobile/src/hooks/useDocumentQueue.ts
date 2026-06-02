/**
 * Document Upload Queue Hook
 * Local queue stored in AsyncStorage (queue metadata only — not tokens).
 * Drives the QUEUED → UPLOADING → PROCESSING → READY / FAILED state machine.
 *
 * Phase 6A — camera-screen-deltas.md
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../lib/api';
import NetInfo from '@react-native-community/netinfo';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';

const QUEUE_KEY = '@snapaccount/doc_upload_queue';

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
          const formData = new FormData();
          formData.append('file', {
            uri: item.localUri,
            type: 'image/jpeg',
            name: item.filename,
          } as unknown as Blob);
          if (item.category) formData.append('category', item.category);
          const res = await apiClient.post<{ id: string }>(
            '/documents/upload',
            formData,
            { headers: { 'Content-Type': 'multipart/form-data' } },
          );
          // Update persisted queue directly (hook may not be mounted)
          const updated = items.map((i) =>
            i.localId === item.localId
              ? { ...i, serverId: res.data.id, status: 'PROCESSING' as const, uploadProgress: 100 }
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
}

// ─────────────────────────────────────────────────────────────────────────────
// Backoff configuration
// ─────────────────────────────────────────────────────────────────────────────

const BACKOFF_DELAYS_MS = [5_000, 15_000, 60_000]; // 3 auto-retries then FAILED
const OCR_TIMEOUT_MS = 60_000;

// ─────────────────────────────────────────────────────────────────────────────
// Persistence helpers
// ─────────────────────────────────────────────────────────────────────────────

async function loadQueue(): Promise<QueueItem[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueueItem[]) : [];
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
  const ocrTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const retryTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Load persisted queue on mount + register background fetch task
  useEffect(() => {
    loadQueue().then(setQueue);
    void registerDocumentQueueBgFetch();
  }, []);

  // Persist whenever queue changes
  useEffect(() => {
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

      // Fetch current item from queue state snapshot
      let currentItem: QueueItem | undefined;
      setQueue((prev) => {
        currentItem = prev.find((i) => i.localId === localId);
        return prev;
      });

      if (!currentItem) return;
      const item = currentItem;

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
            headers: { 'Content-Type': 'multipart/form-data' },
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

        // Start OCR timeout watchdog
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
        }, OCR_TIMEOUT_MS);
        ocrTimers.current[localId] = timer;
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

          // Auto-retry with backoff unless UPLOAD_REJECTED or max retries exceeded
          if (failReason !== 'UPLOAD_REJECTED' && retryCount < BACKOFF_DELAYS_MS.length) {
            const delay = BACKOFF_DELAYS_MS[retryCount];
            const timer = setTimeout(() => {
              setQueue((q) =>
                q.map((i) =>
                  i.localId === localId
                    ? { ...i, status: 'QUEUED', retryCount: i.retryCount }
                    : i,
                ),
              );
              uploadItem(localId);
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

  // ── Enqueue a new capture ──────────────────────────────────────────────────

  const enqueue = useCallback(
    async (params: {
      localUri: string;
      thumbnailUri?: string;
      filename: string;
      category?: string;
    }): Promise<string> => {
      const localId = `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const newItem: QueueItem = {
        localId,
        localUri: params.localUri,
        thumbnailUri: params.thumbnailUri,
        filename: params.filename,
        category: params.category,
        status: 'QUEUED',
        uploadProgress: 0,
        retryCount: 0,
        enqueuedAt: new Date().toISOString(),
      };
      setQueue((prev) => [newItem, ...prev]);

      // Start upload if online
      const netState = await NetInfo.fetch();
      if (netState.isConnected) {
        // slight delay so state settles
        setTimeout(() => uploadItem(localId), 100);
      }

      return localId;
    },
    [uploadItem],
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
    if (retryTimers.current[localId]) clearTimeout(retryTimers.current[localId]);
    if (ocrTimers.current[localId]) clearTimeout(ocrTimers.current[localId]);
    delete retryTimers.current[localId];
    delete ocrTimers.current[localId];
    setQueue((prev) => prev.filter((item) => item.localId !== localId));
  }, []);

  // ── Mark READY on server push ─────────────────────────────────────────────

  const markReady = useCallback(
    (serverId: string) => {
      if (ocrTimers.current[serverId]) {
        clearTimeout(ocrTimers.current[serverId]);
        delete ocrTimers.current[serverId];
      }
      setQueue((prev) =>
        prev.map((item) =>
          item.serverId === serverId ? { ...item, status: 'READY' } : item,
        ),
      );
    },
    [],
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
    return () => {
      Object.values(ocrTimers.current).forEach(clearTimeout);
      Object.values(retryTimers.current).forEach(clearTimeout);
    };
  }, []);

  const pendingCount = queue.filter(
    (i) => i.status === 'QUEUED' || i.status === 'UPLOADING' || i.status === 'PROCESSING',
  ).length;

  return { queue, enqueue, retry, remove, markReady, pendingCount };
}
