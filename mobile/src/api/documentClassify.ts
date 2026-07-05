/**
 * Document auto-classification — AI-suggested category for the capture flow.
 *
 * Spec: docs/design/screens/mobile/document-vault.md Screen 16 (AI suggestion
 * banner — "AI detected: <category>"); document-scanner-ai-extraction-spec.md C1
 * categorization (`auto_classify_enabled`).
 *
 * MOCK-FIRST, CREDENTIAL-GATED (repo convention):
 *   - The real path POSTs the captured image to `/documents/classify-suggestion`
 *     and expects `{ categoryCode, confidence }`. That backend endpoint is not
 *     yet implemented (no Vertex/Gemini classifier wired), so every call falls
 *     back to a local filename heuristic and NEVER throws. When the backend ships
 *     the endpoint, the real branch activates automatically with no mobile change.
 *   - Auto-classify can be force-disabled for an org/build via the
 *     EXPO_PUBLIC_AUTO_CLASSIFY flag (default ON); when OFF we skip the network
 *     call and return no suggestion so the banner never renders.
 *
 * The returned `categoryCode` is the canonical backend category code
 * (document.document_category.code — UPPERCASE, e.g. 'SALES_BILL'), so it can be
 * matched directly against the category list the user picks from.
 */

import { apiClient } from '../lib/api';

/** Confidence threshold above which the AI-suggestion banner is shown (Screen 16: > 70%). */
export const AI_SUGGESTION_MIN_CONFIDENCE = 0.7;

/** Backend category codes (document.document_category.code). */
export type DocumentCategoryCode =
  | 'SALES_BILL'
  | 'PURCHASE_BILL'
  | 'EXPENSE_RECEIPT'
  | 'BANK_STATEMENT'
  | 'SALARY_SLIP'
  | 'OTHER';

export interface CategorySuggestion {
  /** Canonical backend category code, or null when nothing confident was detected. */
  categoryCode: DocumentCategoryCode | null;
  /** 0..1 model confidence. */
  confidence: number;
  /** Where the suggestion came from — useful for telemetry / banner copy gating. */
  source: 'ai' | 'heuristic' | 'none';
}

const NO_SUGGESTION: CategorySuggestion = {
  categoryCode: null,
  confidence: 0,
  source: 'none',
};

/** Whether auto-classify is enabled for this build (default ON; OFF disables the banner). */
function isAutoClassifyEnabled(): boolean {
  // EXPO_PUBLIC_* vars are inlined at build time; treat only an explicit 'false' as OFF.
  return process.env.EXPO_PUBLIC_AUTO_CLASSIFY !== 'false';
}

/**
 * Local filename heuristic used as the mock fallback when the backend classifier
 * is unavailable. Deliberately conservative: only returns a suggestion when a
 * strong keyword matches, otherwise NO_SUGGESTION so the banner stays hidden.
 */
export function heuristicClassify(filename: string): CategorySuggestion {
  const name = (filename || '').toLowerCase();
  const rules: { code: DocumentCategoryCode; keywords: string[] }[] = [
    { code: 'SALES_BILL', keywords: ['sales', 'invoice-out', 'tax-invoice', 'salesbill'] },
    { code: 'PURCHASE_BILL', keywords: ['purchase', 'vendor', 'supplier', 'po-', 'purchasebill'] },
    { code: 'EXPENSE_RECEIPT', keywords: ['expense', 'receipt', 'bill-', 'petrol', 'fuel', 'travel'] },
    { code: 'BANK_STATEMENT', keywords: ['bank', 'statement', 'passbook'] },
    { code: 'SALARY_SLIP', keywords: ['salary', 'payslip', 'wage'] },
  ];
  for (const rule of rules) {
    if (rule.keywords.some((kw) => name.includes(kw))) {
      return { categoryCode: rule.code, confidence: 0.74, source: 'heuristic' };
    }
  }
  return NO_SUGGESTION;
}

/**
 * Ask the backend (or local heuristic fallback) to suggest a category for a
 * just-captured document. NEVER throws — any failure resolves to NO_SUGGESTION
 * so the capture flow is never blocked by classification.
 *
 * @param params.localUri  file:// URI of the captured/picked image
 * @param params.filename  original filename (drives the heuristic fallback)
 */
export async function classifyDocumentCategory(params: {
  localUri: string;
  filename: string;
}): Promise<CategorySuggestion> {
  if (!isAutoClassifyEnabled()) return NO_SUGGESTION;

  // ── Real path (credential-gated) ─────────────────────────────────────────
  // POST the image to the classifier. If the endpoint is missing (404/501) or
  // any network/parse error occurs, fall through to the local heuristic.
  try {
    const formData = new FormData();
    formData.append('file', {
      uri: params.localUri,
      type: 'image/jpeg',
      name: params.filename,
    } as unknown as Blob);

    const res = await apiClient.post<{ categoryCode?: string; confidence?: number }>(
      '/documents/classify-suggestion',
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 8000 },
    );

    const code = normalizeCode(res.data?.categoryCode);
    const confidence = typeof res.data?.confidence === 'number' ? res.data.confidence : 0;
    if (code && confidence > 0) {
      return { categoryCode: code, confidence, source: 'ai' };
    }
    // Backend responded but with nothing usable → no banner.
    return NO_SUGGESTION;
  } catch {
    // Endpoint not implemented yet / offline / timeout → local heuristic fallback.
    return heuristicClassify(params.filename);
  }
}

/** Coerce an arbitrary backend string to a known category code (or null). */
function normalizeCode(value: string | undefined): DocumentCategoryCode | null {
  if (!value) return null;
  const upper = value.toUpperCase() as DocumentCategoryCode;
  const known: DocumentCategoryCode[] = [
    'SALES_BILL',
    'PURCHASE_BILL',
    'EXPENSE_RECEIPT',
    'BANK_STATEMENT',
    'SALARY_SLIP',
    'OTHER',
  ];
  return known.includes(upper) ? upper : null;
}
