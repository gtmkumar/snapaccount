/**
 * ForceUpdateGate — GAP-116 mobile force-update / minimum-supported-version gate.
 *
 * Covers:
 *   - No policy / fail-open → children render, no block, no banner.
 *   - updateRequired → non-dismissible block screen; children are NOT rendered.
 *   - updateAvailable → children render + dismissible nudge banner; banner dismisses.
 */

import React from 'react';
import { Text } from 'react-native';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { ForceUpdateGate } from '../../src/components/ForceUpdateGate';
import { getAppVersionPolicy } from '../../src/api/appVersion';

import '../../src/i18n';

jest.mock('../../src/api/appVersion', () => ({
  getAppVersionPolicy: jest.fn(),
}));

const mockGet = getAppVersionPolicy as jest.MockedFunction<typeof getAppVersionPolicy>;

const child = <Text testID="child">child-content</Text>;

function policy(overrides: Record<string, unknown>) {
  return {
    platform: 'android',
    minimumSupportedVersion: '2.0.0',
    latestVersion: '2.1.0',
    storeUrl: 'https://play.google.com/store/apps/details?id=in.snapaccount.app',
    updateRequired: false,
    updateAvailable: false,
    ...overrides,
  };
}

describe('ForceUpdateGate', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders children when the version check returns no policy (fail-open)', async () => {
    mockGet.mockResolvedValue(null);

    const { getByTestId, queryByText } = render(<ForceUpdateGate>{child}</ForceUpdateGate>);

    expect(getByTestId('child')).toBeTruthy();
    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(queryByText('Update required')).toBeNull();
  });

  it('hard-blocks (children hidden) when updateRequired is true', async () => {
    mockGet.mockResolvedValue(policy({ updateRequired: true, updateAvailable: true }));

    const { queryByTestId, findByText } = render(<ForceUpdateGate>{child}</ForceUpdateGate>);

    await findByText('Update required');
    expect(queryByTestId('child')).toBeNull();
  });

  it('shows a dismissible nudge banner (children visible) when updateAvailable is true', async () => {
    mockGet.mockResolvedValue(policy({ updateAvailable: true }));

    const { getByTestId, findByText, getByLabelText, queryByText } = render(
      <ForceUpdateGate>{child}</ForceUpdateGate>,
    );

    // Children stay visible behind the nudge.
    expect(getByTestId('child')).toBeTruthy();
    await findByText('A new version of SnapAccount is available.');

    // Dismissing hides the banner but keeps the app usable.
    fireEvent.press(getByLabelText('Dismiss'));
    await waitFor(() =>
      expect(queryByText('A new version of SnapAccount is available.')).toBeNull(),
    );
    expect(getByTestId('child')).toBeTruthy();
  });
});
