/**
 * Per-suite jest environment tweaks (runs after the test framework is set up).
 *
 * "A worker process has failed to exit gracefully" investigation (2026-06-11):
 *
 * 1. REAL leak (fixed here): screen suites instantiate `new QueryClient()`
 *    per render-wrapper and never clear it, so TanStack Query left macrotask
 *    handles behind (notifyManager setTimeout batching + 5-minute gcTime
 *    timers for unmounted queries). Every client created in a test is now
 *    tracked by the moduleNameMapper wrapper
 *    (src/__mocks__/reactQueryTracked.js — the real CJS exports are
 *    non-configurable, so the class cannot be patched in this setup file)
 *    and `clear()`ed below, cancelling retry/gc/notify timers.
 *
 * 2. RESIDUAL (cosmetic, documented): even with ZERO active handles at
 *    afterAll (verified via process._getActiveHandles()), some RN screen
 *    suites still print the warning because the jest-expo worker takes >1s to
 *    tear down the large react-native module registry. That is worker
 *    teardown latency, not a test leak — tests are unaffected.
 */
/* eslint-disable no-undef */

afterEach(() => {
  const liveClients = globalThis.__RQ_LIVE_CLIENTS__ || [];
  for (const client of liveClients) {
    try {
      client.clear();
    } catch {
      // already cleared/unmounted
    }
  }
  liveClients.length = 0;
});
