/**
 * notificationRouter — Wave 7A additions (GAP-047 device approval, GAP-031
 * appointment reminders). SEC-055 UUID validation on all id params.
 */

import * as Notifications from 'expo-notifications';
import { wireNotificationRouter } from '../../src/notifications/notificationRouter';

const mockAddListener =
  Notifications.addNotificationResponseReceivedListener as jest.Mock;

type NotificationCallback = (response: {
  notification: { request: { content: { data: Record<string, string> | undefined } } };
}) => void;

let capturedListener: NotificationCallback | null = null;

beforeEach(() => {
  jest.clearAllMocks();
  capturedListener = null;
  mockAddListener.mockImplementation((cb: NotificationCallback) => {
    capturedListener = cb;
    return { remove: jest.fn() };
  });
});

const UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

function fire(data: Record<string, string>) {
  capturedListener!({ notification: { request: { content: { data } } } });
}

describe('wireNotificationRouter — Wave 7A routes', () => {
  it('device_approval_request routes to DeviceApproval with a valid UUID', () => {
    const navigate = jest.fn();
    wireNotificationRouter({ navigate } as never);
    fire({ type: 'device_approval_request', id: UUID });
    expect(navigate).toHaveBeenCalledWith('DeviceApproval', { requestId: UUID });
  });

  it('device_approval_request with a NON-UUID id does not navigate (SEC-055)', () => {
    const navigate = jest.fn();
    wireNotificationRouter({ navigate } as never);
    fire({ type: 'device_approval_request', id: '../evil' });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('device_signin_notice (soft-launch) routes to the Devices screen', () => {
    const navigate = jest.fn();
    wireNotificationRouter({ navigate } as never);
    fire({ type: 'device_signin_notice' });
    expect(navigate).toHaveBeenCalledWith('Devices');
  });

  it('ca_appointment_reminder routes to AppointmentDetail with a valid UUID', () => {
    const navigate = jest.fn();
    wireNotificationRouter({ navigate } as never);
    fire({ type: 'ca_appointment_reminder', id: UUID });
    expect(navigate).toHaveBeenCalledWith('AppointmentDetail', { appointmentId: UUID });
  });

  it('ca_appointment_reminder with a NON-UUID id does not navigate (SEC-055)', () => {
    const navigate = jest.fn();
    wireNotificationRouter({ navigate } as never);
    fire({ type: 'ca_appointment_reminder', id: 'not-a-uuid' });
    expect(navigate).not.toHaveBeenCalled();
  });
});
