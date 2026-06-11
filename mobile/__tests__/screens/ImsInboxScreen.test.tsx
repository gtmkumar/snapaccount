/**
 * ImsInboxScreen — GAP-101 / board #32.
 * Covers the spec-mandated behaviours (docs/design/ims-inbox-spec.md):
 *  - status rendering (badges incl. "Deemed" tag, KPI counts)
 *  - action buttons by status (state-machine mirror — never offer illegal actions)
 *  - reject-reason client validation (required, min 3 chars)
 *  - deemed-acceptance banner logic (warning in window / info once past)
 *  - accept optimistic flow + 5s undo toast (undo lands on PENDING_KEPT)
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (!opts) return key;
      const { defaultValue, ...rest } = opts;
      void defaultValue;
      return Object.keys(rest).length ? `${key}(${JSON.stringify(rest)})` : key;
    },
    i18n: { language: 'en' },
  }),
}));

jest.mock('../../src/hooks/usePreventScreenCapture', () => ({
  useSensitiveScreen: jest.fn(),
}));

jest.mock('../../src/hooks/useScreenReaderEnabled', () => ({
  useScreenReaderEnabled: () => false,
}));

jest.mock('../../src/store/authStore', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({
      currentOrganization: { id: 'org-1', name: 'Acme Traders', gstin: '27AABCU9603R1ZM' },
      user: { id: 'user-1' },
    }),
}));

jest.mock('../../src/api/gstIms', () => {
  const actual = jest.requireActual('../../src/api/gstIms');
  return {
    ...actual,
    listImsInvoices: jest.fn(),
    getImsSummary: jest.fn(),
    syncImsInvoices: jest.fn(),
    actOnImsInvoice: jest.fn(),
    bulkActOnImsInvoices: jest.fn(),
  };
});

import {
  actOnImsInvoice,
  getImsSummary,
  listImsInvoices,
  type ImsInvoiceStatus,
  type ImsInvoiceSummary,
} from '../../src/api/gstIms';
import { legalImsActions } from '../../src/components/gst/ImsInvoiceCard';
import { ImsInboxScreen } from '../../src/screens/gst/ImsInboxScreen';

const mockList = listImsInvoices as jest.Mock;
const mockSummary = getImsSummary as jest.Mock;
const mockAct = actOnImsInvoice as jest.Mock;

const DAY = 86_400_000;

function isoInDays(days: number): string {
  return new Date(Date.now() + days * DAY).toISOString().slice(0, 10);
}

function makeInvoice(
  id: string,
  status: ImsInvoiceStatus,
  overrides: Partial<ImsInvoiceSummary> = {},
): ImsInvoiceSummary {
  return {
    id,
    supplierGstin: '29AAACX1234F1Z5',
    supplierName: `Supplier ${id}`,
    invoiceNumber: `INV-${id}`,
    invoiceDate: '2026-03-15',
    invoiceValue: 11800,
    taxableValue: 10000,
    igstAmount: 1800,
    cgstAmount: 0,
    sgstAmount: 0,
    cessAmount: 0,
    period: '052026',
    source: 'GSTR-1',
    status,
    deemedAccepted: false,
    actionedAt: null,
    actionedBy: null,
    ...overrides,
  };
}

function makeSummaryDto(overrides: Record<string, unknown> = {}) {
  return {
    period: '052026',
    pending: 2,
    accepted: 1,
    rejected: 1,
    pendingKept: 1,
    total: 5,
    deemedAccepted: 0,
    gstr2bGenerationDeadline: isoInDays(5),
    gstr2bGenerationPast: false,
    totalPendingValue: 23600,
    totalAcceptedValue: 11800,
    totalRejectedValue: 11800,
    ...overrides,
  };
}

const INVOICES = [
  makeInvoice('p1', 'PENDING'),
  makeInvoice('k1', 'PENDING_KEPT'),
  makeInvoice('a1', 'ACCEPTED'),
  makeInvoice('r1', 'REJECTED'),
  makeInvoice('d1', 'ACCEPTED', { deemedAccepted: true }),
];

function listResponse(items: ImsInvoiceSummary[]) {
  return { items, totalCount: items.length, page: 1, pageSize: 20 };
}

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() } as never;
const mockRoute = { params: { period: '052026' } } as never;

// The card info zone is hidden from the accessibility tree on purpose
// (composed single-unit SR label, spec §10.1) — opt in to query inside it.
const hidden = { includeHiddenElements: true };

function renderScreen() {
  const qc = new QueryClient({
    // gcTime: Infinity — avoids dangling GC timers leaking out of the test run
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ImsInboxScreen navigation={mockNavigation} route={mockRoute} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSummary.mockResolvedValue(makeSummaryDto());
  mockList.mockResolvedValue(listResponse(INVOICES));
  mockAct.mockResolvedValue({
    invoiceId: 'p1',
    previousStatus: 'PENDING',
    newStatus: 'ACCEPTED',
    changed: true,
    gstnRef: null,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// State-machine mirror (spec §0 — UI must never offer illegal actions)
// ─────────────────────────────────────────────────────────────────────────────

describe('legalImsActions', () => {
  it('PENDING offers accept / reject / keep-pending', () => {
    expect(legalImsActions('PENDING', false)).toEqual({
      accept: true,
      reject: true,
      keepPending: true,
      fixViaGstr1a: false,
    });
  });

  it('PENDING_KEPT can still accept/reject but not keep-pending again', () => {
    expect(legalImsActions('PENDING_KEPT', false)).toEqual({
      accept: true,
      reject: true,
      keepPending: false,
      fixViaGstr1a: false,
    });
  });

  it('terminal statuses only offer Fix via GSTR-1A (409 guard)', () => {
    expect(legalImsActions('ACCEPTED', false)).toEqual({
      accept: false,
      reject: false,
      keepPending: false,
      fixViaGstr1a: true,
    });
    expect(legalImsActions('REJECTED', false)).toEqual({
      accept: false,
      reject: false,
      keepPending: false,
      fixViaGstr1a: true,
    });
  });

  it('window past disables all IMS actions (spec §6.5)', () => {
    expect(legalImsActions('PENDING', true)).toEqual({
      accept: false,
      reject: false,
      keepPending: false,
      fixViaGstr1a: false,
    });
    expect(legalImsActions('REJECTED', true).fixViaGstr1a).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Status rendering
// ─────────────────────────────────────────────────────────────────────────────

describe('ImsInboxScreen — status rendering', () => {
  it('renders one card per invoice with its status badge', async () => {
    const { findByTestId, getByTestId } = renderScreen();
    await findByTestId('ims-card-p1');
    ['p1', 'k1', 'a1', 'r1', 'd1'].forEach((id) => {
      expect(getByTestId(`ims-card-${id}`)).toBeTruthy();
      expect(getByTestId(`ims-card-${id}-status`, hidden)).toBeTruthy();
    });
  });

  it('appends the "Deemed" tag only on deemed-accepted invoices (spec §8)', async () => {
    const { findByTestId, queryByTestId } = renderScreen();
    await findByTestId('ims-card-d1');
    expect(queryByTestId('ims-card-d1-status-deemed', hidden)).toBeTruthy();
    expect(queryByTestId('ims-card-a1-status-deemed', hidden)).toBeNull();
    expect(queryByTestId('ims-card-p1-status-deemed', hidden)).toBeNull();
  });

  it('shows KPI summary cards with live counts', async () => {
    const { findByTestId, getByTestId } = renderScreen();
    await findByTestId('ims-kpi-pending');
    expect(getByTestId('ims-kpi-pending')).toBeTruthy();
    expect(getByTestId('ims-kpi-accepted')).toBeTruthy();
    expect(getByTestId('ims-kpi-rejected')).toBeTruthy();
    expect(getByTestId('ims-kpi-pendingKept')).toBeTruthy();
  });

  it('shows the deemed-countdown chip on actionable rows and suppresses it on settled rows (spec §4)', async () => {
    const { findByTestId, queryByTestId } = renderScreen();
    await findByTestId('ims-card-p1');
    expect(queryByTestId('ims-card-p1-chip', hidden)).toBeTruthy(); // PENDING → countdown
    expect(queryByTestId('ims-card-k1-chip', hidden)).toBeTruthy(); // PENDING_KEPT → countdown
    expect(queryByTestId('ims-card-a1-chip', hidden)).toBeNull(); // explicit ACCEPTED → settled
    expect(queryByTestId('ims-card-r1-chip', hidden)).toBeNull(); // REJECTED → settled
    expect(queryByTestId('ims-card-d1-chip', hidden)).toBeTruthy(); // deemed → "Deemed accepted" chip
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Action buttons by status
// ─────────────────────────────────────────────────────────────────────────────

describe('ImsInboxScreen — action buttons by status', () => {
  it('PENDING rows expose Accept, Reject and Keep pending', async () => {
    const { findByTestId, queryByTestId } = renderScreen();
    await findByTestId('ims-card-p1');
    expect(queryByTestId('ims-card-p1-accept')).toBeTruthy();
    expect(queryByTestId('ims-card-p1-reject')).toBeTruthy();
    expect(queryByTestId('ims-card-p1-keep')).toBeTruthy();
    expect(queryByTestId('ims-card-p1-fix')).toBeNull();
  });

  it('PENDING_KEPT rows hide Keep pending but keep Accept/Reject', async () => {
    const { findByTestId, queryByTestId } = renderScreen();
    await findByTestId('ims-card-k1');
    expect(queryByTestId('ims-card-k1-accept')).toBeTruthy();
    expect(queryByTestId('ims-card-k1-reject')).toBeTruthy();
    expect(queryByTestId('ims-card-k1-keep')).toBeNull();
  });

  it('ACCEPTED/REJECTED rows hide Accept/Reject and surface Fix via GSTR-1A', async () => {
    const { findByTestId, queryByTestId } = renderScreen();
    await findByTestId('ims-card-a1');
    for (const id of ['a1', 'r1']) {
      expect(queryByTestId(`ims-card-${id}-accept`)).toBeNull();
      expect(queryByTestId(`ims-card-${id}-reject`)).toBeNull();
      expect(queryByTestId(`ims-card-${id}-keep`)).toBeNull();
      expect(queryByTestId(`ims-card-${id}-fix`)).toBeTruthy();
    }
  });

  it('Accept fires the action API with the exact backend vocabulary and offers Undo', async () => {
    const { findByTestId } = renderScreen();
    const accept = await findByTestId('ims-card-p1-accept');
    fireEvent.press(accept);

    await waitFor(() =>
      expect(mockAct).toHaveBeenCalledWith('p1', {
        organizationId: 'org-1',
        actionedBy: 'user-1',
        action: 'ACCEPTED',
        reason: undefined,
      }),
    );
    // 5s undo toast (spec §6.6)
    await findByTestId('ims-toast-undo');
  });

  it('Undo after Accept re-actions to PENDING_KEPT (no API transition to raw PENDING)', async () => {
    const { findByTestId } = renderScreen();
    fireEvent.press(await findByTestId('ims-card-p1-accept'));
    const undo = await findByTestId('ims-toast-undo');
    fireEvent.press(undo);

    await waitFor(() =>
      expect(mockAct).toHaveBeenLastCalledWith('p1', {
        organizationId: 'org-1',
        actionedBy: 'user-1',
        action: 'PENDING_KEPT',
      }),
    );
  });

  it('Keep pending fires PENDING_KEPT', async () => {
    const { findByTestId } = renderScreen();
    fireEvent.press(await findByTestId('ims-card-p1-keep'));
    await waitFor(() =>
      expect(mockAct).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({ action: 'PENDING_KEPT' }),
      ),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Reject-reason validation (client-required, min 3 chars — spec §0/§6.2)
// ─────────────────────────────────────────────────────────────────────────────

describe('ImsInboxScreen — reject reason validation', () => {
  it('opens the reason sheet and blocks confirm until a ≥3-char reason is given', async () => {
    const { findByTestId, getByTestId, queryByTestId } = renderScreen();
    fireEvent.press(await findByTestId('ims-card-p1-reject'));

    const input = await findByTestId('ims-reject-reason-input');

    // Too short → inline validation error, confirm does nothing
    fireEvent.changeText(input, 'ab');
    expect(getByTestId('ims-reject-reason-error')).toBeTruthy();
    fireEvent.press(getByTestId('ims-reject-confirm'));
    expect(mockAct).not.toHaveBeenCalled();

    // Valid reason → error clears, confirm sends REJECTED with the reason
    fireEvent.changeText(input, 'Price mismatch');
    expect(queryByTestId('ims-reject-reason-error')).toBeNull();
    fireEvent.press(getByTestId('ims-reject-confirm'));

    await waitFor(() =>
      expect(mockAct).toHaveBeenCalledWith('p1', {
        organizationId: 'org-1',
        actionedBy: 'user-1',
        action: 'REJECTED',
        reason: 'Price mismatch',
      }),
    );
  });

  it('trims whitespace-only reasons (still invalid)', async () => {
    const { findByTestId, getByTestId } = renderScreen();
    fireEvent.press(await findByTestId('ims-card-p1-reject'));
    const input = await findByTestId('ims-reject-reason-input');
    fireEvent.changeText(input, '      ');
    fireEvent.press(getByTestId('ims-reject-confirm'));
    expect(mockAct).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Deemed-acceptance banner logic (spec §2.4)
// ─────────────────────────────────────────────────────────────────────────────

describe('ImsInboxScreen — deemed banner logic', () => {
  it('shows the warning banner while the window is open and invoices are pending', async () => {
    const { findByTestId, queryByTestId } = renderScreen();
    await findByTestId('ims-banner-warning');
    expect(queryByTestId('ims-banner-info')).toBeNull();
  });

  it('shows the info banner once GSTR-2B has been generated', async () => {
    mockSummary.mockResolvedValue(
      makeSummaryDto({
        gstr2bGenerationPast: true,
        gstr2bGenerationDeadline: isoInDays(-3),
      }),
    );
    const { findByTestId, queryByTestId } = renderScreen();
    await findByTestId('ims-banner-info');
    expect(queryByTestId('ims-banner-warning')).toBeNull();
  });

  it('hides Accept/Reject/Keep on rows once the window has passed (spec §6.5)', async () => {
    mockSummary.mockResolvedValue(
      makeSummaryDto({
        gstr2bGenerationPast: true,
        gstr2bGenerationDeadline: isoInDays(-3),
      }),
    );
    const { findByTestId, queryByTestId } = renderScreen();
    await findByTestId('ims-card-p1');
    expect(queryByTestId('ims-card-p1-accept')).toBeNull();
    expect(queryByTestId('ims-card-p1-reject')).toBeNull();
    expect(queryByTestId('ims-card-p1-keep')).toBeNull();
    // terminal rows still route to GSTR-1A
    expect(queryByTestId('ims-card-r1-fix')).toBeTruthy();
  });

  it('shows no banner when nothing is pending in an open window', async () => {
    mockSummary.mockResolvedValue(makeSummaryDto({ pending: 0, pendingKept: 0 }));
    const { findByTestId, queryByTestId } = renderScreen();
    await findByTestId('ims-card-p1');
    expect(queryByTestId('ims-banner-warning')).toBeNull();
    expect(queryByTestId('ims-banner-info')).toBeNull();
  });

  it('"Learn how IMS works" opens the education sheet', async () => {
    const { findByTestId } = renderScreen();
    fireEvent.press(await findByTestId('ims-learn-more'));
    await findByTestId('ims-edu-got-it');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Sync + list plumbing
// ─────────────────────────────────────────────────────────────────────────────

describe('ImsInboxScreen — queries', () => {
  it('queries the list and summary with organizationId + MMYYYY period', async () => {
    const { findByTestId } = renderScreen();
    await findByTestId('ims-card-p1');
    expect(mockSummary).toHaveBeenCalledWith('org-1', '052026');
    expect(mockList).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        period: '052026',
        status: undefined,
        page: 1,
        pageSize: 20,
      }),
    );
  });

  it('status chip filters the list query (spec §3.2)', async () => {
    const { findByTestId } = renderScreen();
    fireEvent.press(await findByTestId('ims-filter-PENDING'));
    await waitFor(() =>
      expect(mockList).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'PENDING' }),
      ),
    );
  });
});
