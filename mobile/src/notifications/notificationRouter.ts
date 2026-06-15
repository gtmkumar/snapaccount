/**
 * Push Notification Deep-Link Router
 * Phase 6E — addNotificationResponseReceivedListener wiring
 * Phase 6F — added: chat_message_received → ChatDetail, loan_disbursed → LoanStatus
 * SEC-055 / SEC-034 — UUID validation on all id params before navigation
 *
 * Notification data payload shapes expected from backend:
 *   { type: 'gst' }                                   → GstDashboard
 *   { type: 'itr' }                                   → ITRDashboard
 *   { type: 'callback', id: '<uuid>' }                → CallbackStatus
 *   { type: 'document', id: '<uuid>' }                → DocumentDetail
 *   { type: 'chat_message_received', threadId: '…' }  → ChatDetail
 *   { type: 'loan_disbursed', loanId: '…' }           → LoanStatus
 *   { type: 'loan_approved', loanId: '…' }            → LoanStatus
 *   { type: 'org_invite', token: '…' }                → AcceptInvite
 *   Wave 7A (GAP-047/031) [confirm 7A payload types]:
 *   { type: 'device_approval_request', id: '<uuid>' } → DeviceApproval (old device)
 *   { type: 'device_signin_notice' }                  → Devices (soft-launch notify-only)
 *   { type: 'ca_appointment_reminder', id: '<uuid>' } → AppointmentDetail
 *   (default)                                         → App root
 */

import * as Notifications from 'expo-notifications';
import type { NavigationContainerRef } from '@react-navigation/native';

type RootParamList = Record<string, object | undefined>;

/**
 * SEC-055 / SEC-034: Validate that a string is a well-formed UUID v1–v5.
 * Accepts lowercase and uppercase hex digits; rejects any injection attempt.
 * On invalid id, callers fall through to the default (root) case.
 */
export function isValidUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

/**
 * Wire up notification response listener.
 * Call once after NavigationContainer is ready.
 *
 * @param navigationRef - ref to NavigationContainer
 * @returns cleanup function
 */
export function wireNotificationRouter(
  navigationRef: NavigationContainerRef<RootParamList>,
): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as Record<string, string> | undefined;

    if (!data) return;

    const { type, id, threadId, loanId, token } = data as Record<string, string>;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nav = navigationRef.navigate as (...args: any[]) => void;

    switch (type) {
      case 'gst':
        navigationRef.navigate('GstDashboard' as never);
        break;

      case 'itr':
        navigationRef.navigate('ITRDashboard' as never);
        break;

      case 'callback':
        // SEC-034/SEC-055: validate UUID before navigating
        if (id && isValidUuid(id)) {
          nav('CallbackStatus', { callbackId: id });
        }
        break;

      case 'document':
        // SEC-034/SEC-055: validate UUID before navigating
        if (id && isValidUuid(id)) {
          nav('DocumentDetail', { documentId: id });
        }
        break;

      // Phase 6F: Chat deep-link — SEC-055: validate threadId as UUID
      case 'chat_message_received':
        if (threadId && isValidUuid(threadId)) {
          nav('ChatDetail', { threadId, source: 'push' });
        }
        break;

      // Phase 6F: Loan status deep-links — SEC-055: validate loanId as UUID
      case 'loan_disbursed':
      case 'loan_approved':
        if (loanId && isValidUuid(loanId)) {
          nav('LoanStatus', { loanId });
        }
        break;

      // Wave 7A (GAP-047): OLD-device approval request — SEC-055 UUID-validate.
      case 'device_approval_request':
        if (id && isValidUuid(id)) {
          nav('DeviceApproval', { requestId: id });
        }
        break;

      // Wave 7A (GAP-047): soft-launch notify-only — review devices, no gate.
      case 'device_signin_notice':
        navigationRef.navigate('Devices' as never);
        break;

      // Wave 7A (GAP-031): 30/5-min appointment reminders — SEC-055 validated.
      case 'ca_appointment_reminder':
        if (id && isValidUuid(id)) {
          nav('AppointmentDetail', { appointmentId: id });
        }
        break;

      // Phase 2: org-invite push — route to the AcceptInvite flow with the token.
      // The token is a one-time opaque secret (not a UUID), so it is forwarded
      // as-is; the AcceptInvite screen validates it server-side before any action.
      case 'org_invite':
        if (token) {
          nav('AcceptInvite', { token });
        }
        break;

      default:
        // Navigate to app root — nothing to do if already there
        break;
    }
  });

  return () => sub.remove();
}
