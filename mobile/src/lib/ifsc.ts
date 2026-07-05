/**
 * ifsc.ts — IFSC → bank/branch name lookup.
 *
 * DG-AUTH-06 (docs/design/screens/mobile/auth-onboarding.md Screen 5d):
 * On a valid 11-char IFSC the employee-onboarding bank screen auto-detects the
 * bank/branch name. There is no backend IFSC endpoint (the loan flow only does
 * format checks), so this resolves the bank name client-side against the public
 * Razorpay IFSC dataset (https://ifsc.razorpay.com/{IFSC}) — no auth, no PII sent.
 *
 * A small offline/dev table keyed by the 4-char bank prefix is used as a fallback
 * when the network is unavailable (offline-first onboarding) or when running in a
 * dev/mock environment, so the UX still surfaces a bank name without a round-trip.
 */

import { isValidIFSC } from './utils';
import { logger } from './logger';

export interface IfscDetails {
  /** Full bank name, e.g. "HDFC Bank". */
  bank: string;
  /** Branch name, when available. */
  branch?: string;
  /** Branch city, when available. */
  city?: string;
  /** True when resolved from the offline/dev fallback table rather than the API. */
  fromFallback: boolean;
}

/**
 * Offline/dev fallback: bank name keyed by the first 4 chars of the IFSC (the
 * bank code). Not exhaustive — only the most common banks for our target users.
 * The live API supersedes this whenever the network is reachable.
 */
const BANK_PREFIX_FALLBACK: Record<string, string> = {
  SBIN: 'State Bank of India',
  HDFC: 'HDFC Bank',
  ICIC: 'ICICI Bank',
  UTIB: 'Axis Bank',
  PUNB: 'Punjab National Bank',
  BARB: 'Bank of Baroda',
  CNRB: 'Canara Bank',
  KKBK: 'Kotak Mahindra Bank',
  IBKL: 'IDBI Bank',
  YESB: 'Yes Bank',
  INDB: 'IndusInd Bank',
  IDFB: 'IDFC First Bank',
  UBIN: 'Union Bank of India',
  IOBA: 'Indian Overseas Bank',
  CBIN: 'Central Bank of India',
  MAHB: 'Bank of Maharashtra',
  BKID: 'Bank of India',
  FDRL: 'Federal Bank',
  RATN: 'RBL Bank',
  PYTM: 'Paytm Payments Bank',
};

/** Raw shape returned by the Razorpay IFSC API (subset we read). */
interface RazorpayIfscResponse {
  BANK?: string;
  BRANCH?: string;
  CITY?: string;
}

/** Resolve a bank name from the offline fallback table, or undefined. */
export function resolveFallbackBank(ifsc: string): string | undefined {
  const prefix = ifsc.toUpperCase().trim().slice(0, 4);
  return BANK_PREFIX_FALLBACK[prefix];
}

const IFSC_API_BASE = 'https://ifsc.razorpay.com';
const LOOKUP_TIMEOUT_MS = 8000;

/**
 * Look up bank/branch details for an IFSC code.
 *
 * Returns `null` for a format-invalid IFSC (callers should gate on
 * {@link isValidIFSC} for UX, but this is defensive). On a network/HTTP error
 * it degrades to the offline fallback table; if the prefix is unknown there too,
 * it returns `null` so the UI can show a "couldn't detect bank" hint without
 * blocking the user.
 */
export async function lookupIfsc(ifscRaw: string): Promise<IfscDetails | null> {
  const ifsc = ifscRaw.toUpperCase().trim();
  if (!isValidIFSC(ifsc)) return null;

  // Allow tests / dev environments to short-circuit the network entirely via a
  // dev hook, and otherwise prefer the live API with the table as a safety net.
  const devOverride = (globalThis as { __SNAP_IFSC_LOOKUP__?: typeof lookupIfsc }).__SNAP_IFSC_LOOKUP__;
  if (devOverride && devOverride !== lookupIfsc) {
    return devOverride(ifsc);
  }

  try {
    // RN's fetch typing diverges from the DOM AbortSignal, so we race a timeout
    // rather than wiring an AbortController — keeps the call portable + typesafe.
    const res = await withTimeout(
      fetch(`${IFSC_API_BASE}/${ifsc}`, { method: 'GET' }),
      LOOKUP_TIMEOUT_MS,
    );
    if (!res.ok) throw new Error(`IFSC API HTTP ${res.status}`);
    const data = (await res.json()) as RazorpayIfscResponse;
    if (!data.BANK) throw new Error('IFSC API returned no bank');
    return {
      bank: data.BANK,
      branch: data.BRANCH ?? undefined,
      city: data.CITY ?? undefined,
      fromFallback: false,
    };
  } catch (err) {
    logger.debug('ifsc', 'live lookup failed, using fallback', {
      err: err instanceof Error ? err.message : String(err),
    });
    const bank = resolveFallbackBank(ifsc);
    if (!bank) return null;
    return { bank, fromFallback: true };
  }
}

/** Reject if `promise` does not settle within `ms` milliseconds. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('IFSC lookup timed out')), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
