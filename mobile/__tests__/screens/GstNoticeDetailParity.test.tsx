/**
 * GstNoticeDetailScreen — Wave 7B / GAP-108 read-only parity.
 * Covers: form-type badge + meaning, statutory-deadline chip (open) vs static
 * responded row, GSTAT ladder render, backlog banner, and the read-only rule:
 * NO in-app respond form — admin/CA guidance + Message-CA path instead.
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

jest.mock('../../src/hooks/usePreventScreenCapture', () => ({
  useSensitiveScreen: jest.fn(),
}));

jest.mock('../../src/api/gst', () => {
  const actual = jest.requireActual('../../src/api/gst');
  return { ...actual, getGstNotice: jest.fn() };
});

import { getGstNotice } from '../../src/api/gst';
import { GstNoticeDetailScreen } from '../../src/screens/gst/GstNoticeDetailScreen';

const mockGetNotice = getGstNotice as jest.Mock;

const NOTICE = {
  id: 'n1',
  orgId: 'org1',
  noticeNumber: 'GST-2026-042',
  noticeType: 'Other',
  status: 'RECEIVED',
  issuedDate: '2026-06-01',
  dueDate: '2026-07-01',
  description: 'ITC mismatch for May 2026.',
  createdAt: '2026-06-01T00:00:00Z',
  updatedAt: '2026-06-01T00:00:00Z',
  formType: 'DRC_01C',
  statutoryDeadline: '2026-07-05',
  appealStage: 'APPEAL_FILED',
  isGstatBacklogFlagged: true,
};

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const navigation = { goBack: jest.fn(), navigate: jest.fn() } as never;
const route = { params: { noticeId: 'n1' } } as never;

describe('GstNoticeDetailScreen — Wave 7B parity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetNotice.mockResolvedValue(NOTICE);
  });

  it('renders form-type badge (verbatim code) with plain-language meaning', async () => {
    const { getByText } = render(
      <GstNoticeDetailScreen navigation={navigation} route={route} />,
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(getByText('DRC-01C')).toBeTruthy());
    expect(getByText('mobile.gst.formType.drc01c.meaning')).toBeTruthy();
  });

  it('open notice shows the statutory deadline countdown chip', async () => {
    const { getByTestId } = render(
      <GstNoticeDetailScreen navigation={navigation} route={route} />,
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(getByTestId('notice-deadline-chip')).toBeTruthy());
  });

  it('responded notice suppresses the countdown for a static "responded on" row', async () => {
    mockGetNotice.mockResolvedValue({
      ...NOTICE,
      status: 'RESPONDED',
      responseText: 'done',
      respondedAt: '2026-06-20T10:00:00Z',
    });
    const { getByTestId, queryByTestId } = render(
      <GstNoticeDetailScreen navigation={navigation} route={route} />,
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(getByTestId('notice-deadline-static')).toBeTruthy());
    expect(queryByTestId('notice-deadline-chip')).toBeNull();
  });

  it('renders the GSTAT ladder and the backlog-appeal banner', async () => {
    const { getByTestId, getByText } = render(
      <GstNoticeDetailScreen navigation={navigation} route={route} />,
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(getByTestId('gstat-ladder')).toBeTruthy());
    expect(getByTestId('gstat-backlog-banner')).toBeTruthy();
    expect(getByText('mobile.gst.gstat.backlogFlag')).toBeTruthy();
  });

  it('READ-ONLY: no respond form — admin/CA guidance + Message-CA instead (no Coming-Soon)', async () => {
    const { getByTestId, queryByText } = render(
      <GstNoticeDetailScreen navigation={navigation} route={route} />,
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(getByTestId('notice-action-guidance')).toBeTruthy());
    expect(getByTestId('notice-message-ca')).toBeTruthy();
    // The old in-app respond CTA is gone, and no Coming-Soon stub replaces it.
    expect(queryByText('mobile.gst.noticeDetail.respondCta')).toBeNull();
    expect(queryByText('mobile.common.comingSoon')).toBeNull();
  });
});
