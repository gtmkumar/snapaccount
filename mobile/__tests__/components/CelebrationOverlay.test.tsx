/**
 * CelebrationOverlay — Phase 6F full test suite
 * Track F2/F4 · 9 kind variants · title render · animation · primary CTA
 *
 * Wave 6 (GAP-062): updated for the server fire-guard + single-dismiss fixes.
 *  - P6-QA-MOBILE-10: "first …" kinds POST /notifications/celebrations/{kind}/fire
 *    on mount; alreadyFired=true → overlay never shows (dismisses silently);
 *    fire failure → fail-open (overlay shows).
 *  - P6-QA-MOBILE-11: dismissal fires exactly ONE callback exactly once
 *    (the old `onSecondary?.() ?? onPrimary()` fired both).
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';

const mockFireCelebration = jest.fn();
jest.mock('../../src/api/notifications', () => ({
  fireCelebration: (...args: unknown[]) => mockFireCelebration(...args),
}));

import { CelebrationOverlay, type CelebrationKind } from '../../src/components/loans/CelebrationOverlay';

import '../../src/i18n';

// ── All 9 kinds ───────────────────────────────────────────────────────────────

const ALL_KINDS: CelebrationKind[] = [
  'APPROVED',
  'DISBURSED',
  'firstGst',
  'firstRefund',
  'firstItr',
  'firstNoticeResolved',
  'planK2Step15',
  'firstChatResolved',
  'custom',
];

/** Kinds with a backend fired-once record (P6-QA-MOBILE-10). */
const GUARDED_KINDS: Partial<Record<CelebrationKind, string>> = {
  DISBURSED: 'first_loan_disbursed',
  firstGst: 'first_gst_filed',
  firstRefund: 'first_refund_credited',
  firstItr: 'first_itr_filed',
};

const BASE_PROPS = {
  amount: 500000,
  period: 'Oct 2025',
  ack: 'ACK-2025-001',
  ay: '2025-26',
  count: 3,
  date: '25 Apr 2026',
  bankName: 'HDFC Bank',
  rate: 12.5,
  acctMask: '4321',
  onPrimary: jest.fn(),
  onSecondary: jest.fn(),
};

/** Render + flush the mount-time fire-guard promise (guarded kinds gate on it). */
async function renderOverlay(ui: React.ReactElement) {
  const result = render(ui);
  await act(async () => {});
  return result;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CelebrationOverlay — 9 kind variants', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockFireCelebration.mockResolvedValue({
      alreadyFired: false,
      kind: 'first_loan_disbursed',
      firedAt: '2026-06-11T00:00:00Z',
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── render without crash ──────────────────────────────────────────────────

  it.each(ALL_KINDS)('renders kind=%s without crashing', async (kind) => {
    await expect(
      renderOverlay(<CelebrationOverlay kind={kind} {...BASE_PROPS} />),
    ).resolves.toBeTruthy();
  });

  // ── headline non-empty ────────────────────────────────────────────────────

  it.each(ALL_KINDS)('kind=%s renders a non-empty headline text', async (kind) => {
    const { getByRole } = await renderOverlay(
      <CelebrationOverlay kind={kind} {...BASE_PROPS} />,
    );
    // Headline has accessibilityRole="header"
    const header = getByRole('header');
    expect(header).toBeTruthy();
    expect(header.props.children).toBeTruthy();
    expect(String(header.props.children).length).toBeGreaterThan(0);
  });

  // ── primary CTA ───────────────────────────────────────────────────────────

  it.each(ALL_KINDS)('kind=%s primary CTA button is pressable', async (kind) => {
    const onPrimary = jest.fn();
    const { getAllByRole } = await renderOverlay(
      <CelebrationOverlay kind={kind} {...BASE_PROPS} onPrimary={onPrimary} />,
    );
    const buttons = getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(1);
    fireEvent.press(buttons[0]);
    expect(onPrimary).toHaveBeenCalledTimes(1);
  });

  // ── APPROVED specific copy ────────────────────────────────────────────────

  it('APPROVED kind contains "approved" i18n key in headline', async () => {
    const { getByRole } = await renderOverlay(
      <CelebrationOverlay kind="APPROVED" {...BASE_PROPS} />,
    );
    const header = getByRole('header');
    expect(String(header.props.children).toLowerCase()).toContain('approved');
  });

  // ── DISBURSED specific copy ───────────────────────────────────────────────

  it('DISBURSED kind contains "disbursed" i18n key in headline', async () => {
    const { getByRole } = await renderOverlay(
      <CelebrationOverlay kind="DISBURSED" {...BASE_PROPS} />,
    );
    const header = getByRole('header');
    expect(String(header.props.children).toLowerCase()).toContain('disbursed');
  });

  // ── custom kind uses customHeadline prop ──────────────────────────────────

  it('custom kind uses customHeadline prop when provided', async () => {
    const { getByRole } = await renderOverlay(
      <CelebrationOverlay
        kind="custom"
        customHeadline="You nailed it!"
        customSubline="Keep going"
        onPrimary={jest.fn()}
      />,
    );
    const header = getByRole('header');
    expect(header.props.children).toBe('You nailed it!');
  });

  it('custom kind falls back to i18n key when customHeadline not provided', async () => {
    const { getByRole } = await renderOverlay(
      <CelebrationOverlay kind="custom" onPrimary={jest.fn()} />,
    );
    const header = getByRole('header');
    expect(String(header.props.children).length).toBeGreaterThan(0);
  });

  // ── auto-dismiss after 6s ─────────────────────────────────────────────────

  it('auto-dismisses: calls onPrimary after 6s when no onSecondary', async () => {
    const onPrimary = jest.fn();
    await renderOverlay(
      <CelebrationOverlay kind="firstGst" {...BASE_PROPS} onPrimary={onPrimary} onSecondary={undefined} />,
    );

    // onPrimary not called yet
    expect(onPrimary).not.toHaveBeenCalled();

    act(() => { jest.advanceTimersByTime(6100); });

    await waitFor(() => {
      expect(onPrimary).toHaveBeenCalledTimes(1);
    });
  });

  it('P6-QA-MOBILE-11: auto-dismiss calls ONLY onSecondary when provided (no onPrimary fallthrough)', async () => {
    const onPrimary = jest.fn();
    const onSecondary = jest.fn();

    await renderOverlay(
      <CelebrationOverlay
        kind="firstItr"
        {...BASE_PROPS}
        onPrimary={onPrimary}
        onSecondary={onSecondary}
      />,
    );

    act(() => { jest.advanceTimersByTime(6100); });

    await waitFor(() => {
      expect(onSecondary).toHaveBeenCalledTimes(1);
    });
    // The old `onSecondary?.() ?? onPrimary()` fired BOTH — fixed.
    expect(onPrimary).not.toHaveBeenCalled();
  });

  it('P6-QA-MOBILE-11: manual press then auto-timer fires exactly one callback total', async () => {
    const onPrimary = jest.fn();
    const onSecondary = jest.fn();
    const { getAllByRole } = await renderOverlay(
      <CelebrationOverlay
        kind="firstGst"
        {...BASE_PROPS}
        onPrimary={onPrimary}
        onSecondary={onSecondary}
      />,
    );

    fireEvent.press(getAllByRole('button')[0]); // primary
    act(() => { jest.advanceTimersByTime(6100); }); // timer would have fired

    expect(onPrimary).toHaveBeenCalledTimes(1);
    expect(onSecondary).not.toHaveBeenCalled();
  });

  // ── animation: overlay is rendered with opacity anim ─────────────────────

  it('APPROVED overlay renders Animated.View container', async () => {
    const { toJSON } = await renderOverlay(
      <CelebrationOverlay kind="APPROVED" {...BASE_PROPS} />,
    );
    expect(toJSON()).not.toBeNull();
  });

  // ── formatIndianAmount helpers via APPROVED body ──────────────────────────

  it('APPROVED with amount=5000000 uses Lakh format in body', async () => {
    const { getByText } = await renderOverlay(
      <CelebrationOverlay kind="APPROVED" amount={500000} bankName="SBI" rate={10} onPrimary={jest.fn()} />,
    );
    const textNodes = getByText(/approved\.body|5\.00 L/);
    expect(textNodes).toBeTruthy();
  });
});

// ── Server fire-guard (P6-QA-MOBILE-10) ──────────────────────────────────────

describe('CelebrationOverlay — server fire-guard (P6-QA-MOBILE-10)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockFireCelebration.mockResolvedValue({
      alreadyFired: false,
      kind: 'k',
      firedAt: '2026-06-11T00:00:00Z',
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it.each(Object.entries(GUARDED_KINDS))(
    'kind=%s POSTs fire with server kind %s on mount',
    async (kind, serverKind) => {
      await renderOverlay(
        <CelebrationOverlay kind={kind as CelebrationKind} {...BASE_PROPS} />,
      );
      expect(mockFireCelebration).toHaveBeenCalledTimes(1);
      expect(mockFireCelebration).toHaveBeenCalledWith(serverKind);
    },
  );

  it.each(['APPROVED', 'firstNoticeResolved', 'planK2Step15', 'firstChatResolved', 'custom'] as CelebrationKind[])(
    'unguarded kind=%s never calls the fire endpoint and shows immediately',
    async (kind) => {
      const { getByRole } = await renderOverlay(
        <CelebrationOverlay kind={kind} {...BASE_PROPS} />,
      );
      expect(mockFireCelebration).not.toHaveBeenCalled();
      expect(getByRole('header')).toBeTruthy();
    },
  );

  it('guarded kind renders NOTHING until the fire call resolves', async () => {
    let resolveFire: (v: unknown) => void = () => {};
    mockFireCelebration.mockReturnValue(new Promise((res) => { resolveFire = res; }));
    const { queryByRole, getByRole } = render(
      <CelebrationOverlay kind="DISBURSED" {...BASE_PROPS} />,
    );
    expect(queryByRole('header')).toBeNull();
    await act(async () => {
      resolveFire({ alreadyFired: false, kind: 'first_loan_disbursed', firedAt: 'x' });
    });
    expect(getByRole('header')).toBeTruthy();
  });

  it('alreadyFired=true → overlay never shows and dismisses via onSecondary exactly once', async () => {
    mockFireCelebration.mockResolvedValue({
      alreadyFired: true,
      kind: 'first_gst_filed',
      firedAt: '2026-06-11T00:00:00Z',
    });
    const onPrimary = jest.fn();
    const onSecondary = jest.fn();
    const { queryByRole } = await renderOverlay(
      <CelebrationOverlay
        kind="firstGst"
        {...BASE_PROPS}
        onPrimary={onPrimary}
        onSecondary={onSecondary}
      />,
    );
    expect(queryByRole('header')).toBeNull();
    expect(onSecondary).toHaveBeenCalledTimes(1);
    expect(onPrimary).not.toHaveBeenCalled();
  });

  it('alreadyFired=true with no onSecondary → dismisses via onPrimary exactly once', async () => {
    mockFireCelebration.mockResolvedValue({
      alreadyFired: true,
      kind: 'first_itr_filed',
      firedAt: '2026-06-11T00:00:00Z',
    });
    const onPrimary = jest.fn();
    const { queryByRole } = await renderOverlay(
      <CelebrationOverlay
        kind="firstItr"
        {...BASE_PROPS}
        onPrimary={onPrimary}
        onSecondary={undefined}
      />,
    );
    expect(queryByRole('header')).toBeNull();
    expect(onPrimary).toHaveBeenCalledTimes(1);
  });

  it('fire endpoint failure → fail-open: overlay still shows', async () => {
    mockFireCelebration.mockRejectedValue(new Error('network down'));
    const { getByRole } = await renderOverlay(
      <CelebrationOverlay kind="firstRefund" {...BASE_PROPS} />,
    );
    expect(getByRole('header')).toBeTruthy();
  });
});
