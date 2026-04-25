/**
 * Unit tests — notificationRouter (wireNotificationRouter, isValidUuid)
 * Phase 6E, updated Phase 6F hotfix (SEC-055/SEC-034)
 * Covers: GST → GstDashboard, ITR → ITRDashboard,
 *         callback → CallbackStatus with valid uuid id,
 *         document → DocumentDetail with valid uuid id,
 *         chat_message_received → ChatDetail with valid uuid threadId,
 *         loan_disbursed / loan_approved → LoanStatus with valid uuid loanId,
 *         unknown type → app root (no navigate),
 *         INVALID (non-UUID) id → fallback, no navigation.
 */

import * as Notifications from 'expo-notifications';
import { wireNotificationRouter, isValidUuid } from '../../src/notifications/notificationRouter';

const mockAddNotificationResponseReceivedListener =
  Notifications.addNotificationResponseReceivedListener as jest.Mock;

type NotificationCallback = (response: {
  notification: { request: { content: { data: Record<string, string> | undefined } } };
}) => void;

function makeNavigationRef(navigateMock: jest.Mock) {
  return { navigate: navigateMock } as never;
}

function makeResponse(data: Record<string, string> | undefined) {
  return { notification: { request: { content: { data } } } };
}

let capturedListener: NotificationCallback | null = null;

beforeEach(() => {
  jest.clearAllMocks();
  capturedListener = null;
  mockAddNotificationResponseReceivedListener.mockImplementation((cb: NotificationCallback) => {
    capturedListener = cb;
    return { remove: jest.fn() };
  });
});

describe('wireNotificationRouter — routing', () => {
  it('GST deadline push routes to GstDashboard', () => {
    const navigate = jest.fn();
    wireNotificationRouter(makeNavigationRef(navigate));

    capturedListener!(makeResponse({ type: 'gst' }));

    expect(navigate).toHaveBeenCalledWith('GstDashboard');
  });

  it('ITR reminder routes to ITRDashboard', () => {
    const navigate = jest.fn();
    wireNotificationRouter(makeNavigationRef(navigate));

    capturedListener!(makeResponse({ type: 'itr' }));

    expect(navigate).toHaveBeenCalledWith('ITRDashboard');
  });

  it('callback type routes to CallbackStatus with callbackId param', () => {
    const navigate = jest.fn();
    wireNotificationRouter(makeNavigationRef(navigate));

    capturedListener!(makeResponse({ type: 'callback', id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' }));

    expect(navigate).toHaveBeenCalledWith('CallbackStatus', {
      callbackId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    });
  });

  it('document processed routes to DocumentDetail with documentId param (valid UUID)', () => {
    const navigate = jest.fn();
    wireNotificationRouter(makeNavigationRef(navigate));

    // SEC-034/SEC-055: must be a well-formed UUID
    capturedListener!(makeResponse({ type: 'document', id: 'b7e3c2a1-f4d5-4891-a0bc-de1234567890' }));

    expect(navigate).toHaveBeenCalledWith('DocumentDetail', {
      documentId: 'b7e3c2a1-f4d5-4891-a0bc-de1234567890',
    });
  });

  it('unknown notification type does NOT call navigate', () => {
    const navigate = jest.fn();
    wireNotificationRouter(makeNavigationRef(navigate));

    capturedListener!(makeResponse({ type: 'promotional' }));

    expect(navigate).not.toHaveBeenCalled();
  });

  it('missing data payload does NOT call navigate', () => {
    const navigate = jest.fn();
    wireNotificationRouter(makeNavigationRef(navigate));

    capturedListener!(makeResponse(undefined));

    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('wireNotificationRouter — invalid id param fallback', () => {
  it('callback with empty id does NOT navigate to CallbackStatus', () => {
    const navigate = jest.fn();
    wireNotificationRouter(makeNavigationRef(navigate));

    // id is empty string — falsy, router skips navigation
    capturedListener!(makeResponse({ type: 'callback', id: '' }));

    expect(navigate).not.toHaveBeenCalledWith('CallbackStatus', expect.anything());
  });

  it('document with empty id does NOT navigate to DocumentDetail', () => {
    const navigate = jest.fn();
    wireNotificationRouter(makeNavigationRef(navigate));

    capturedListener!(makeResponse({ type: 'document', id: '' }));

    expect(navigate).not.toHaveBeenCalledWith('DocumentDetail', expect.anything());
  });

  it('callback with non-UUID id (SQL injection attempt) does NOT navigate — SEC-034 fixed', () => {
    const navigate = jest.fn();
    wireNotificationRouter(makeNavigationRef(navigate));

    // SEC-034/SEC-055: UUID validation now rejects injection attempts
    capturedListener!(makeResponse({ type: 'callback', id: "'; DROP TABLE callbacks;--" }));

    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('wireNotificationRouter — Phase 6F routes (SEC-055)', () => {
  const VALID_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

  it('chat_message_received with valid threadId routes to ChatDetail', () => {
    const navigate = jest.fn();
    wireNotificationRouter(makeNavigationRef(navigate));

    capturedListener!(makeResponse({ type: 'chat_message_received', threadId: VALID_UUID }));

    expect(navigate).toHaveBeenCalledWith('ChatDetail', { threadId: VALID_UUID, source: 'push' });
  });

  it('chat_message_received with non-UUID threadId does NOT navigate', () => {
    const navigate = jest.fn();
    wireNotificationRouter(makeNavigationRef(navigate));

    capturedListener!(makeResponse({ type: 'chat_message_received', threadId: 'not-a-uuid' }));

    expect(navigate).not.toHaveBeenCalled();
  });

  it('chat_message_received with missing threadId does NOT navigate', () => {
    const navigate = jest.fn();
    wireNotificationRouter(makeNavigationRef(navigate));

    capturedListener!(makeResponse({ type: 'chat_message_received' }));

    expect(navigate).not.toHaveBeenCalled();
  });

  it('loan_disbursed with valid loanId routes to LoanStatus', () => {
    const navigate = jest.fn();
    wireNotificationRouter(makeNavigationRef(navigate));

    capturedListener!(makeResponse({ type: 'loan_disbursed', loanId: VALID_UUID }));

    expect(navigate).toHaveBeenCalledWith('LoanStatus', { loanId: VALID_UUID });
  });

  it('loan_approved with valid loanId routes to LoanStatus', () => {
    const navigate = jest.fn();
    wireNotificationRouter(makeNavigationRef(navigate));

    capturedListener!(makeResponse({ type: 'loan_approved', loanId: VALID_UUID }));

    expect(navigate).toHaveBeenCalledWith('LoanStatus', { loanId: VALID_UUID });
  });

  it('loan_disbursed with non-UUID loanId does NOT navigate', () => {
    const navigate = jest.fn();
    wireNotificationRouter(makeNavigationRef(navigate));

    capturedListener!(makeResponse({ type: 'loan_disbursed', loanId: "' OR 1=1;--" }));

    expect(navigate).not.toHaveBeenCalled();
  });

  it('loan_approved with missing loanId does NOT navigate', () => {
    const navigate = jest.fn();
    wireNotificationRouter(makeNavigationRef(navigate));

    capturedListener!(makeResponse({ type: 'loan_approved' }));

    expect(navigate).not.toHaveBeenCalled();
  });

  it('document with non-UUID id does NOT navigate — SEC-034 fixed', () => {
    const navigate = jest.fn();
    wireNotificationRouter(makeNavigationRef(navigate));

    capturedListener!(makeResponse({ type: 'document', id: 'doc-uuid-0001-2345-6789' }));

    // 'doc-uuid-0001-2345-6789' fails UUID regex — should not navigate
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('isValidUuid', () => {
  it('accepts a well-formed lowercase UUID', () => {
    expect(isValidUuid('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(true);
  });

  it('accepts a well-formed uppercase UUID', () => {
    expect(isValidUuid('A1B2C3D4-E5F6-7890-ABCD-EF1234567890')).toBe(true);
  });

  it('rejects a SQL injection string', () => {
    expect(isValidUuid("'; DROP TABLE callbacks;--")).toBe(false);
  });

  it('rejects an empty string', () => {
    expect(isValidUuid('')).toBe(false);
  });

  it('rejects a UUID missing a segment', () => {
    expect(isValidUuid('a1b2c3d4-e5f6-7890-abcd')).toBe(false);
  });

  it('rejects a UUID with wrong segment length', () => {
    expect(isValidUuid('a1b2c3d4-e5f6-7890-abcd-ef123456789')).toBe(false);
  });

  it('rejects a UUID with non-hex chars', () => {
    expect(isValidUuid('g1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(false);
  });
});

describe('wireNotificationRouter — cleanup', () => {
  it('returns a cleanup function that removes the listener', () => {
    const removeMock = jest.fn();
    mockAddNotificationResponseReceivedListener.mockReturnValue({ remove: removeMock });

    const cleanup = wireNotificationRouter(makeNavigationRef(jest.fn()));
    cleanup();

    expect(removeMock).toHaveBeenCalledTimes(1);
  });
});
