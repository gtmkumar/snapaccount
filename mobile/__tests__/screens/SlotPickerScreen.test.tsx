/**
 * SlotPickerScreen — Wave 7A / GAP-031.
 * Covers: skeleton while loading, IST caption + grouped slots, per-day empty,
 * continue disabled until a slot is selected, continue → BookingConfirm,
 * reschedule mode calls the reschedule endpoint and surfaces the server
 * cutoff banner on 4xx.
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
    getCaSlots: jest.fn(),
    getSlotDayMap: jest.fn(),
    rescheduleAppointment: jest.fn(),
  };
});

import { getCaSlots, getSlotDayMap, rescheduleAppointment } from '../../src/api/appointments';
import { SlotPickerScreen } from '../../src/screens/appointments/SlotPickerScreen';

const mockGetCaSlots = getCaSlots as jest.Mock;
const mockGetSlotDayMap = getSlotDayMap as jest.Mock;
const mockReschedule = rescheduleAppointment as jest.Mock;

const SLOTS = {
  slots: [
    { slotId: 's-morning', startsAt: '2026-06-15T05:00:00Z', durationMinutes: 30, available: true }, // 10:30 IST
    { slotId: 's-evening', startsAt: '2026-06-15T13:00:00Z', durationMinutes: 30, available: false }, // 18:30 IST
  ],
};

/** IST calendar date (YYYY-MM-DD) for today + offset days — mirrors the screen. */
function istDateKey(offsetDays: number): string {
  const d = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const navigation = {
  goBack: jest.fn(),
  navigate: jest.fn(),
  replace: jest.fn(),
} as never;

const route = (params: object) => ({ params }) as never;

describe('SlotPickerScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCaSlots.mockResolvedValue(SLOTS);
    // Wave 7 recon: per-day availability comes from /appointments/slots/day-map.
    mockGetSlotDayMap.mockResolvedValue([]);
  });

  it('shows the shaped skeleton while loading', () => {
    mockGetCaSlots.mockReturnValue(new Promise(() => undefined));
    const { getByTestId } = render(
      <SlotPickerScreen navigation={navigation} route={route({ caProfileId: 'ca1', caName: 'CA Asha' })} />,
      { wrapper: makeWrapper() },
    );
    // Skeletons are a11y-hidden (decorative) — include hidden elements.
    expect(getByTestId('slot-picker-skeleton', { includeHiddenElements: true })).toBeTruthy();
  });

  it('renders IST caption, part-of-day groups and disables booked slots', async () => {
    const { getByText, getByTestId } = render(
      <SlotPickerScreen navigation={navigation} route={route({ caProfileId: 'ca1', caName: 'CA Asha' })} />,
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(getByText('mobile.ca.slot.allTimesIst')).toBeTruthy());
    expect(getByText('mobile.ca.slot.partOfDay.morning')).toBeTruthy();
    expect(getByText('mobile.ca.slot.partOfDay.evening')).toBeTruthy();
    const booked = getByTestId('slot-picker-grid-slot-s-evening');
    expect(booked.props.accessibilityState.disabled).toBe(true);
  });

  it('continue stays disabled until a slot is selected, then navigates to BookingConfirm', async () => {
    const { getByTestId } = render(
      <SlotPickerScreen navigation={navigation} route={route({ caProfileId: 'ca1', caName: 'CA Asha' })} />,
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(getByTestId('slot-picker-grid-slot-s-morning')).toBeTruthy());

    const continueBtn = getByTestId('slot-picker-continue');
    expect(continueBtn.props.accessibilityState.disabled).toBe(true);

    fireEvent.press(getByTestId('slot-picker-grid-slot-s-morning'));
    fireEvent.press(getByTestId('slot-picker-continue'));

    expect((navigation as { navigate: jest.Mock }).navigate).toHaveBeenCalledWith(
      'BookingConfirm',
      expect.objectContaining({ caProfileId: 'ca1', slotId: 's-morning', durationMinutes: 30 }),
    );
  });

  it('per-day empty renders the inline "no slots" message', async () => {
    mockGetCaSlots.mockResolvedValue({ slots: [] });
    const { getByTestId } = render(
      <SlotPickerScreen navigation={navigation} route={route({ caProfileId: 'ca1', caName: 'CA Asha' })} />,
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(getByTestId('slot-picker-empty-day')).toBeTruthy());
  });

  it('day-map greys out zero-availability days and keeps days with slots tappable', async () => {
    const today = istDateKey(0);
    const tomorrow = istDateKey(1);
    mockGetSlotDayMap.mockResolvedValue([
      { date: today, availableCount: 3, hasSlots: true },
      { date: tomorrow, availableCount: 0, hasSlots: false },
    ]);
    const { getByTestId } = render(
      <SlotPickerScreen navigation={navigation} route={route({ caProfileId: 'ca1', caName: 'CA Asha' })} />,
      { wrapper: makeWrapper() },
    );
    await waitFor(() =>
      expect(mockGetSlotDayMap).toHaveBeenCalledWith('ca1', istDateKey(0), istDateKey(13)),
    );
    await waitFor(() => {
      const fullDay = getByTestId(`slot-picker-date-strip-chip-${tomorrow}`);
      expect(fullDay.props.accessibilityState.disabled).toBe(true);
    });
    const openDay = getByTestId(`slot-picker-date-strip-chip-${today}`);
    expect(openDay.props.accessibilityState.disabled).toBe(false);
  });

  it('reschedule mode calls the reschedule endpoint and shows the cutoff banner on 4xx', async () => {
    mockReschedule.mockRejectedValue({ response: { status: 422 } });
    const { getByTestId } = render(
      <SlotPickerScreen
        navigation={navigation}
        route={route({ caProfileId: 'ca1', caName: 'CA Asha', rescheduleAppointmentId: 'appt-9' })}
      />,
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(getByTestId('slot-picker-grid-slot-s-morning')).toBeTruthy());

    fireEvent.press(getByTestId('slot-picker-grid-slot-s-morning'));
    fireEvent.press(getByTestId('slot-picker-continue'));

    await waitFor(() => expect(mockReschedule).toHaveBeenCalledWith('appt-9', 's-morning'));
    // Server is source of truth for the ≥2h rule — banner explains, never silent.
    await waitFor(() => expect(getByTestId('slot-picker-cutoff-banner')).toBeTruthy());
  });
});
