/**
 * ScreenErrorBoundary — AND-09 (live Android sweep 2026-06-11).
 *
 * A screen render crash must show the in-app fallback (retry/back) instead of
 * the red-screen overlay that ejected users from the app on Android BACK.
 */

import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';

import {
  ScreenErrorBoundary,
  withScreenErrorBoundary,
} from '../../src/components/shared/ScreenErrorBoundary';

function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('boom');
  }
  return <Text>safe content</Text>;
}

let consoleErrorSpy: jest.SpyInstance;

beforeEach(() => {
  // React logs caught boundary errors via console.error — keep output clean.
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

describe('ScreenErrorBoundary (AND-09)', () => {
  it('renders children when nothing throws', () => {
    const { getByText, queryByTestId } = render(
      <ScreenErrorBoundary>
        <Bomb shouldThrow={false} />
      </ScreenErrorBoundary>,
    );
    expect(getByText('safe content')).toBeTruthy();
    expect(queryByTestId('screen-error-boundary')).toBeNull();
  });

  it('catches a child render error and shows the fallback instead of crashing', () => {
    const { getByTestId, queryByText } = render(
      <ScreenErrorBoundary>
        <Bomb shouldThrow />
      </ScreenErrorBoundary>,
    );
    expect(getByTestId('screen-error-boundary')).toBeTruthy();
    expect(getByTestId('screen-error-retry')).toBeTruthy();
    expect(queryByText('safe content')).toBeNull();
  });

  it('invokes onBack from the fallback Back button', () => {
    const onBack = jest.fn();
    const { getByTestId } = render(
      <ScreenErrorBoundary onBack={onBack}>
        <Bomb shouldThrow />
      </ScreenErrorBoundary>,
    );
    fireEvent.press(getByTestId('screen-error-back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('hides the Back button when no onBack is provided', () => {
    const { queryByTestId } = render(
      <ScreenErrorBoundary>
        <Bomb shouldThrow />
      </ScreenErrorBoundary>,
    );
    expect(queryByTestId('screen-error-back')).toBeNull();
  });

  it('withScreenErrorBoundary wires Back to props.navigation.goBack', () => {
    const goBack = jest.fn();
    const Wrapped = withScreenErrorBoundary(
      Bomb as React.ComponentType<{ shouldThrow: boolean }>,
    );
    const { getByTestId } = render(
      <Wrapped
        shouldThrow
        {...({ navigation: { goBack, canGoBack: () => true } } as object)}
      />,
    );
    fireEvent.press(getByTestId('screen-error-back'));
    expect(goBack).toHaveBeenCalledTimes(1);
  });
});
