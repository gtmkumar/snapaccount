/**
 * EmployeeProfileWizardScreen — Phase 6D
 * Tests: 5-step navigation, per-step validation, PUT /itr/profile persistence,
 *        final Review step submits and navigates.
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('../../src/lib/api', () => ({
  apiClient: {
    get: jest.fn(() => Promise.resolve({ data: null })),
    put: jest.fn(() => Promise.resolve({ data: { assesseeId: 'a1', panLast4: '1234', fullName: 'Test' } })),
    post: jest.fn(() => Promise.resolve({ data: {} })),
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

jest.mock('../../src/components/shared/Stepper', () => {
  const { View } = require('react-native');
  return { Stepper: (props: { testID?: string }) => <View testID={props.testID ?? 'stepper'} /> };
});

jest.mock('../../src/components/shared/PanInput', () => {
  const { TextInput } = require('react-native');
  return {
    PanInput: (props: { value: string; onChangeText: (v: string) => void; label?: string }) =>
      <TextInput testID="pan-input" value={props.value} onChangeText={props.onChangeText} />,
  };
});

jest.mock('../../src/components/shared/SummaryList', () => {
  const { View, Text } = require('react-native');
  return {
    SummaryList: (props: { items: Array<{ label: string; value: string }> }) => (
      <View testID="summary-list">
        {props.items.map((item) => (
          <Text key={item.label}>{item.value}</Text>
        ))}
      </View>
    ),
  };
});

import { updateItrProfile } from '../../src/api/itr';
const mockUpdateItrProfile = updateItrProfile as jest.Mock;

jest.mock('../../src/api/itr', () => ({
  updateItrProfile: jest.fn(() =>
    Promise.resolve({ assesseeId: 'a1', panLast4: '1234', fullName: 'Test User' }),
  ),
}));

import { EmployeeProfileWizardScreen } from '../../src/screens/itr/EmployeeProfileWizardScreen';

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() } as never;
const mockRoute = { params: { userId: 'user-123', assesseeId: 'assessee-456' } } as never;

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('EmployeeProfileWizardScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateItrProfile.mockResolvedValue({ assesseeId: 'a1', panLast4: '1234', fullName: 'Test User' });
  });

  it('renders header and Step 0 (Personal) on initial mount', () => {
    const { getByText, getByTestId } = render(
      <Wrapper><EmployeeProfileWizardScreen navigation={mockNavigation} route={mockRoute} /></Wrapper>,
    );
    expect(getByText('mobile.itr.wizard.title')).toBeTruthy();
    expect(getByText('mobile.itr.wizard.step0Title')).toBeTruthy();
    expect(getByTestId('wizard-stepper')).toBeTruthy();
  });

  it('Next on Step 0 calls PUT /itr/profile and advances to Step 1', async () => {
    const { getByText } = render(
      <Wrapper><EmployeeProfileWizardScreen navigation={mockNavigation} route={mockRoute} /></Wrapper>,
    );
    await act(async () => {
      fireEvent.press(getByText('mobile.itr.wizard.next'));
    });
    await waitFor(() => {
      expect(mockUpdateItrProfile).toHaveBeenCalledTimes(1);
      expect(getByText('mobile.itr.wizard.step1Title')).toBeTruthy();
    });
  });

  it('Back on Step 0 calls navigation.goBack()', () => {
    const { getByLabelText } = render(
      <Wrapper><EmployeeProfileWizardScreen navigation={mockNavigation} route={mockRoute} /></Wrapper>,
    );
    fireEvent.press(getByLabelText('mobile.common.back'));
    expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('navigates forward through all 5 steps and on final step calls navigate to DocChecklist', async () => {
    const { getByText } = render(
      <Wrapper><EmployeeProfileWizardScreen navigation={mockNavigation} route={mockRoute} /></Wrapper>,
    );

    // Steps 0-3: press Next
    for (let i = 0; i < 4; i++) {
      await act(async () => {
        fireEvent.press(getByText('mobile.itr.wizard.next'));
      });
    }

    // Step 4 is Review — button label changes to submit
    await waitFor(() => expect(getByText('mobile.itr.wizard.submit')).toBeTruthy());

    await act(async () => {
      fireEvent.press(getByText('mobile.itr.wizard.submit'));
    });

    await waitFor(() => {
      expect(mockNavigation.navigate).toHaveBeenCalledWith('DocChecklist', { assesseeId: 'assessee-456' });
    });
  });

  it('Back on Step 2 returns to Step 1', async () => {
    const { getByText, getByLabelText } = render(
      <Wrapper><EmployeeProfileWizardScreen navigation={mockNavigation} route={mockRoute} /></Wrapper>,
    );

    // Advance to step 2
    for (let i = 0; i < 2; i++) {
      await act(async () => {
        fireEvent.press(getByText('mobile.itr.wizard.next'));
      });
    }
    await waitFor(() => expect(getByText('mobile.itr.wizard.step2Title')).toBeTruthy());

    fireEvent.press(getByLabelText('mobile.common.back'));
    await waitFor(() => expect(getByText('mobile.itr.wizard.step1Title')).toBeTruthy());
  });

  it('Review step renders SummaryList', async () => {
    const { getByText, getByTestId } = render(
      <Wrapper><EmployeeProfileWizardScreen navigation={mockNavigation} route={mockRoute} /></Wrapper>,
    );
    for (let i = 0; i < 4; i++) {
      await act(async () => {
        fireEvent.press(getByText('mobile.itr.wizard.next'));
      });
    }
    await waitFor(() => expect(getByTestId('summary-list')).toBeTruthy());
    expect(getByText('mobile.itr.wizard.step4Title')).toBeTruthy();
  });

  it('PUT /itr/profile is called once per Next press', async () => {
    const { getByText } = render(
      <Wrapper><EmployeeProfileWizardScreen navigation={mockNavigation} route={mockRoute} /></Wrapper>,
    );
    await act(async () => { fireEvent.press(getByText('mobile.itr.wizard.next')); });
    await act(async () => { fireEvent.press(getByText('mobile.itr.wizard.next')); });
    await waitFor(() => expect(mockUpdateItrProfile).toHaveBeenCalledTimes(2));
  });
});
