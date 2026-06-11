/**
 * MyAppointmentsScreen — Wave 7A / GAP-031 Flow B.
 * Covers: Upcoming/Past tabs, Join CTA only inside the join window,
 * Rate CTA on unrated past appointments, per-tab empty states, error state
 * with the assisted-callback escape.
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
    listAppointments: jest.fn(),
    rateAppointment: jest.fn(),
  };
});

import { listAppointments } from '../../src/api/appointments';
import { MyAppointmentsScreen } from '../../src/screens/appointments/MyAppointmentsScreen';

const mockList = listAppointments as jest.Mock;

function appt(overrides: object = {}) {
  return {
    appointmentId: 'a1',
    caProfileId: 'ca1',
    caName: 'CA Asha',
    scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    durationMinutes: 30,
    status: 'CONFIRMED',
    topic: 'GST',
    meetingUrl: 'https://meet.google.com/abc',
    rating: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const navigation = { goBack: jest.fn(), navigate: jest.fn() } as never;

describe('MyAppointmentsScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders both tabs (44pt segments) and defaults to Upcoming', async () => {
    mockList.mockResolvedValue({ items: [appt()], totalCount: 1 });
    const { getByTestId } = render(<MyAppointmentsScreen navigation={navigation} />, {
      wrapper: makeWrapper(),
    });
    expect(getByTestId('appts-tab-upcoming').props.accessibilityState.selected).toBe(true);
    await waitFor(() => expect(mockList).toHaveBeenCalledWith('upcoming'));
  });

  it('upcoming inside the join window shows the Join CTA', async () => {
    mockList.mockResolvedValue({
      items: [appt({ scheduledAt: new Date(Date.now() + 5 * 60 * 1000).toISOString() })],
      totalCount: 1,
    });
    const { getByTestId } = render(<MyAppointmentsScreen navigation={navigation} />, {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(getByTestId('appointment-card-a1-join')).toBeTruthy());
  });

  it('past unrated appointment exposes the Rate CTA which opens the RatingSheet', async () => {
    mockList.mockResolvedValue({
      items: [
        appt({
          status: 'COMPLETED',
          scheduledAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
        }),
      ],
      totalCount: 1,
    });
    const { getByTestId } = render(<MyAppointmentsScreen navigation={navigation} />, {
      wrapper: makeWrapper(),
    });
    fireEvent.press(getByTestId('appts-tab-past'));
    await waitFor(() => expect(mockList).toHaveBeenCalledWith('past'));
    await waitFor(() => expect(getByTestId('appointment-card-a1-rate')).toBeTruthy());
    fireEvent.press(getByTestId('appointment-card-a1-rate'));
    await waitFor(() => expect(getByTestId('rating-sheet')).toBeTruthy());
  });

  it('upcoming empty state offers the booking CTA', async () => {
    mockList.mockResolvedValue({ items: [], totalCount: 0 });
    const { getByTestId } = render(<MyAppointmentsScreen navigation={navigation} />, {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(getByTestId('appts-empty-upcoming')).toBeTruthy());
    fireEvent.press(getByTestId('appts-empty-upcoming-cta'));
    expect((navigation as { navigate: jest.Mock }).navigate).toHaveBeenCalledWith('CaSelect');
  });

  it('error state offers retry + the assisted-callback escape', async () => {
    mockList.mockRejectedValue(new Error('boom'));
    const { getByTestId } = render(<MyAppointmentsScreen navigation={navigation} />, {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(getByTestId('appts-error')).toBeTruthy());
    fireEvent.press(getByTestId('appts-error-secondary'));
    expect((navigation as { navigate: jest.Mock }).navigate).toHaveBeenCalledWith(
      'RequestCallbackModal',
      { category: 'OTHER' },
    );
  });
});
