/**
 * W5-IMS-01 — no-organization guard for the IMS surfaces.
 *
 * A user with no org membership has orgId === '' and every IMS/GSTR-1A query
 * is `enabled: !!orgId` (silently disabled). Previously the screens rendered
 * the misleading "Not synced yet" / plain empty state. They must now render
 * an explicit guidance EmptyState (shared ListStates) with a CTA that routes
 * to business setup (MoreTab → Profile), and must NOT fire any IMS API call.
 */

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
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

// No org membership — currentOrganization is null, so orgId resolves to ''.
jest.mock('../../src/store/authStore', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({
      currentOrganization: null,
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
    listGstr1aAmendments: jest.fn(),
    createGstr1aAmendment: jest.fn(),
  };
});

import {
  getImsSummary,
  listGstr1aAmendments,
  listImsInvoices,
} from '../../src/api/gstIms';
import { ImsInboxScreen } from '../../src/screens/gst/ImsInboxScreen';
import { Gstr1aAmendmentsScreen } from '../../src/screens/gst/Gstr1aAmendmentsScreen';

function makeNavigation() {
  const parentNavigate = jest.fn();
  const navigation = {
    goBack: jest.fn(),
    navigate: jest.fn(),
    getParent: jest.fn(() => ({ navigate: parentNavigate })),
  };
  return { navigation, parentNavigate };
}

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('W5-IMS-01 — no-org guidance state', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('ImsInboxScreen', () => {
    it('renders the no-org EmptyState instead of "Not synced yet"', () => {
      const { navigation } = makeNavigation();
      const { getByTestId, getByText, queryByTestId, queryByText } = renderWithClient(
        <ImsInboxScreen
          navigation={navigation as never}
          route={{ key: 'k', name: 'ImsInbox', params: undefined } as never}
        />,
      );

      expect(getByTestId('ims-no-org')).toBeTruthy();
      expect(getByText('mobile.gst.ims.noOrg.title')).toBeTruthy();
      expect(getByText('mobile.gst.ims.noOrg.body')).toBeTruthy();
      // The misleading sync-empty state must NOT render
      expect(queryByTestId('ims-empty-state')).toBeNull();
      expect(queryByText(/empty\.neverSynced/)).toBeNull();
      // And no sync button either
      expect(queryByTestId('ims-sync-button')).toBeNull();
    });

    it('fires no IMS queries when orgId is empty', () => {
      const { navigation } = makeNavigation();
      renderWithClient(
        <ImsInboxScreen
          navigation={navigation as never}
          route={{ key: 'k', name: 'ImsInbox', params: undefined } as never}
        />,
      );

      expect(listImsInvoices).not.toHaveBeenCalled();
      expect(getImsSummary).not.toHaveBeenCalled();
    });

    it('CTA routes to business setup (MoreTab → Profile)', () => {
      const { navigation, parentNavigate } = makeNavigation();
      const { getByTestId } = renderWithClient(
        <ImsInboxScreen
          navigation={navigation as never}
          route={{ key: 'k', name: 'ImsInbox', params: undefined } as never}
        />,
      );

      fireEvent.press(getByTestId('ims-no-org-cta'));
      expect(parentNavigate).toHaveBeenCalledWith('MoreTab', { screen: 'Profile' });
    });
  });

  describe('Gstr1aAmendmentsScreen', () => {
    it('renders the no-org EmptyState and fires no list query', () => {
      const { navigation } = makeNavigation();
      const { getByTestId, getByText, queryByTestId } = renderWithClient(
        <Gstr1aAmendmentsScreen
          navigation={navigation as never}
          route={{ key: 'k', name: 'Gstr1aAmendments', params: undefined } as never}
        />,
      );

      expect(getByTestId('gstr1a-no-org')).toBeTruthy();
      expect(getByText('mobile.gst.ims.noOrg.title')).toBeTruthy();
      expect(queryByTestId('gstr1a-empty')).toBeNull();
      expect(listGstr1aAmendments).not.toHaveBeenCalled();
    });

    it('CTA routes to business setup (MoreTab → Profile)', () => {
      const { navigation, parentNavigate } = makeNavigation();
      const { getByTestId } = renderWithClient(
        <Gstr1aAmendmentsScreen
          navigation={navigation as never}
          route={{ key: 'k', name: 'Gstr1aAmendments', params: undefined } as never}
        />,
      );

      fireEvent.press(getByTestId('gstr1a-no-org-cta'));
      expect(parentNavigate).toHaveBeenCalledWith('MoreTab', { screen: 'Profile' });
    });
  });
});
