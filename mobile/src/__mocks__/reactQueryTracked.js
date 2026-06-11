/**
 * Jest wrapper around @tanstack/react-query (moduleNameMapper).
 *
 * The real CJS exports are non-configurable, so the QueryClient class cannot
 * be patched in a setup file. This wrapper re-exports the real module with a
 * tracked QueryClient; src/__mocks__/jestAfterEnv.setup.js clears every
 * tracked client in afterEach, cancelling TanStack's notify/gc/retry timers
 * that otherwise keep jest workers from exiting gracefully.
 */
/* eslint-disable no-undef */
// NOTE: jest.requireActual still goes through moduleNameMapper, which would
// recurse into this very file — so the real package is reached through a
// passthrough alias mapped to its directory in package.json.
// eslint-disable-next-line import/no-unresolved
const actual = require('tanstack-react-query-actual');

const liveClients = (globalThis.__RQ_LIVE_CLIENTS__ =
  globalThis.__RQ_LIVE_CLIENTS__ || []);

class TrackedQueryClient extends actual.QueryClient {
  constructor(...args) {
    super(...args);
    liveClients.push(this);
  }
}

module.exports = { ...actual, QueryClient: TrackedQueryClient };
