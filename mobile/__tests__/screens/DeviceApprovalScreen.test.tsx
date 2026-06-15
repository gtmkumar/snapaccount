/**
 * DeviceApprovalScreen (OLD device) — Wave 7A / GAP-047, reconciled contract:
 * GET /auth/devices/pending-approvals + approve/deny with the REVIEWING
 * device entity id in the body.
 * Covers: metadata card, countdown, deny-safe guidance, approve → success
 * view, deny → blocked view + review-devices path, "Decide later",
 * resolved/expired (request gone from the pending list).
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}(${JSON.stringify(opts)})` : key,
    i18n: { language: 'en' },
  }),
}));

jest.mock('../../src/api/auth', () => {
  const actual = jest.requireActual('../../src/api/auth');
  return {
    ...actual,
    getDeviceApprovalRequest: jest.fn(),
    approveDeviceRequest: jest.fn(() => Promise.resolve()),
    denyDeviceRequest: jest.fn(() => Promise.resolve()),
    findReviewingDeviceEntityId: jest.fn(() => Promise.resolve('dev-entity-1')),
  };
});

import {
  approveDeviceRequest,
  denyDeviceRequest,
  getDeviceApprovalRequest,
} from '../../src/api/auth';
import { DeviceApprovalScreen } from '../../src/screens/profile/DeviceApprovalScreen';

const mockGet = getDeviceApprovalRequest as jest.Mock;
const mockApprove = approveDeviceRequest as jest.Mock;
const mockDeny = denyDeviceRequest as jest.Mock;

const REQUEST = {
  requestId: 'r1',
  status: 'PENDING',
  newDeviceId: 'new-dev-9',
  deviceModel: 'Pixel 9',
  deviceOs: 'Android 16',
  cityApprox: null,
  requestedAt: '2026-06-12T05:00:00Z',
  expiresAt: new Date(Date.now() + 9 * 60 * 1000).toISOString(),
};

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const navigation = { goBack: jest.fn(), replace: jest.fn() } as never;
const route = { params: { requestId: 'r1' } } as never;

describe('DeviceApprovalScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGet.mockResolvedValue(REQUEST);
  });

  it('renders metadata card, live countdown and deny-safe guidance', async () => {
    const { getByTestId, getByText } = render(
      <DeviceApprovalScreen navigation={navigation} route={route} />,
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(getByTestId('device-meta-card')).toBeTruthy());
    expect(getByTestId('approval-countdown')).toBeTruthy();
    expect(getByText('mobile.device.approval.denyHint')).toBeTruthy();
    // Approximate-location label (never implies precise tracking)
    expect(getByText('mobile.device.meta.location')).toBeTruthy();
  });

  it('Approve sends the reviewing device id and shows the approved view', async () => {
    const { getByTestId, getByText } = render(
      <DeviceApprovalScreen navigation={navigation} route={route} />,
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(getByTestId('device-approval-approve')).toBeTruthy());
    expect(getByTestId('device-approval-approve').props.accessibilityLabel).toContain(
      'mobile.device.approval.approveA11y',
    );
    fireEvent.press(getByTestId('device-approval-approve'));
    await waitFor(() => expect(mockApprove).toHaveBeenCalledWith('r1', 'dev-entity-1'));
    await waitFor(() => expect(getByText('mobile.device.approval.approved')).toBeTruthy());
  });

  it('Deny blocks the sign-in and offers the review-devices secure path', async () => {
    const { getByTestId, getByText } = render(
      <DeviceApprovalScreen navigation={navigation} route={route} />,
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(getByTestId('device-approval-deny')).toBeTruthy());
    fireEvent.press(getByTestId('device-approval-deny'));
    await waitFor(() => expect(mockDeny).toHaveBeenCalledWith('r1', 'dev-entity-1'));
    await waitFor(() => expect(getByText('mobile.device.approval.denied')).toBeTruthy());
    fireEvent.press(getByTestId('device-approval-review-devices'));
    expect((navigation as { replace: jest.Mock }).replace).toHaveBeenCalledWith('Devices');
  });

  it('"Decide later" backs out without approving or denying', async () => {
    const { getByTestId } = render(
      <DeviceApprovalScreen navigation={navigation} route={route} />,
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(getByTestId('device-approval-later')).toBeTruthy());
    fireEvent.press(getByTestId('device-approval-later'));
    expect((navigation as { goBack: jest.Mock }).goBack).toHaveBeenCalled();
    expect(mockApprove).not.toHaveBeenCalled();
    expect(mockDeny).not.toHaveBeenCalled();
  });

  it('resolved/expired request (gone from pending list) shows the expiry state', async () => {
    mockGet.mockResolvedValue(null);
    const { getByTestId, queryByTestId } = render(
      <DeviceApprovalScreen navigation={navigation} route={route} />,
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(getByTestId('device-approval-expired')).toBeTruthy());
    expect(queryByTestId('device-approval-approve')).toBeNull();
  });
});
