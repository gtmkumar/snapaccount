/**
 * EditBusinessScreen — Task #18 (GAP-060rem).
 * Covers: settings load (name/GSTIN read-only + address editable), PATCH on
 * save with edited values, pincode validation gate, and load-error retry.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGetOrgSettings = jest.fn();
const mockPatchOrgSettings = jest.fn(() => Promise.resolve());

jest.mock('../../src/api/auth', () => ({
  getOrgSettings: () => mockGetOrgSettings(),
  patchOrgSettings: (...args: unknown[]) => mockPatchOrgSettings(...(args as [])),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}(${JSON.stringify(opts)})` : key,
    i18n: { language: 'en' },
  }),
}));

import { EditBusinessScreen } from '../../src/screens/profile/EditBusinessScreen';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() } as never;

const orgSettings = {
  name: 'Sharma Traders',
  gstin: '29ABCDE1234F1Z5',
  phone: '+919876543210',
  email: 'owner@sharmatraders.in',
  logoUrl: null,
  addressLine1: '12 MG Road',
  city: 'Bengaluru',
  state: 'Karnataka',
  pincode: '560001',
};

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('EditBusinessScreen', () => {
  it('loads settings and renders name + GSTIN read-only with editable address', async () => {
    mockGetOrgSettings.mockResolvedValue(orgSettings);

    const { findByText, getByTestId } = render(
      <EditBusinessScreen navigation={mockNavigation} />,
      { wrapper: makeWrapper() },
    );

    expect(await findByText('Sharma Traders')).toBeTruthy();
    expect(await findByText('29ABCDE1234F1Z5')).toBeTruthy();
    expect(getByTestId('edit-biz-address1').props.value).toBe('12 MG Road');
    expect(getByTestId('edit-biz-pincode').props.value).toBe('560001');
  });

  it('PATCHes edited address fields on save and announces success', async () => {
    mockGetOrgSettings.mockResolvedValue(orgSettings);

    const { findByTestId, getByTestId, findByText } = render(
      <EditBusinessScreen navigation={mockNavigation} />,
      { wrapper: makeWrapper() },
    );

    const city = await findByTestId('edit-biz-city');
    fireEvent.changeText(city, 'Mysuru');
    fireEvent.press(getByTestId('edit-biz-save'));

    await waitFor(() => expect(mockPatchOrgSettings).toHaveBeenCalled());
    expect(mockPatchOrgSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        addressLine1: '12 MG Road',
        city: 'Mysuru',
        state: 'Karnataka',
        pincode: '560001',
      }),
    );
    expect(await findByText('mobile.editBusiness.saved')).toBeTruthy();
  });

  it('blocks save while the pincode is invalid', async () => {
    mockGetOrgSettings.mockResolvedValue(orgSettings);

    const { findByTestId, getByTestId, getByText } = render(
      <EditBusinessScreen navigation={mockNavigation} />,
      { wrapper: makeWrapper() },
    );

    const pincode = await findByTestId('edit-biz-pincode');
    fireEvent.changeText(pincode, '12');

    expect(getByText('mobile.editBusiness.pincodeError')).toBeTruthy();
    expect(getByTestId('edit-biz-save').props.accessibilityState.disabled).toBe(true);

    fireEvent.press(getByTestId('edit-biz-save'));
    expect(mockPatchOrgSettings).not.toHaveBeenCalled();
  });

  it('shows error state with retry when settings fail to load', async () => {
    mockGetOrgSettings.mockRejectedValue(
      Object.assign(new Error('boom'), { response: { status: 500 } }),
    );

    const { findByText, getByLabelText } = render(
      <EditBusinessScreen navigation={mockNavigation} />,
      { wrapper: makeWrapper() },
    );

    expect(await findByText('mobile.editBusiness.error.load')).toBeTruthy();

    mockGetOrgSettings.mockResolvedValue(orgSettings);
    fireEvent.press(getByLabelText('mobile.common.retry'));

    expect(await findByText('Sharma Traders')).toBeTruthy();
  });
});
