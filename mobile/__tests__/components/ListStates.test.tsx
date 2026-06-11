/**
 * ListStates — S3 house-standard loading / empty / error states.
 * design-elevation-spec §3.1/§3.2/§3.6 · board #26.
 *
 * Covers:
 *   - ListSkeleton renders the requested silhouette count, both variants,
 *     and is hidden from the accessibility tree.
 *   - ListSkeleton renders STATIC placeholders under reduce-motion (no
 *     animated opacity style attached).
 *   - EmptyState renders title/body/CTA; CTA + secondary fire callbacks.
 *   - ErrorState is an assertive live region with role=alert, fires the
 *     §3.3 error haptic once on mount, and retry/secondary fire callbacks.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';

// Default: reduce-motion OFF. Individual tests flip the mock.
const mockUseReducedMotion = jest.fn(() => false);
jest.mock('react-native-reanimated', () => ({
  useReducedMotion: () => mockUseReducedMotion(),
}));

import {
  ListSkeleton,
  EmptyState,
  ErrorState,
} from '../../src/components/shared/ListStates';

import '../../src/i18n';

describe('ListSkeleton (§3.1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseReducedMotion.mockReturnValue(false);
  });

  it('renders the requested number of card silhouettes', () => {
    const { getAllByTestId } = render(<ListSkeleton variant="card" count={6} />);
    expect(getAllByTestId('list-skeleton-item', { includeHiddenElements: true })).toHaveLength(6);
  });

  it('renders row variant silhouettes', () => {
    const { getAllByTestId } = render(<ListSkeleton variant="row" count={3} />);
    expect(getAllByTestId('list-skeleton-item', { includeHiddenElements: true })).toHaveLength(3);
  });

  it('is hidden from the accessibility tree', () => {
    const { getByTestId } = render(<ListSkeleton count={2} />);
    const wrap = getByTestId('list-skeleton', { includeHiddenElements: true });
    expect(wrap.props.accessibilityElementsHidden).toBe(true);
    expect(wrap.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  function hasOpacityStyle(item: { props: { style: unknown } }): boolean {
    const styles = Array.isArray(item.props.style) ? item.props.style : [item.props.style];
    return styles
      .flat(Infinity)
      .some(
        (s: Record<string, unknown> | undefined) =>
          !!s && typeof s === 'object' && 'opacity' in s,
      );
  }

  it('attaches the shimmer opacity style when reduce-motion is OFF', () => {
    const { getAllByTestId } = render(<ListSkeleton variant="card" count={1} />);
    const item = getAllByTestId('list-skeleton-item', { includeHiddenElements: true })[0];
    expect(hasOpacityStyle(item)).toBe(true);
  });

  it('renders a STATIC placeholder under reduce-motion (a11y 2.3.3)', () => {
    mockUseReducedMotion.mockReturnValue(true);
    const { getAllByTestId } = render(<ListSkeleton variant="card" count={1} />);
    const item = getAllByTestId('list-skeleton-item', { includeHiddenElements: true })[0];
    expect(hasOpacityStyle(item)).toBe(false);
  });
});

describe('EmptyState (§3.2)', () => {
  it('renders title, body and CTA; CTA fires', () => {
    const onCta = jest.fn();
    const { getByText, getByTestId } = render(
      <EmptyState
        title="No documents yet"
        body="Photograph a bill to get started."
        ctaLabel="Capture first document"
        onCtaPress={onCta}
      />,
    );
    expect(getByText('No documents yet')).toBeTruthy();
    expect(getByText('Photograph a bill to get started.')).toBeTruthy();
    fireEvent.press(getByTestId('empty-state-cta'));
    expect(onCta).toHaveBeenCalledTimes(1);
  });

  it('renders the filtered-empty secondary escape and fires it', () => {
    const onSecondary = jest.fn();
    const { getByTestId } = render(
      <EmptyState
        title="No results"
        secondaryLabel="Clear filters"
        onSecondaryPress={onSecondary}
      />,
    );
    fireEvent.press(getByTestId('empty-state-secondary'));
    expect(onSecondary).toHaveBeenCalledTimes(1);
  });

  it('omits CTA when no action is possible', () => {
    const { queryByTestId } = render(<EmptyState title="Nothing here" />);
    expect(queryByTestId('empty-state-cta')).toBeNull();
  });
});

describe('ErrorState (§3.6 + §3.3 haptics map)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('is announced: assertive live region with role=alert', () => {
    const { getByTestId } = render(
      <ErrorState message="Could not load." retryLabel="Try again" onRetry={jest.fn()} />,
    );
    const wrap = getByTestId('error-state');
    expect(wrap.props.accessibilityLiveRegion).toBe('assertive');
    expect(wrap.props.accessibilityRole).toBe('alert');
  });

  it('retry re-runs the query callback (recoverable, never dead-end)', () => {
    const onRetry = jest.fn();
    const { getByTestId } = render(
      <ErrorState message="Could not load." retryLabel="Try again" onRetry={onRetry} />,
    );
    fireEvent.press(getByTestId('error-state-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders the secondary escape and fires it', () => {
    const onSecondary = jest.fn();
    const { getByTestId } = render(
      <ErrorState
        message="Could not load."
        retryLabel="Try again"
        onRetry={jest.fn()}
        secondaryLabel="Go back"
        onSecondaryPress={onSecondary}
      />,
    );
    fireEvent.press(getByTestId('error-state-secondary'));
    expect(onSecondary).toHaveBeenCalledTimes(1);
  });

  it('fires the error haptic exactly once on mount (§3.3)', async () => {
    const { rerender } = render(
      <ErrorState message="Could not load." retryLabel="Try again" onRetry={jest.fn()} />,
    );
    rerender(
      <ErrorState message="Could not load." retryLabel="Try again" onRetry={jest.fn()} />,
    );
    await waitFor(() => {
      expect(Haptics.notificationAsync).toHaveBeenCalledWith(
        Haptics.NotificationFeedbackType.Error,
      );
    });
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
  });
});
