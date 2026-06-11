/**
 * ITRDashboardScreen — M5 navigation wiring tests
 *
 * Verifies that the three quick-action buttons navigate to real ItrStack routes
 * instead of showing Alert stubs ("Coming Soon").
 *
 * Navigation decisions:
 *   - "Start Filing"  → EmployeeProfileWizard (starts the ITR wizard)
 *   - "Doc Checklist" → DocChecklist (assesseeId = user.id)
 *   - "Compare Regime"→ EmployeeProfileWizard when no returns; RegimeComparison
 *                        when at least one return exists (filingId = returns[0].id)
 */

import React from 'react';
import { Alert } from 'react-native';
import { act, render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider, notifyManager } from '@tanstack/react-query';
import { ITRDashboardScreen } from '../../src/screens/itr/ITRDashboardScreen';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockApiGet = jest.fn(() => Promise.resolve({ data: [] }));

jest.mock('../../src/lib/api', () => {
  const mockClient = { get: (...args: unknown[]) => mockApiGet(...args) };
  // __esModule: true tells Babel's _interopRequireDefault NOT to double-wrap the default export.
  // Without this, import apiClient from '../../lib/api' would resolve to
  // _interopRequireDefault(module).default.default instead of .default.
  return {
    __esModule: true,
    default: mockClient,
    apiClient: mockClient,
  };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      // Return arrays for the features.items key (returnObjects usage)
      if (opts?.returnObjects && key === 'mobile.itr.dashboard.features.items') {
        return ['Feature 1', 'Feature 2'];
      }
      return opts ? `${key}(${JSON.stringify(opts)})` : key;
    },
    i18n: { language: 'en' },
  }),
}));

jest.mock('../../src/hooks/usePreventScreenCapture', () => ({
  useSensitiveScreen: jest.fn(),
}));

jest.mock('../../src/store/authStore', () => ({
  useAuthStore: (selector: (s: { user: { id: string } }) => unknown) =>
    selector({ user: { id: 'user-test-id' } }),
}));

jest.mock('../../src/components/callbacks/RequestCallbackCta', () => ({
  RequestCallbackCta: () => null,
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();

const mockNavigation = {
  navigate: mockNavigate,
  goBack: mockGoBack,
} as never;

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('ITRDashboardScreen — renders without crash', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiGet.mockResolvedValue({ data: [] });
  });

  it('renders without crashing', () => {
    expect(() =>
      render(<ITRDashboardScreen navigation={mockNavigation} />, { wrapper: makeWrapper() }),
    ).not.toThrow();
  });

  it('renders Start Filing quick action button', () => {
    const { getByLabelText } = render(
      <ITRDashboardScreen navigation={mockNavigation} />,
      { wrapper: makeWrapper() },
    );
    expect(
      getByLabelText('mobile.itr.dashboard.action.startFiling'),
    ).toBeTruthy();
  });

  it('renders Doc Checklist quick action button', () => {
    const { getByLabelText } = render(
      <ITRDashboardScreen navigation={mockNavigation} />,
      { wrapper: makeWrapper() },
    );
    expect(
      getByLabelText('mobile.itr.dashboard.action.docChecklist'),
    ).toBeTruthy();
  });

  it('renders Compare Regime quick action button', () => {
    const { getByLabelText } = render(
      <ITRDashboardScreen navigation={mockNavigation} />,
      { wrapper: makeWrapper() },
    );
    expect(
      getByLabelText('mobile.itr.dashboard.action.compareRegime'),
    ).toBeTruthy();
  });
});

describe('ITRDashboardScreen — quick actions navigate instead of alerting', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockApiGet.mockResolvedValue({ data: [] });
    alertSpy = jest.spyOn(Alert, 'alert');
  });

  afterEach(() => alertSpy.mockRestore());

  it('Start Filing navigates to EmployeeProfileWizard with userId', async () => {
    const { getByLabelText } = render(
      <ITRDashboardScreen navigation={mockNavigation} />,
      { wrapper: makeWrapper() },
    );
    fireEvent.press(getByLabelText('mobile.itr.dashboard.action.startFiling'));
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        'EmployeeProfileWizard',
        expect.objectContaining({ userId: 'user-test-id' }),
      );
    });
    expect(alertSpy).not.toHaveBeenCalledWith(
      expect.stringMatching(/Coming Soon/i),
      expect.anything(),
    );
  });

  it('Doc Checklist navigates to DocChecklist with assesseeId', async () => {
    const { getByLabelText } = render(
      <ITRDashboardScreen navigation={mockNavigation} />,
      { wrapper: makeWrapper() },
    );
    fireEvent.press(getByLabelText('mobile.itr.dashboard.action.docChecklist'));
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        'DocChecklist',
        expect.objectContaining({ assesseeId: 'user-test-id' }),
      );
    });
    expect(alertSpy).not.toHaveBeenCalledWith(
      expect.stringMatching(/Coming Soon/i),
      expect.anything(),
    );
  });

  it('Compare Regime navigates to EmployeeProfileWizard when no returns exist', async () => {
    const { getByLabelText } = render(
      <ITRDashboardScreen navigation={mockNavigation} />,
      { wrapper: makeWrapper() },
    );
    fireEvent.press(getByLabelText('mobile.itr.dashboard.action.compareRegime'));
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        'EmployeeProfileWizard',
        expect.objectContaining({ userId: 'user-test-id' }),
      );
    });
    expect(alertSpy).not.toHaveBeenCalledWith(
      expect.stringMatching(/Coming Soon/i),
      expect.anything(),
    );
  });
});

describe('ITRDashboardScreen — Compare Regime with existing return', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiGet.mockResolvedValue({
      data: [{ id: 'filing-001', financialYear: '2024-25', status: 'FILED' }],
    });
    // Override TanStack Query v5's default scheduler (setTimeout 0) to run
    // synchronously so that query result notifications fire inside act() without
    // needing fake timer advances.
    notifyManager.setScheduler((cb) => cb());
  });

  afterEach(() => {
    // Restore the setTimeout-0 default scheduler used by TanStack Query v5.
    notifyManager.setScheduler((cb) => setTimeout(cb, 0));
  });

  it('Compare Regime navigates to RegimeComparison using first return filingId', async () => {
    const { getByLabelText } = render(
      <ITRDashboardScreen navigation={mockNavigation} />,
      { wrapper: makeWrapper() },
    );

    // With the synchronous scheduler, the queryFn promise still needs one
    // microtask flush for the async/await chain inside queryFn to resolve.
    // act(async) drains the microtask queue including the queryFn chain.
    await act(async () => {
      // intentional: lets the queryFn's Promise.resolve settle
    });

    // At this point returns=[{id:'filing-001',...}] — pressing Compare Regime
    // should navigate to RegimeComparison (not EmployeeProfileWizard).
    fireEvent.press(getByLabelText('mobile.itr.dashboard.action.compareRegime'));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        'RegimeComparison',
        expect.objectContaining({ filingId: 'filing-001' }),
      );
    });
  });
});
