/**
 * Dark-mode migration gate — design-elevation-spec S2 acceptance.
 *
 * 1. Static: migrated screens/components no longer import the static `Colors`
 *    object (`constants/colors`) — they consume `useTheme()` tokens.
 * 2. Render: representative regulated screens render under BOTH themes with
 *    the correct themed surfaces (canvas) and tint foregrounds.
 */

import React from 'react';
import * as fs from 'fs';
import * as path from 'path';
import { Appearance, StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import {
  ThemeProvider,
  LIGHT_TOKENS,
  DARK_TOKENS,
} from '../../src/contexts/ThemeContext';

// ── Mocks (shared by both rendered screens) ──────────────────────────────────

const mockKfs = {
  kfsId: 'kfs-001',
  applicationId: 'app-1',
  annualPercentageRate: 18.25,
  loanAmount: 500000,
  tenureMonths: 12,
  monthlyEmi: 45000,
  fees: [{ name: 'Processing fee', amount: 5000, type: 'one_time' }],
  repaymentSchedule: [
    { emiNumber: 1, dueDate: '2026-07-05', principal: 40000, interest: 5000, total: 45000, balance: 460000 },
  ],
  lenderName: 'Partner Bank',
  grievanceOfficerContact: 'grievance@partnerbank.in +91 9876543210',
  coolingOffDays: 3,
  hmacSignature: 'abcd'.repeat(16),
  generatedAt: '2026-06-10T10:00:00Z',
  acknowledgedAt: null,
  verified: true,
  signatureLast8: 'abcdabcd',
};

jest.mock('../../src/api/loans', () => ({
  getKfs: jest.fn(() => Promise.resolve(mockKfs)),
  generateKfs: jest.fn(() => Promise.resolve({})),
}));

const mockApiGet = jest.fn(() => Promise.resolve({ data: [] }));
jest.mock('../../src/lib/api', () => {
  const mockClient = {
    get: (...args: unknown[]) => mockApiGet(...args),
    patch: jest.fn(() => Promise.resolve({ data: {} })),
  };
  return { __esModule: true, default: mockClient, apiClient: mockClient };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts?.returnObjects) return ['Feature 1'];
      return opts ? `${key}(${JSON.stringify(opts)})` : key;
    },
    i18n: { language: 'en' },
  }),
}));

jest.mock('../../src/hooks/usePreventScreenCapture', () => ({
  useSensitiveScreen: jest.fn(),
}));

jest.mock('../../src/store/authStore', () => ({
  useAuthStore: (selector: (s: { user: { id: string } }) => unknown) =>
    selector({ user: { id: 'user-test-id' } }),
}));

jest.mock('../../src/components/callbacks/RequestCallbackCta', () => ({
  RequestCallbackCta: () => null,
}));

import { KeyFactsStatementScreen } from '../../src/screens/loans/KeyFactsStatementScreen';
import { ITRDashboardScreen } from '../../src/screens/itr/ITRDashboardScreen';

// ── Helpers ──────────────────────────────────────────────────────────────────

const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() } as never;
const kfsRoute = { params: { applicationId: 'app-1' } } as never;

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={qc}>
        <ThemeProvider>{children}</ThemeProvider>
      </QueryClientProvider>
    );
  };
}

function setSystemScheme(scheme: 'light' | 'dark') {
  jest.spyOn(Appearance, 'getColorScheme').mockReturnValue(scheme);
  jest
    .spyOn(Appearance, 'addChangeListener')
    .mockReturnValue({ remove: jest.fn() } as never);
}

function rootBackground(json: { props?: { style?: unknown } } | null): string | undefined {
  const flat = StyleSheet.flatten(json?.props?.style) as { backgroundColor?: string };
  return flat?.backgroundColor;
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── 1. Static: migrated files must not import static Colors ─────────────────

const MIGRATED_FILES = [
  'src/screens/loans/KeyFactsStatementScreen.tsx',
  'src/screens/loans/LoanConsentScreen.tsx',
  'src/screens/loans/LoanHubScreen.tsx',
  'src/screens/gst/GstDashboardScreen.tsx',
  'src/screens/itr/ITRDashboardScreen.tsx',
  'src/screens/profile/PrivacyCenterScreen.tsx',
  'src/components/ui/Card.tsx',
  'src/components/ui/Button.tsx',
  'src/components/ui/Badge.tsx',
  'src/components/ui/AmountDisplay.tsx',
  'src/components/loans/LoanProductCard.tsx',
  'src/components/shared/Stepper.tsx',
];

describe('S2 static gate — migrated files use theme tokens, not static Colors', () => {
  it.each(MIGRATED_FILES)('%s does not import constants/colors', (rel) => {
    const src = fs.readFileSync(path.join(__dirname, '../../', rel), 'utf8');
    expect(src).not.toMatch(/from\s+['"].*constants\/colors['"]/);
    expect(src).toContain('ThemeContext');
  });

  it('ConsentSignatureBlock only keeps the canonical loan-module accent', () => {
    // Exception documented in design-elevation-spec T-5: Colors.loan is the
    // canonical module accent; all surfaces/text in the block are themed.
    const src = fs.readFileSync(
      path.join(__dirname, '../../src/components/loans/ConsentSignatureBlock.tsx'),
      'utf8',
    );
    const colorRefs = src.match(/Colors\.\w+/g) ?? [];
    expect([...new Set(colorRefs)]).toEqual(['Colors.loan']);
  });
});

// ── 2. Render: both themes produce themed surfaces ───────────────────────────

describe.each([
  ['light', LIGHT_TOKENS],
  ['dark', DARK_TOKENS],
] as ['light' | 'dark', typeof LIGHT_TOKENS][])(
  'S2 render gate — %s mode',
  (mode, expected) => {
    it(`ITRDashboardScreen canvas + header use ${mode} tokens`, async () => {
      setSystemScheme(mode);
      const { toJSON, findByText } = render(
        <ITRDashboardScreen navigation={mockNavigation} />,
        { wrapper: makeWrapper() },
      );
      await findByText('mobile.itr.dashboard.title');
      expect(rootBackground(toJSON() as never)).toBe(expected.canvas);
    });

    it(`KFS APR hero (regulated tint card) is legible in ${mode} mode`, async () => {
      setSystemScheme(mode);
      const { findByText, toJSON } = render(
        <KeyFactsStatementScreen navigation={mockNavigation} route={kfsRoute} />,
        { wrapper: makeWrapper() },
      );
      // APR label renders with the brand tint foreground (contrast-gated pair)
      const aprLabel = await findByText('mobile.kfs.apr.label');
      const labelStyle = StyleSheet.flatten(aprLabel.props.style) as { color?: string };
      expect(labelStyle.color).toBe(expected.brandFg);
      expect(rootBackground(toJSON() as never)).toBe(expected.canvas);
    });
  },
);
