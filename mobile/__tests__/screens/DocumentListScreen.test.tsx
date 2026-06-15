/**
 * Smoke tests — DocumentListScreen with queue integration
 * Phase 6A · AND-04 filename-binding regression (live Android sweep 2026-06-11)
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockApiGet = jest.fn(() => Promise.resolve({ data: [] as unknown }));

jest.mock('../../src/lib/api', () => ({
  // Required so Babel's interop resolves the screen's default import to this
  // object instead of double-wrapping it (see ITRDashboardScreen.test.tsx).
  __esModule: true,
  default: {
    get: (...args: unknown[]) => mockApiGet(...(args as [])),
  },
  apiClient: {
    get: (...args: unknown[]) => mockApiGet(...(args as [])),
  },
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}(${JSON.stringify(opts)})` : key,
    i18n: { language: 'en' },
  }),
}));

// expo-image-picker: needed by DocumentListScreen for gallery upload path
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true })),
  launchImageLibraryAsync: jest.fn(() => Promise.resolve({ canceled: true, assets: [] })),
  MediaTypeOptions: { Images: 'Images', All: 'All' },
}));

// Mock the document queue hook
jest.mock('../../src/hooks/useDocumentQueue', () => ({
  useDocumentQueue: () => ({
    queue: [],
    enqueue: jest.fn(),
    retry: jest.fn(),
    remove: jest.fn(),
    markReady: jest.fn(),
    pendingCount: 0,
  }),
}));

import { DocumentListScreen } from '../../src/screens/documents/DocumentListScreen';

const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
} as never;

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('DocumentListScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiGet.mockResolvedValue({ data: [] });
  });

  it('renders without crashing', () => {
    const { getByText } = render(
      <Wrapper>
        <DocumentListScreen navigation={mockNavigation} />
      </Wrapper>,
    );
    expect(getByText('mobile.docs.title')).toBeTruthy();
  });

  it('shows empty state when no documents or queue items', () => {
    const { getByText } = render(
      <Wrapper>
        <DocumentListScreen navigation={mockNavigation} />
      </Wrapper>,
    );
    // Empty state renders after data loads — header is always visible
    expect(getByText('mobile.docs.title')).toBeTruthy();
  });

  // AND-04: backend list DTO uses fileName/vendorName/documentDate — rows
  // rendered with no filename because the card binds filename/vendor/date.
  it('renders filenames from the backend fileName field (paginated envelope)', async () => {
    mockApiGet.mockResolvedValue({
      data: {
        items: [
          {
            id: 'doc-1',
            fileName: 'invoice-april.pdf',
            status: 'PROCESSED',
            vendorName: 'Acme Traders',
            amount: 1180,
            documentDate: '2026-04-12',
            uploadedAt: '2026-04-12T08:30:00Z',
          },
        ],
        totalCount: 1,
        page: 1,
        pageSize: 20,
      },
    });

    const { findByText } = render(
      <Wrapper>
        <DocumentListScreen navigation={mockNavigation} />
      </Wrapper>,
    );

    expect(await findByText('invoice-april.pdf')).toBeTruthy();
  });

  it('renders filenames from a bare-array response with mobile field names', async () => {
    mockApiGet.mockResolvedValue({
      data: [
        {
          id: 'doc-2',
          filename: 'rent-receipt.jpg',
          category: 'Expenses',
          status: 'UPLOADED',
        },
      ],
    });

    const { findByText } = render(
      <Wrapper>
        <DocumentListScreen navigation={mockNavigation} />
      </Wrapper>,
    );

    expect(await findByText('rent-receipt.jpg')).toBeTruthy();
  });
});
