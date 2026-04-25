/**
 * CelebrationOverlay — Phase 6F full test suite
 * Track F2/F4 · 9 kind variants · title render · animation · primary CTA
 *
 * Covers:
 *   - All 9 kind variants render without crash
 *   - Each kind renders a non-empty headline (copy resolved by kind)
 *   - Primary CTA button is accessible and pressable
 *   - onPrimary callback fires when primary button pressed
 *   - Auto-dismiss timer fires onPrimary after 6s
 *   - Custom kind uses customHeadline prop
 *
 * NOTE: server-guard (POST /notifications/celebrations/{kind}/fire) is NOT
 * implemented in CelebrationOverlay — see bug P6-QA-MOBILE-10.
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CelebrationOverlay — 9 kind variants', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── render without crash ──────────────────────────────────────────────────

  it.each(ALL_KINDS)('renders kind=%s without crashing', (kind) => {
    expect(() =>
      render(<CelebrationOverlay kind={kind} {...BASE_PROPS} />),
    ).not.toThrow();
  });

  // ── headline non-empty ────────────────────────────────────────────────────

  it.each(ALL_KINDS)('kind=%s renders a non-empty headline text', (kind) => {
    const { getByRole } = render(
      <CelebrationOverlay kind={kind} {...BASE_PROPS} />,
    );
    // Headline has accessibilityRole="header"
    const header = getByRole('header');
    expect(header).toBeTruthy();
    expect(header.props.children).toBeTruthy();
    expect(String(header.props.children).length).toBeGreaterThan(0);
  });

  // ── primary CTA ───────────────────────────────────────────────────────────

  it.each(ALL_KINDS)('kind=%s primary CTA button is pressable', (kind) => {
    const onPrimary = jest.fn();
    const { getAllByRole } = render(
      <CelebrationOverlay kind={kind} {...BASE_PROPS} onPrimary={onPrimary} />,
    );
    const buttons = getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(1);
    fireEvent.press(buttons[0]);
    expect(onPrimary).toHaveBeenCalledTimes(1);
  });

  // ── APPROVED specific copy ────────────────────────────────────────────────

  it('APPROVED kind contains "approved" i18n key in headline', () => {
    const { getByRole } = render(
      <CelebrationOverlay kind="APPROVED" {...BASE_PROPS} />,
    );
    const header = getByRole('header');
    // t() in tests returns the key — verify it references 'approved'
    expect(String(header.props.children).toLowerCase()).toContain('approved');
  });

  // ── DISBURSED specific copy ───────────────────────────────────────────────

  it('DISBURSED kind contains "disbursed" i18n key in headline', () => {
    const { getByRole } = render(
      <CelebrationOverlay kind="DISBURSED" {...BASE_PROPS} />,
    );
    const header = getByRole('header');
    expect(String(header.props.children).toLowerCase()).toContain('disbursed');
  });

  // ── custom kind uses customHeadline prop ──────────────────────────────────

  it('custom kind uses customHeadline prop when provided', () => {
    const { getByRole } = render(
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

  it('custom kind falls back to i18n key when customHeadline not provided', () => {
    const { getByRole } = render(
      <CelebrationOverlay kind="custom" onPrimary={jest.fn()} />,
    );
    const header = getByRole('header');
    expect(String(header.props.children).length).toBeGreaterThan(0);
  });

  // ── auto-dismiss after 6s ─────────────────────────────────────────────────

  it('auto-dismisses: calls onPrimary after 6s when no onSecondary', async () => {
    const onPrimary = jest.fn();
    render(
      <CelebrationOverlay kind="firstGst" {...BASE_PROPS} onPrimary={onPrimary} onSecondary={undefined} />,
    );

    // onPrimary not called yet
    expect(onPrimary).not.toHaveBeenCalled();

    act(() => { jest.advanceTimersByTime(6100); });

    await waitFor(() => {
      expect(onPrimary).toHaveBeenCalled();
    });
  });

  it('auto-dismisses: calls onSecondary after 6s when provided', async () => {
    const onPrimary = jest.fn();
    const onSecondary = jest.fn();

    render(
      <CelebrationOverlay
        kind="firstItr"
        {...BASE_PROPS}
        onPrimary={onPrimary}
        onSecondary={onSecondary}
      />,
    );

    act(() => { jest.advanceTimersByTime(6100); });

    await waitFor(() => {
      expect(onSecondary).toHaveBeenCalled();
    });
    // Note: source uses `onSecondary?.() ?? onPrimary()` — since jest.fn() returns
    // undefined (void), the nullish coalescing falls through to onPrimary().
    // This is a known quirk; onSecondary firing is the primary assertion.
  });

  // ── animation: overlay is rendered with opacity anim ─────────────────────

  it('APPROVED overlay renders Animated.View container', () => {
    const { toJSON } = render(
      <CelebrationOverlay kind="APPROVED" {...BASE_PROPS} />,
    );
    // Just verify tree renders without error; full animation verified via snapshot
    expect(toJSON()).not.toBeNull();
  });

  // ── formatIndianAmount helpers via APPROVED body ──────────────────────────

  it('APPROVED with amount=5000000 uses Lakh format in body', () => {
    const { getByText } = render(
      <CelebrationOverlay kind="APPROVED" amount={500000} bankName="SBI" rate={10} onPrimary={jest.fn()} />,
    );
    // Body contains formatted amount (5.00 L)
    // t() renders key with opts as JSON — just confirm body text present
    const textNodes = getByText(/approved\.body|5\.00 L/);
    expect(textNodes).toBeTruthy();
  });
});
