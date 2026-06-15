/**
 * AppointmentDetailScreen — Wave 7A / GAP-031 Flow C (≥2h cutoff EXPLICIT).
 * Covers: >2h → cutoffOpen line + enabled Reschedule/Cancel;
 *         ≤2h → disabled buttons + warning banner + Message-CA escape
 *         (never silently disabled — a11y hint present);
 *         server 4xx on cancel flips to the closed presentation.
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

jest.mock('../../src/api/appointments', () => {
  const actual = jest.requireActual('../../src/api/appointments');
  return {
    ...actual,
    getAppointment: jest.fn(),
    cancelAppointment: jest.fn(),
    rateAppointment: jest.fn(),
  };
});

import {
  getAppointment,
  cancelAppointment,
} from '../../src/api/appointments';
import { AppointmentDetailScreen } from '../../src/screens/appointments/AppointmentDetailScreen';

const mockGetAppointment = getAppointment as jest.Mock;
const mockCancel = cancelAppointment as jest.Mock;

// Wave 7 recon: getAppointment now hits GET /appointments/{id} and returns the
// AppointmentDetail shape (topic/notes first-class + detail-only fields).
function appt(overrides: object = {}) {
  return {
    appointmentId: 'appt-1',
    caProfileId: 'ca1',
    caName: 'CA Asha',
    scheduledAt: new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString(), // 26h away
    durationMinutes: 30,
    status: 'CONFIRMED',
    topic: 'GST',
    notes: 'Need help with GSTR-2B reconciliation.',
    meetingUrl: 'https://meet.google.com/abc',
    rating: null,
    createdAt: new Date().toISOString(),
    ratingComment: null,
    ratedAt: null,
    cancelledByCa: false,
    caCancellationReason: null,
    ...overrides,
  };
}

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const navigation = { goBack: jest.fn(), navigate: jest.fn(), replace: jest.fn() } as never;
const route = { params: { appointmentId: 'appt-1' } } as never;

describe('AppointmentDetailScreen — cutoff rule', () => {
  beforeEach(() => jest.clearAllMocks());

  it('>2h away: explicit cutoff-open line + ENABLED Reschedule/Cancel', async () => {
    mockGetAppointment.mockResolvedValue(appt());
    const { getByTestId } = render(
      <AppointmentDetailScreen navigation={navigation} route={route} />,
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(getByTestId('appt-cutoff-open')).toBeTruthy());
    expect(getByTestId('appt-reschedule').props.accessibilityState.disabled).toBe(false);
    expect(getByTestId('appt-cancel').props.accessibilityState.disabled).toBe(false);
  });

  it('≤2h away: DISABLED buttons + warning banner + Message-CA escape, with a11y hint', async () => {
    mockGetAppointment.mockResolvedValue(
      appt({ scheduledAt: new Date(Date.now() + 30 * 60 * 1000).toISOString() }), // 30 min away
    );
    const { getByTestId } = render(
      <AppointmentDetailScreen navigation={navigation} route={route} />,
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(getByTestId('appt-cutoff-closed')).toBeTruthy());
    const reschedule = getByTestId('appt-reschedule');
    expect(reschedule.props.accessibilityState.disabled).toBe(true);
    // Never a bare disabled control — the WHY travels in the a11y hint.
    expect(reschedule.props.accessibilityHint).toContain('mobile.ca.appt.cutoffClosed');
    expect(getByTestId('appt-message-ca')).toBeTruthy();
  });

  it('reschedule navigates back into SlotPicker preloaded with the same CA', async () => {
    mockGetAppointment.mockResolvedValue(appt());
    const { getByTestId } = render(
      <AppointmentDetailScreen navigation={navigation} route={route} />,
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(getByTestId('appt-reschedule')).toBeTruthy());
    fireEvent.press(getByTestId('appt-reschedule'));
    expect((navigation as { navigate: jest.Mock }).navigate).toHaveBeenCalledWith('SlotPicker', {
      caProfileId: 'ca1',
      caName: 'CA Asha',
      rescheduleAppointmentId: 'appt-1',
    });
  });

  it('server "too late" (4xx) on cancel flips to the closed presentation', async () => {
    mockGetAppointment.mockResolvedValue(appt());
    mockCancel.mockRejectedValue({ response: { status: 422 } });
    const { getByTestId } = render(
      <AppointmentDetailScreen navigation={navigation} route={route} />,
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(getByTestId('appt-cancel')).toBeTruthy());
    fireEvent.press(getByTestId('appt-cancel'));
    // Confirm in the focus-trapped sheet
    await waitFor(() => expect(getByTestId('cancel-confirm-cta')).toBeTruthy());
    fireEvent.press(getByTestId('cancel-confirm-cta'));

    await waitFor(() => expect(mockCancel).toHaveBeenCalledWith('appt-1'));
    await waitFor(() => expect(getByTestId('appt-cutoff-closed')).toBeTruthy());
  });

  it('completed + unrated shows the Rate entry (opens RatingSheet)', async () => {
    mockGetAppointment.mockResolvedValue(
      appt({ status: 'COMPLETED', scheduledAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString() }),
    );
    const { getByTestId } = render(
      <AppointmentDetailScreen navigation={navigation} route={route} />,
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(getByTestId('appt-rate')).toBeTruthy());
    fireEvent.press(getByTestId('appt-rate'));
    await waitFor(() => expect(getByTestId('rating-sheet')).toBeTruthy());
  });
});
