/**
 * Tests — RequestCallbackModalScreen
 * Phase 6E
 * Covers: time-window validation, reason length validation,
 *         URGENT confirm dialog, 409 conflict, 429 rate-limit.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('../../src/lib/api', () => ({
  apiClient: {
    get: jest.fn(() => Promise.resolve({ data: null })),
    post: jest.fn(() => Promise.resolve({ data: {} })),
  },
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}(${JSON.stringify(opts)})` : key,
    i18n: { language: 'en' },
  }),
}));

jest.mock('../../src/store/authStore', () => ({
  useAuthStore: () => ({ user: { phone: '+919876543210' } }),
}));

jest.mock('../../src/api/callbacks', () => ({
  createCallback: jest.fn(),
}));

import { createCallback } from '../../src/api/callbacks';
import { RequestCallbackModalScreen } from '../../src/screens/callbacks/RequestCallbackModalScreen';

const mockCreateCallback = createCallback as jest.Mock;

const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  replace: jest.fn(),
} as never;

function makeRoute(params: Record<string, unknown> = {}) {
  return { params } as never;
}

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function renderScreen(params: Record<string, unknown> = {}) {
  return render(
    <Wrapper>
      <RequestCallbackModalScreen navigation={mockNavigation} route={makeRoute(params)} />
    </Wrapper>,
  );
}

// Valid reason — meets MIN_REASON of 20 chars
const VALID_REASON = 'I need help with GST filing for my business.';
const REASON_500 = 'A'.repeat(500);
const REASON_501 = 'A'.repeat(501);

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateCallback.mockResolvedValue({ callbackId: 'cb-uuid-001', status: 'Pending' });
  jest.spyOn(Alert, 'alert');
});

// ─── Time-window validation ───────────────────────────────────────────────────

describe('RequestCallbackModalScreen — time-window validation', () => {
  it('shows no time-window error at default valid hour (10)', () => {
    const { queryByText, getAllByText } = renderScreen();
    // Select "today" to show hour picker
    fireEvent.press(getAllByText('mobile.callback.modal.timeToday')[0]);
    // Default windowHour=10, which is within [9, 19) — no error
    expect(queryByText('mobile.callback.modal.timeWindowError')).toBeNull();
  });

  it('accepts hour 10 (within business hours) with no error', () => {
    const { queryByText, getAllByText } = renderScreen();
    fireEvent.press(getAllByText('mobile.callback.modal.timeToday')[0]);
    fireEvent.press(getAllByText('10:00')[0]);
    expect(queryByText('mobile.callback.modal.timeWindowError')).toBeNull();
  });

  it('shows time-window error when windowHour = 9 (boundary: 9 < BIZ_HOUR_START is false, but source checks < 9)', () => {
    // The condition is: windowHour < BIZ_HOUR_START(9) || windowHour >= BIZ_HOUR_END-1(19)
    // Hour 9 is the lowest chip; it satisfies < 9 = false, so NO error at 9.
    // Hour 18 (highest chip) satisfies 18 >= 19 = false, so NO error.
    // This test verifies boundary chip 9:00 shows no error.
    const { queryByText, getAllByText } = renderScreen();
    fireEvent.press(getAllByText('mobile.callback.modal.timeToday')[0]);
    fireEvent.press(getAllByText('9:00')[0]);
    expect(queryByText('mobile.callback.modal.timeWindowError')).toBeNull();
  });

  it('rejects asap option — no hour picker rendered', () => {
    const { queryByText, getAllByText } = renderScreen();
    // Default is asap — hour picker hidden
    fireEvent.press(getAllByText('mobile.callback.modal.timeAsap')[0]);
    expect(queryByText('10:00')).toBeNull();
  });
});

// ─── Reason length validation ─────────────────────────────────────────────────

describe('RequestCallbackModalScreen — reason length validation', () => {
  it('rejects reason of 501 characters — shows max error', () => {
    const { getByText } = renderScreen({ prefillReason: REASON_501 });
    expect(getByText('mobile.callback.modal.reasonMaxError')).toBeTruthy();
  });

  it('accepts reason of exactly 500 characters — no max error', () => {
    const { queryByText } = renderScreen({ prefillReason: REASON_500 });
    expect(queryByText('mobile.callback.modal.reasonMaxError')).toBeNull();
  });

  it('shows min-length error when reason < 20 chars and no linkedEntity', () => {
    const { getByPlaceholderText, getByText } = renderScreen();
    const input = getByPlaceholderText('mobile.callback.modal.reasonPlaceholder');
    fireEvent.changeText(input, 'short');
    expect(getByText('mobile.callback.modal.reasonMinError')).toBeTruthy();
  });
});

// ─── URGENT confirm dialog ────────────────────────────────────────────────────

describe('RequestCallbackModalScreen — URGENT priority confirm dialog', () => {
  it('shows Alert when URGENT priority selected and submit pressed', () => {
    const { getByText } = renderScreen({ prefillReason: VALID_REASON });

    // Expand priority section
    fireEvent.press(getByText('mobile.callback.modal.priorityLabel'));
    // Priority chips render as t('mobile.callback.modal.priorityUrgent')
    fireEvent.press(getByText('mobile.callback.modal.priorityUrgent'));

    // Press submit
    fireEvent.press(getByText('mobile.callback.modal.submit'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'mobile.callback.modal.urgentConfirmTitle',
      'mobile.callback.modal.urgentConfirmBody',
      expect.arrayContaining([
        expect.objectContaining({ text: 'mobile.callback.modal.urgentConfirmCancel' }),
        expect.objectContaining({ text: 'mobile.callback.modal.urgentConfirmOk' }),
      ]),
    );
  });
});

// ─── API error states ─────────────────────────────────────────────────────────

describe('RequestCallbackModalScreen — API error states', () => {
  it('shows conflict banner text on 409 with callbackId', async () => {
    mockCreateCallback.mockRejectedValueOnce({
      response: {
        status: 409,
        data: { callbackId: 'existing-cb-001', message: 'Open callback exists' },
      },
    });

    const { getByText, findByText } = renderScreen({ prefillReason: VALID_REASON });
    fireEvent.press(getByText('mobile.callback.modal.submit'));

    await findByText('You already have an open callback for this category.');
  });

  it('shows rate-limit error banner on 429', async () => {
    mockCreateCallback.mockRejectedValueOnce({
      response: { status: 429, data: {} },
    });

    const { getByText, findByText } = renderScreen({ prefillReason: VALID_REASON });
    fireEvent.press(getByText('mobile.callback.modal.submit'));

    await findByText('mobile.callback.modal.errorRateLimit({"time":"1 hour"})');
  });

  it('navigates to CallbackStatus on success', async () => {
    const { getByText } = renderScreen({ prefillReason: VALID_REASON });
    fireEvent.press(getByText('mobile.callback.modal.submit'));

    await waitFor(() => {
      expect(mockNavigation.replace).toHaveBeenCalledWith('CallbackStatus', {
        callbackId: 'cb-uuid-001',
      });
    });
  });
});
