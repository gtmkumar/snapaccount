/**
 * Smoke tests — ITR screens suite (Phase 6D)
 * Tests: DocChecklist, RegimeComparison, FilingSummary, UserApproval,
 *        EVerification, RefundTracker, ItrNoticeInbox, ItrNoticeDetail
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ─── Global mocks ────────────────────────────────────────────────────────────

jest.mock('../../src/lib/api', () => ({
  apiClient: {
    get: jest.fn(() => Promise.resolve({ data: { items: [], totalCount: 0 } })),
    post: jest.fn(() => Promise.resolve({ data: {} })),
    put: jest.fn(() => Promise.resolve({ data: {} })),
  },
  default: {
    get: jest.fn(() => Promise.resolve({ data: null })),
  },
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}(${JSON.stringify(opts)})` : key,
    i18n: { language: 'en' },
  }),
}));

jest.mock('../../src/hooks/usePreventScreenCapture', () => ({
  useSensitiveScreen: jest.fn(),
}));

jest.mock('../../src/api/itr', () => ({
  getItrFiling: jest.fn(() => Promise.resolve({
    id: 'f1', assesseeId: 'a1', assessmentYear: 'AY2025-26',
    itrFormType: 'ITR-1', regime: 'NEW', status: 'DRAFT',
    createdAt: '2025-07-01', updatedAt: '2025-07-01',
  })),
  compareRegimes: jest.fn(() => Promise.resolve({
    old: { filingId: 'f1', grossTotalIncome: 1000000, taxableIncome: 850000, totalTaxPayable: 112500, payableOrRefund: 112500, computationHash: 'abc', regime: 'OLD', assessmentYear: 'AY2025-26' },
    new: { filingId: 'f1', grossTotalIncome: 1000000, taxableIncome: 1000000, totalTaxPayable: 100000, payableOrRefund: 100000, computationHash: 'def', regime: 'NEW', assessmentYear: 'AY2025-26' },
    recommendedRegime: 'NEW',
    taxSaving: 12500,
  })),
  getTaxSlabs: jest.fn(() => Promise.resolve({ versionId: 'v1', assessmentYear: 'AY2025-26', regime: 'NEW', slabsJson: [], standardDeduction: 50000, rebate87AIncomeLimit: 500000, rebate87AMaxAmount: 12500, cessRatePct: 4 })),
  getRefundStatus: jest.fn(() => Promise.resolve({
    filingId: 'f1', refundStatus: 'Pending', refundAmount: 5000,
    lastPolledAt: '2025-08-01T10:00:00Z',
  })),
  eVerifyFiling: jest.fn(() => Promise.resolve()),
  submitFilingForReview: jest.fn(() => Promise.resolve()),
  respondToItrNotice: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(() => Promise.resolve({ canceled: true, assets: [] })),
  launchCameraAsync: jest.fn(() => Promise.resolve({ canceled: true, assets: [] })),
  requestCameraPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
}));

// ─── Imports ─────────────────────────────────────────────────────────────────

import { DocChecklistScreen } from '../../src/screens/itr/DocChecklistScreen';
import { RegimeComparisonScreen } from '../../src/screens/itr/RegimeComparisonScreen';
import { FilingSummaryScreen } from '../../src/screens/itr/FilingSummaryScreen';
import { UserApprovalScreen } from '../../src/screens/itr/UserApprovalScreen';
import { EVerificationScreen } from '../../src/screens/itr/EVerificationScreen';
import { RefundTrackerScreen } from '../../src/screens/itr/RefundTrackerScreen';
import { ItrNoticeInboxScreen } from '../../src/screens/itr/ItrNoticeInboxScreen';
import { ItrNoticeDetailScreen } from '../../src/screens/itr/ItrNoticeDetailScreen';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const mockNav = { navigate: jest.fn(), goBack: jest.fn(), popToTop: jest.fn() } as never;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('DocChecklistScreen', () => {
  it('renders without crashing', () => {
    const route = { params: { assesseeId: 'a1', filingId: 'f1' } } as never;
    const { getByText } = render(
      <Wrapper><DocChecklistScreen navigation={mockNav} route={route} /></Wrapper>,
    );
    expect(getByText('mobile.itr.docChecklist.title')).toBeTruthy();
  });
});

describe('RegimeComparisonScreen', () => {
  it('renders without crashing', () => {
    const route = { params: { filingId: 'f1' } } as never;
    const { getByText } = render(
      <Wrapper><RegimeComparisonScreen navigation={mockNav} route={route} /></Wrapper>,
    );
    expect(getByText('mobile.itr.regimeComparison.title')).toBeTruthy();
  });
});

describe('FilingSummaryScreen', () => {
  it('renders without crashing', () => {
    const route = { params: { filingId: 'f1', regime: 'NEW' } } as never;
    const { getByText } = render(
      <Wrapper><FilingSummaryScreen navigation={mockNav} route={route} /></Wrapper>,
    );
    expect(getByText('mobile.itr.summary.title')).toBeTruthy();
  });
});

describe('UserApprovalScreen', () => {
  it('renders without crashing', () => {
    const route = { params: { filingId: 'f1' } } as never;
    const { getByText } = render(
      <Wrapper><UserApprovalScreen navigation={mockNav} route={route} /></Wrapper>,
    );
    expect(getByText('mobile.itr.approval.title')).toBeTruthy();
  });
});

describe('EVerificationScreen', () => {
  it('renders without crashing', () => {
    const route = { params: { filingId: 'f1' } } as never;
    const { getByText } = render(
      <Wrapper><EVerificationScreen navigation={mockNav} route={route} /></Wrapper>,
    );
    expect(getByText('mobile.itr.eVerify.title')).toBeTruthy();
  });

  it('renders countdown card', () => {
    const route = { params: { filingId: 'f1' } } as never;
    const { getByTestId } = render(
      <Wrapper><EVerificationScreen navigation={mockNav} route={route} /></Wrapper>,
    );
    expect(getByTestId('everify-countdown')).toBeTruthy();
  });
});

describe('RefundTrackerScreen', () => {
  it('renders without crashing', () => {
    const route = { params: { filingId: 'f1' } } as never;
    const { getByText } = render(
      <Wrapper><RefundTrackerScreen navigation={mockNav} route={route} /></Wrapper>,
    );
    expect(getByText('mobile.itr.refund.title')).toBeTruthy();
  });
});

describe('ItrNoticeInboxScreen', () => {
  it('renders without crashing', () => {
    const route = { params: { filingId: 'f1' } } as never;
    const { getByText } = render(
      <Wrapper><ItrNoticeInboxScreen navigation={mockNav} route={route} /></Wrapper>,
    );
    expect(getByText('mobile.itr.notices.title')).toBeTruthy();
  });
});

describe('ItrNoticeDetailScreen', () => {
  it('renders without crashing', () => {
    const route = { params: { noticeId: 'n1', filingId: 'f1' } } as never;
    const { getByText } = render(
      <Wrapper><ItrNoticeDetailScreen navigation={mockNav} route={route} /></Wrapper>,
    );
    expect(getByText('mobile.itr.noticeDetail.title')).toBeTruthy();
  });
});
