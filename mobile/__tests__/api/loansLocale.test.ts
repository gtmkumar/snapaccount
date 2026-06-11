/**
 * NEW-D10 — explicit locale on locale-aware Loan endpoints.
 *
 * KFS Locale Resolution (docs/api/endpoints.md): caller param → user pref →
 * org default → "en". Mobile must pass the active UI locale so RBI-mandated
 * KFS documents and DPDP consent texts are served in the language the user is
 * actually reading the app in.
 *
 * Covers:
 *  - generateKfs / getKfs send ?locale= when provided, omit it otherwise
 *  - getConsentCatalog sends ?locale= when provided, omits it otherwise
 *  - getActiveLocale() normalises regional tags and falls back to 'en'
 */

const mockGet = jest.fn();
const mockPost = jest.fn();

jest.mock('../../src/lib/api', () => ({
  apiClient: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

import { generateKfs, getKfs, getConsentCatalog } from '../../src/api/loans';
import i18n, { getActiveLocale } from '../../src/i18n';

const KFS_DTO = {
  kfsId: 'kfs-1',
  annualPercentageRate: 18.5,
  loanAmount: 500000,
  tenureMonths: 24,
  monthlyEmi: 24750.5,
  feesJson: '[]',
  repaymentScheduleJson: '[]',
  lenderName: 'HDFC Bank',
  grievanceOfficerContact: 'x',
  coolingOffDays: 3,
  generatedAt: '2026-06-11T00:00:00Z',
  hmacSignature: 'abcd1234efgh5678',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('NEW-D10 — KFS endpoints pass explicit locale', () => {
  it('generateKfs sends locale as a query param', async () => {
    mockPost.mockResolvedValue({ data: { kfsId: 'kfs-1' } });
    await generateKfs('app-1', 'hi');
    expect(mockPost).toHaveBeenCalledWith(
      '/loans/applications/app-1/kfs',
      undefined,
      { params: { locale: 'hi' } },
    );
  });

  it('generateKfs without locale keeps the bare call (server fallback chain)', async () => {
    mockPost.mockResolvedValue({ data: { kfsId: 'kfs-1' } });
    await generateKfs('app-1');
    expect(mockPost).toHaveBeenCalledWith('/loans/applications/app-1/kfs');
  });

  it('getKfs sends locale as a query param', async () => {
    mockGet.mockResolvedValue({ data: KFS_DTO });
    const result = await getKfs('app-1', 'bn');
    expect(mockGet).toHaveBeenCalledWith('/loans/applications/app-1/kfs', {
      params: { locale: 'bn' },
    });
    expect(result?.kfsId).toBe('kfs-1');
  });

  it('getKfs without locale keeps the bare call', async () => {
    mockGet.mockResolvedValue({ data: KFS_DTO });
    await getKfs('app-1');
    expect(mockGet).toHaveBeenCalledWith('/loans/applications/app-1/kfs');
  });
});

describe('NEW-D10 — consent catalog passes explicit locale', () => {
  it('getConsentCatalog sends locale as a query param', async () => {
    mockGet.mockResolvedValue({ data: { items: [] } });
    await getConsentCatalog('hi');
    expect(mockGet).toHaveBeenCalledWith('/loans/consents/catalog', {
      params: { locale: 'hi' },
    });
  });

  it('getConsentCatalog without locale keeps the bare call', async () => {
    mockGet.mockResolvedValue({ data: { items: [] } });
    await getConsentCatalog();
    expect(mockGet).toHaveBeenCalledWith('/loans/consents/catalog');
  });
});

describe('NEW-D10 — getActiveLocale()', () => {
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it.each([
    ['en', 'en'],
    ['hi', 'hi'],
    ['bn', 'bn'],
    ['hi-IN', 'hi'],
    ['bn-BD', 'bn'],
  ])('normalises %s → %s', async (lang, expected) => {
    await i18n.changeLanguage(lang);
    expect(getActiveLocale()).toBe(expected);
  });

  it('falls back to en for unsupported languages', async () => {
    await i18n.changeLanguage('ta');
    expect(getActiveLocale()).toBe('en');
  });
});
