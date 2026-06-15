/**
 * DeviceWaitingScreen (NEW device) — Wave 7A / GAP-047, Wave 7 reconciliation.
 * The screen polls GET /auth/devices/my-approval-status for a REAL verdict
 * (no more pending-list-disappearance heuristic). Covers:
 * PENDING/ENFORCE → countdown + echoed metadata + assisted escape;
 * APPROVED → markAuthenticated; DENIED → DeviceDenied(denied);
 * EXPIRED → DeviceDenied(expired); NOTIFY_ONLY (soft-launch) → no gate,
 * proceed straight in.
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
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
    getMyApprovalStatus: jest.fn(),
    getDeviceApprovalRequest: jest.fn(),
  };
});

const mockMarkAuthenticated = jest.fn();
jest.mock('../../src/store/authStore', () => ({
  useAuthStore: (selector: (s: object) => unknown) =>
    selector({ markAuthenticated: mockMarkAuthenticated }),
}));

import { getDeviceApprovalRequest, getMyApprovalStatus } from '../../src/api/auth';
import { DeviceWaitingScreen } from '../../src/screens/auth/DeviceWaitingScreen';

const mockStatus = getMyApprovalStatus as jest.Mock;
const mockMeta = getDeviceApprovalRequest as jest.Mock;

const EXPIRES_AT = new Date(Date.now() + 9 * 60 * 1000).toISOString();

const STATUS_PENDING = {
  approvalRequestId: 'r1',
  status: 'PENDING',
  decidedAt: null,
  expiresAt: EXPIRES_AT,
  mode: 'ENFORCE',
};

const META = {
  requestId: 'r1',
  status: 'PENDING',
  newDeviceId: 'new-dev-9',
  deviceModel: 'iPhone 17',
  deviceOs: 'iOS 26',
  cityApprox: null,
  requestedAt: '2026-06-12T05:00:00Z',
  expiresAt: EXPIRES_AT,
};

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const navigation = { replace: jest.fn(), goBack: jest.fn() } as never;
const route = { params: { requestId: 'r1' } } as never;

describe('DeviceWaitingScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMeta.mockResolvedValue(META);
  });

  it('PENDING (enforce): shows countdown, echoed metadata and the assisted escape', async () => {
    mockStatus.mockResolvedValue(STATUS_PENDING);
    const { getByTestId, getByText } = render(
      <DeviceWaitingScreen navigation={navigation} route={route} />,
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(getByTestId('approval-countdown')).toBeTruthy());
    expect(getByText('mobile.device.waiting.title')).toBeTruthy();
    expect(getByTestId('device-meta-card')).toBeTruthy();
    expect(getByTestId('device-waiting-escape')).toBeTruthy();
    expect(mockMarkAuthenticated).not.toHaveBeenCalled();
  });

  it('APPROVED → continues auth via markAuthenticated()', async () => {
    mockStatus.mockResolvedValue({
      ...STATUS_PENDING,
      status: 'APPROVED',
      decidedAt: new Date().toISOString(),
    });
    render(<DeviceWaitingScreen navigation={navigation} route={route} />, {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(mockMarkAuthenticated).toHaveBeenCalled());
  });

  it('DENIED → replaces with DeviceDenied (cause=denied)', async () => {
    mockStatus.mockResolvedValue({
      ...STATUS_PENDING,
      status: 'DENIED',
      decidedAt: new Date().toISOString(),
    });
    render(<DeviceWaitingScreen navigation={navigation} route={route} />, {
      wrapper: makeWrapper(),
    });
    await waitFor(() =>
      expect((navigation as { replace: jest.Mock }).replace).toHaveBeenCalledWith(
        'DeviceDenied',
        { cause: 'denied' },
      ),
    );
    expect(mockMarkAuthenticated).not.toHaveBeenCalled();
  });

  it('EXPIRED (server-computed) → replaces with DeviceDenied (cause=expired)', async () => {
    mockStatus.mockResolvedValue({
      ...STATUS_PENDING,
      status: 'EXPIRED',
      decidedAt: EXPIRES_AT,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    render(<DeviceWaitingScreen navigation={navigation} route={route} />, {
      wrapper: makeWrapper(),
    });
    await waitFor(() =>
      expect((navigation as { replace: jest.Mock }).replace).toHaveBeenCalledWith(
        'DeviceDenied',
        { cause: 'expired' },
      ),
    );
  });

  it('NOTIFY_ONLY (soft-launch): no gate — proceeds straight in (spec §4.2)', async () => {
    mockStatus.mockResolvedValue({ ...STATUS_PENDING, mode: 'NOTIFY_ONLY' });
    render(<DeviceWaitingScreen navigation={navigation} route={route} />, {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(mockMarkAuthenticated).toHaveBeenCalled());
    expect((navigation as { replace: jest.Mock }).replace).not.toHaveBeenCalled();
  });
});
