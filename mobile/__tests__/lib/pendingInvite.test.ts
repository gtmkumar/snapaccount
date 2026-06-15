/**
 * pendingInvite — GAP-065 invite-token persistence through the auth flow.
 *
 * Covers:
 *  - store → peek → consume round trip (consume clears the token: single-shot)
 *  - clearPendingInviteToken removes the value
 *  - implausible tokens (blank / whitespace / oversized) are never persisted
 *  - SecureStore failures are swallowed (non-fatal contract)
 */

import * as SecureStore from 'expo-secure-store';
import {
  storePendingInviteToken,
  peekPendingInviteToken,
  consumePendingInviteToken,
  clearPendingInviteToken,
} from '../../src/lib/pendingInvite';

const TOKEN = 'inv_4fE9xKqRz7TbW2mYpA8cD1gH6jL3nQ5s';

describe('pendingInvite (GAP-065)', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await clearPendingInviteToken();
  });

  it('stores and peeks a token without clearing it', async () => {
    await storePendingInviteToken(TOKEN);
    expect(await peekPendingInviteToken()).toBe(TOKEN);
    // Peek is non-destructive
    expect(await peekPendingInviteToken()).toBe(TOKEN);
  });

  it('consume returns the token AND clears it (single-shot resume)', async () => {
    await storePendingInviteToken(TOKEN);
    expect(await consumePendingInviteToken()).toBe(TOKEN);
    // Second consume finds nothing — a failed accept can never loop.
    expect(await consumePendingInviteToken()).toBeNull();
    expect(await peekPendingInviteToken()).toBeNull();
  });

  it('consume returns null when nothing is pending', async () => {
    expect(await consumePendingInviteToken()).toBeNull();
  });

  it('clear removes a stored token', async () => {
    await storePendingInviteToken(TOKEN);
    await clearPendingInviteToken();
    expect(await peekPendingInviteToken()).toBeNull();
  });

  it('trims surrounding whitespace before persisting', async () => {
    await storePendingInviteToken(`  ${TOKEN}  `);
    expect(await peekPendingInviteToken()).toBe(TOKEN);
  });

  it.each([
    ['empty', ''],
    ['whitespace-only', '   '],
    ['contains spaces', 'not a token'],
    ['oversized', 'x'.repeat(300)],
  ])('never persists an implausible token (%s)', async (_label, bad) => {
    await storePendingInviteToken(bad);
    expect(await peekPendingInviteToken()).toBeNull();
  });

  it('uses SecureStore (never AsyncStorage) for the bearer-capability token', async () => {
    await storePendingInviteToken(TOKEN);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'snapaccount.pendingInviteToken',
      TOKEN,
    );
  });

  it('store/clear swallow SecureStore failures (non-fatal contract)', async () => {
    (SecureStore.setItemAsync as jest.Mock).mockRejectedValueOnce(new Error('keychain locked'));
    await expect(storePendingInviteToken(TOKEN)).resolves.toBeUndefined();

    (SecureStore.deleteItemAsync as jest.Mock).mockRejectedValueOnce(new Error('keychain locked'));
    await expect(clearPendingInviteToken()).resolves.toBeUndefined();
  });

  it('peek/consume return null on SecureStore read failure', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(new Error('keychain locked'));
    expect(await peekPendingInviteToken()).toBeNull();

    (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(new Error('keychain locked'));
    expect(await consumePendingInviteToken()).toBeNull();
  });
});
