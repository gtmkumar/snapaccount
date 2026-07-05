/**
 * Unit tests — useDocumentQueue offline-first hardening
 * DG-DOC-06 (watchdog leak) + DG-DOC-08 / DG-MOBUX-06 (idempotency key, backoff,
 * EXIF-strip/staging). Complements useDocumentQueue.test.ts (state-machine path).
 */

import { renderHook, act, waitFor } from '@testing-library/react-native';

jest.mock('../../src/lib/api', () => ({
  apiClient: { post: jest.fn() },
}));

jest.mock('@react-native-community/netinfo', () => {
  const mock = {
    fetch: jest.fn(() => Promise.resolve({ isConnected: false })),
    addEventListener: jest.fn(() => jest.fn()),
  };
  return { __esModule: true, default: mock };
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { apiClient } from '../../src/lib/api';
import { useDocumentQueue, backoffDelayMs } from '../../src/hooks/useDocumentQueue';
import { prepareDocumentImage } from '../../src/lib/documentImagePrep';

const mockPost = apiClient.post as jest.Mock;
const mockNetFetch = NetInfo.fetch as jest.Mock;

jest.useRealTimers();

beforeEach(async () => {
  jest.clearAllMocks();
  await (AsyncStorage.clear as jest.Mock)();
  mockNetFetch.mockResolvedValue({ isConnected: false });
  mockPost.mockResolvedValue({ data: { documentId: 'srv-1', status: 'Processing' } });
});

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

// ─── DG-DOC-08 / DG-MOBUX-06: idempotency key ──────────────────────────────────

describe('DG-DOC-08 idempotency key', () => {
  it('assigns a stable UUID idempotencyKey to every enqueued item', async () => {
    const { result } = renderHook(() => useDocumentQueue());
    await act(async () => { await delay(10); });

    await act(async () => {
      await result.current.enqueue({ localUri: 'file:///a.jpg', filename: 'a.jpg' });
    });

    const key = result.current.queue[0]?.idempotencyKey;
    expect(typeof key).toBe('string');
    expect(key).toMatch(/[0-9a-f-]{8,}/);
  });

  it('sends the Idempotency-Key header on upload', async () => {
    mockNetFetch.mockResolvedValue({ isConnected: true });
    const { result } = renderHook(() => useDocumentQueue());
    await act(async () => { await delay(10); });

    await act(async () => {
      await result.current.enqueue({ localUri: 'file:///b.jpg', filename: 'b.jpg' });
    });
    await act(async () => { await delay(300); });

    await waitFor(() => {
      const uploadCall = mockPost.mock.calls.find((c) => c[0] === '/documents/upload');
      expect(uploadCall).toBeDefined();
      expect(uploadCall?.[2]?.headers?.['Idempotency-Key']).toEqual(
        expect.stringMatching(/[0-9a-f-]{8,}/),
      );
    });
  });
});

// ─── DG-MOBUX-06: backoff schedule ─────────────────────────────────────────────

describe('DG-MOBUX-06 backoff schedule min(60s·2^n, 30min)', () => {
  it('follows the exponential schedule and caps at 30 minutes', () => {
    expect(backoffDelayMs(0)).toBe(60_000);
    expect(backoffDelayMs(1)).toBe(120_000);
    expect(backoffDelayMs(2)).toBe(240_000);
    expect(backoffDelayMs(3)).toBe(480_000);
    expect(backoffDelayMs(4)).toBe(960_000);
    expect(backoffDelayMs(5)).toBe(30 * 60 * 1000); // capped
    expect(backoffDelayMs(9)).toBe(30 * 60 * 1000); // still capped
  });
});

// ─── DG-MOBUX-06: EXIF-strip + staging ─────────────────────────────────────────

describe('DG-MOBUX-06 EXIF-strip + staging', () => {
  it('stages the captured image (mock returns processed uri + size)', async () => {
    const prepared = await prepareDocumentImage('file:///raw.jpg', 'item-1');
    expect(prepared.processed).toBe(true);
    expect(prepared.uri).toContain('item-1');
    expect(prepared.sizeBytes).toBe(204800);
  });

  it('enqueue replaces localUri with the staged URI', async () => {
    const { result } = renderHook(() => useDocumentQueue());
    await act(async () => { await delay(10); });

    await act(async () => {
      await result.current.enqueue({ localUri: 'file:///raw2.jpg', filename: 'raw2.jpg' });
    });

    // The staged path is keyed by the item's idempotencyKey under queue/.
    expect(result.current.queue[0]?.localUri).toContain('queue/');
    expect(result.current.queue[0]?.sizeBytes).toBe(204800);
  });
});

// ─── DG-DOC-06: watchdog cleared on markReady (no leak) ─────────────────────────

describe('DG-DOC-06 OCR watchdog', () => {
  it('markReady clears the watchdog timer keyed by serverId (no FAILED flip, no leak)', async () => {
    const clearSpy = jest.spyOn(global, 'clearTimeout');
    mockNetFetch.mockResolvedValue({ isConnected: true });
    mockPost.mockResolvedValue({ data: { documentId: 'srv-watchdog', status: 'Processing' } });

    const { result } = renderHook(() => useDocumentQueue());
    await act(async () => { await delay(10); });

    await act(async () => {
      await result.current.enqueue({ localUri: 'file:///w.jpg', filename: 'w.jpg' });
    });
    // Let upload + OCR settle so the watchdog timer is armed.
    await act(async () => { await delay(400); });

    await waitFor(() => {
      expect(result.current.queue[0]?.serverId).toBe('srv-watchdog');
      expect(result.current.queue[0]?.status).toBe('PROCESSING');
    });

    act(() => { result.current.markReady('srv-watchdog'); });

    expect(result.current.queue[0]?.status).toBe('READY');
    // The watchdog must have been cancelled (the leak fix): clearTimeout called.
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});
