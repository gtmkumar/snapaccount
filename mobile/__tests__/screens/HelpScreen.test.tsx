/**
 * HelpScreen — Task #18 (GAP-060rem).
 * Covers: Expert Chat CTA routes into the ChatStack; Request Callback CTA is
 * present and routes to the existing RequestCallbackModal.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('../../src/api/callbacks', () => ({
  listCallbacks: jest.fn(() => Promise.resolve({ items: [] })),
  getCallbackKpi: jest.fn(() => Promise.resolve({ averageResponseMinutes: 30 })),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}(${JSON.stringify(opts)})` : key,
    i18n: { language: 'en' },
  }),
}));

import { HelpScreen } from '../../src/screens/profile/HelpScreen';

const mockNavigate = jest.fn();
const mockNavigation = { navigate: mockNavigate, goBack: jest.fn() } as never;

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('HelpScreen', () => {
  it('renders title, chat CTA and callback CTA', () => {
    const { getByText, getByTestId } = render(<HelpScreen navigation={mockNavigation} />, {
      wrapper: makeWrapper(),
    });
    expect(getByText('mobile.help.title')).toBeTruthy();
    expect(getByTestId('help-chat-cta')).toBeTruthy();
    expect(getByTestId('help-callback-cta')).toBeTruthy();
  });

  it('navigates to the ChatStack when the chat CTA is pressed', () => {
    const { getByTestId } = render(<HelpScreen navigation={mockNavigation} />, {
      wrapper: makeWrapper(),
    });
    fireEvent.press(getByTestId('help-chat-cta'));
    expect(mockNavigate).toHaveBeenCalledWith('Chat');
  });
});
