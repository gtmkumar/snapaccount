/**
 * Phase 6E (DG-NOTIF-05) — NotificationCenter enhancement logic.
 * Locks the pure helpers that back the rebuilt inbox screen:
 *   - groupNotificationsByDay: Today / Yesterday / This week / dated buckets.
 *   - resolveInboxDeepLink / hasInboxDeepLink: app-scheme URL + linkedEntity →
 *     navigation intent, with SEC-055 UUID validation.
 * These are deterministic and need no native bridge, so they run without a mock.
 */

import {
  groupNotificationsByDay,
  type NotificationSection,
} from '../../src/notifications/groupByDay';
import {
  resolveInboxDeepLink,
  hasInboxDeepLink,
} from '../../src/notifications/inboxDeepLink';
import type { InboxNotification } from '../../src/api/notifications';

const VALID_UUID = '11111111-1111-1111-1111-111111111111';

function notif(over: Partial<InboxNotification> = {}): InboxNotification {
  return {
    id: over.id ?? 'n1',
    eventCode: over.eventCode ?? 'GST_DEADLINE_3_DAYS',
    category: over.category ?? 'GST',
    title: over.title ?? 'GSTR-3B due soon',
    body: over.body ?? 'Your March return is due in 3 days.',
    status: over.status ?? 'UNREAD',
    sentAt: over.sentAt ?? new Date().toISOString(),
    deepLinkUrl: over.deepLinkUrl ?? null,
    deepLinkLabel: over.deepLinkLabel ?? null,
    linkedEntityType: over.linkedEntityType ?? null,
    linkedEntityId: over.linkedEntityId ?? null,
    linkedEntityLabel: over.linkedEntityLabel ?? null,
  };
}

describe('groupNotificationsByDay', () => {
  const NOW = new Date('2026-06-28T12:00:00Z');

  it('buckets notifications into Today / Yesterday / This week / earlier', () => {
    const items: InboxNotification[] = [
      notif({ id: 'today', sentAt: '2026-06-28T08:00:00Z' }),
      notif({ id: 'yest', sentAt: '2026-06-27T08:00:00Z' }),
      notif({ id: 'week', sentAt: '2026-06-24T08:00:00Z' }),
      notif({ id: 'old', sentAt: '2026-05-01T08:00:00Z' }),
    ];
    const sections = groupNotificationsByDay(items, NOW);
    const keys = sections.map((s: NotificationSection) => s.key);
    expect(keys).toEqual(['today', 'yesterday', 'thisWeek', 'earlier']);
    expect(sections[0].data.map((d) => d.id)).toEqual(['today']);
    expect(sections[3].dateLabel).toBe('01 May');
  });

  it('keeps the today → yesterday → thisWeek → earlier order regardless of input order', () => {
    const items = [
      notif({ id: 'old', sentAt: '2026-05-01T08:00:00Z' }),
      notif({ id: 'today', sentAt: '2026-06-28T08:00:00Z' }),
    ];
    const sections = groupNotificationsByDay(items, NOW);
    expect(sections.map((s) => s.key)).toEqual(['today', 'earlier']);
  });

  it('splits distinct earlier dates into separate sections', () => {
    const items = [
      notif({ id: 'a', sentAt: '2026-05-10T08:00:00Z' }),
      notif({ id: 'b', sentAt: '2026-05-01T08:00:00Z' }),
    ];
    const sections = groupNotificationsByDay(items, NOW);
    const earlier = sections.filter((s) => s.key === 'earlier');
    expect(earlier).toHaveLength(2);
    // newest dated section first
    expect(earlier[0].dateLabel).toBe('10 May');
    expect(earlier[1].dateLabel).toBe('01 May');
  });

  it('returns no sections for an empty list', () => {
    expect(groupNotificationsByDay([], NOW)).toEqual([]);
  });
});

describe('resolveInboxDeepLink', () => {
  it('prefers an app-scheme deepLinkUrl', () => {
    const intent = resolveInboxDeepLink(
      notif({ deepLinkUrl: 'snapaccount://gst/returns/123' }),
    );
    expect(intent).toEqual({ kind: 'url', url: 'snapaccount://gst/returns/123' });
  });

  it('ignores non-app-scheme URLs and falls through to entity routing', () => {
    const intent = resolveInboxDeepLink(
      notif({ deepLinkUrl: 'https://evil.example.com', linkedEntityType: 'gst' }),
    );
    expect(intent).toEqual({ kind: 'navigate', screen: 'GstDashboard' });
  });

  it('routes a document entity to DocumentDetail with a valid UUID', () => {
    const intent = resolveInboxDeepLink(
      notif({ linkedEntityType: 'document', linkedEntityId: VALID_UUID }),
    );
    expect(intent).toEqual({
      kind: 'navigate',
      screen: 'DocumentDetail',
      params: { documentId: VALID_UUID },
    });
  });

  it('rejects a non-UUID entity id (SEC-055) → no navigation', () => {
    const intent = resolveInboxDeepLink(
      notif({ linkedEntityType: 'document', linkedEntityId: '../../etc/passwd' }),
    );
    expect(intent).toBeNull();
  });

  it('routes a callback entity to CallbackStatus', () => {
    const intent = resolveInboxDeepLink(
      notif({ category: 'CALLBACK', linkedEntityType: 'callback', linkedEntityId: VALID_UUID }),
    );
    expect(intent).toEqual({
      kind: 'navigate',
      screen: 'CallbackStatus',
      params: { callbackId: VALID_UUID },
    });
  });

  it('returns null (non-actionable row) when there is no deep-link', () => {
    expect(resolveInboxDeepLink(notif({ linkedEntityType: null }))).toBeNull();
    expect(hasInboxDeepLink(notif({ linkedEntityType: null }))).toBe(false);
  });

  it('hasInboxDeepLink is true when a target resolves', () => {
    expect(hasInboxDeepLink(notif({ linkedEntityType: 'gst' }))).toBe(true);
  });
});
