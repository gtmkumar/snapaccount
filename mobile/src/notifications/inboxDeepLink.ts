/**
 * Inbox deep-link resolver — Phase 6E (DG-NOTIF-05).
 *
 * Maps a backend inbox notification (deepLinkUrl + linkedEntityType/Id) to an
 * in-app navigation action. Mirrors the push-tap router (notificationRouter.ts)
 * so a tapped/long-pressed inbox row lands on the same screen a push would.
 *
 * Deep-link sources, in priority order:
 *   1. deepLinkUrl in the `snapaccount://…` app scheme (matches RootNavigator
 *      linking prefixes) → handed to Linking so the NavigationContainer linking
 *      config resolves the screen.
 *   2. linkedEntityType + linkedEntityId → resolved to a typed navigate() call
 *      (the robust path — the backend always populates these from the catalog).
 *
 * SEC-055 / SEC-034: every id forwarded to a navigate() target is UUID-validated
 * (via isValidUuid) before navigation; non-UUID ids fall through to no-op rather
 * than navigating to an attacker-controlled target.
 */

import { isValidUuid } from './notificationRouter';
import type { InboxNotification } from '../api/notifications';

/** App custom scheme — must match app.json `scheme` + RootNavigator prefixes. */
export const APP_SCHEME_PREFIX = 'snapaccount://';

/**
 * A resolved navigation intent.
 *
 * `kind: 'navigate'` carries a route name + params. The route names are the same
 * ones the push deep-link router (notificationRouter.ts) dispatches via the root
 * NavigationContainer, so `navigate(screen, params)` resolves them across the
 * persona-conditional tab/stack tree exactly as a push tap would. The screen
 * dispatches it through a guarded navigate() that degrades to a no-op if the
 * target is not mounted for the current persona.
 * `kind: 'url'` hands the snapaccount:// URL to Linking for the linking config.
 */
export type InboxNavIntent =
  | { kind: 'navigate'; screen: string; params?: Record<string, unknown> }
  | { kind: 'url'; url: string }
  | null;

/**
 * linkedEntityType (lowercased) → in-app target. Mirrors notificationRouter's
 * push `type` switch so inbox taps and push taps converge on the same screens.
 */
function navByEntity(
  entityType: string | null | undefined,
  entityId: string | null | undefined,
): InboxNavIntent {
  if (!entityType) return null;
  const type = entityType.toLowerCase();
  const id = entityId ?? undefined;

  switch (type) {
    case 'gst':
    case 'gst_return':
    case 'gstreturn':
      return { kind: 'navigate', screen: 'GstDashboard' };

    case 'itr':
    case 'itr_filing':
    case 'filing':
      return { kind: 'navigate', screen: 'ItrDashboard' };

    case 'callback':
      return id && isValidUuid(id)
        ? { kind: 'navigate', screen: 'CallbackStatus', params: { callbackId: id } }
        : null;

    case 'document':
      return id && isValidUuid(id)
        ? { kind: 'navigate', screen: 'DocumentDetail', params: { documentId: id } }
        : null;

    case 'chat':
    case 'thread':
      return id && isValidUuid(id)
        ? { kind: 'navigate', screen: 'ChatDetail', params: { threadId: id, source: 'inbox' } }
        : null;

    case 'loan':
      return id && isValidUuid(id)
        ? { kind: 'navigate', screen: 'LoanStatus', params: { loanId: id } }
        : null;

    case 'appointment':
      return id && isValidUuid(id)
        ? { kind: 'navigate', screen: 'AppointmentDetail', params: { appointmentId: id } }
        : null;

    case 'subscription':
    case 'billing':
      return { kind: 'navigate', screen: 'Billing' };

    default:
      return null;
  }
}

/**
 * Resolve the navigation intent for an inbox notification. Returns null when the
 * notification has no actionable deep-link (a non-Pressable, non-navigating row).
 */
export function resolveInboxDeepLink(n: InboxNotification): InboxNavIntent {
  // 1. App-scheme deepLinkUrl — let the linking config resolve it.
  if (n.deepLinkUrl && n.deepLinkUrl.startsWith(APP_SCHEME_PREFIX)) {
    return { kind: 'url', url: n.deepLinkUrl };
  }

  // 2. linkedEntityType/Id — the robust, always-populated path.
  return navByEntity(n.linkedEntityType, n.linkedEntityId);
}

/** True when a row should render as a Pressable (i.e. it has a deep-link). */
export function hasInboxDeepLink(n: InboxNotification): boolean {
  return resolveInboxDeepLink(n) !== null;
}
