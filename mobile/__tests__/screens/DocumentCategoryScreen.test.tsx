/**
 * DocumentCategoryScreen — behaviour tests (DG-DOC-05).
 * Covers: enqueues with the canonical backend code + navigates to the list,
 * and renders the AI suggestion banner when classify returns a confident result.
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}(${JSON.stringify(opts)})` : key,
    i18n: { language: 'en' },
  }),
}));

// Queue hook — assert enqueue receives the backend code, not a UI slug.
const mockEnqueue = jest.fn(() => Promise.resolve('local-id-001'));
jest.mock('../../src/hooks/useDocumentQueue', () => ({
  useDocumentQueue: () => ({
    enqueue: mockEnqueue,
    pendingCount: 0,
    queue: [],
    retry: jest.fn(),
    remove: jest.fn(),
    markReady: jest.fn(),
  }),
}));

// Classify helper — controlled per test.
const mockClassify = jest.fn();
jest.mock('../../src/api/documentClassify', () => ({
  ...jest.requireActual('../../src/api/documentClassify'),
  classifyDocumentCategory: (...args: unknown[]) => mockClassify(...args),
}));

import { DocumentCategoryScreen } from '../../src/screens/documents/DocumentCategoryScreen';

const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
} as never;

const route = {
  params: { documentUri: 'file:///photos/test.jpg', filename: 'test.jpg', source: 'camera' },
} as never;

beforeEach(() => {
  jest.clearAllMocks();
  mockClassify.mockResolvedValue({ categoryCode: null, confidence: 0, source: 'none' });
});

describe('DocumentCategoryScreen', () => {
  it('enqueues with the canonical backend code then navigates to DocumentList', async () => {
    const { findByLabelText } = render(
      <DocumentCategoryScreen navigation={mockNavigation} route={route} />,
    );

    // Card accessibilityLabel is `${label}: ${hint}` → tap the Sales Bill card.
    const salesCard = await findByLabelText(
      'mobile.docCategory.options.salesBill.label: mobile.docCategory.options.salesBill.hint',
    );
    fireEvent.press(salesCard);

    await waitFor(() => {
      expect(mockEnqueue).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'SALES_BILL', filename: 'test.jpg' }),
      );
    });
    expect(mockNavigation.navigate).toHaveBeenCalledWith('DocumentList');
  });

  it('shows the AI suggestion banner when classify returns a confident category', async () => {
    mockClassify.mockResolvedValue({
      categoryCode: 'PURCHASE_BILL',
      confidence: 0.88,
      source: 'ai',
    });

    const { findByText } = render(
      <DocumentCategoryScreen navigation={mockNavigation} route={route} />,
    );

    // Banner copy uses interpolated category label.
    await findByText(
      'mobile.docCategory.ai.detected({"category":"mobile.docCategory.options.purchaseBill.label"})',
    );
  });

  it('does not show the AI banner below the confidence threshold', async () => {
    mockClassify.mockResolvedValue({
      categoryCode: 'PURCHASE_BILL',
      confidence: 0.5,
      source: 'heuristic',
    });

    const { queryByText } = render(
      <DocumentCategoryScreen navigation={mockNavigation} route={route} />,
    );

    await waitFor(() => expect(mockClassify).toHaveBeenCalled());
    expect(
      queryByText(
        'mobile.docCategory.ai.detected({"category":"mobile.docCategory.options.purchaseBill.label"})',
      ),
    ).toBeNull();
  });
});
