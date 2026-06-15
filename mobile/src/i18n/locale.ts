/**
 * Pure locale helpers — NO i18next import, so screens/tests can use them
 * without initialising (or mocking) the i18n runtime.
 *
 * NEW-D10: locale-aware backend endpoints (KFS generate/get, loan consent
 * catalog) resolve the document language as: caller param → user preference →
 * org default → "en". Mobile passes the locale the user is actually reading
 * the app in, so statutory documents (RBI Key Facts Statements, DPDP consent
 * texts) match the surrounding UI language.
 */

/** Locales the app ships translations for (en/hi/bn parity enforced). */
export const SUPPORTED_LOCALES = ['en', 'hi', 'bn'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/**
 * Normalise an i18next language tag to a supported base locale.
 * Regional tags collapse to their base ("hi-IN" → "hi"); unknown/missing
 * tags fall back to "en".
 */
export function normalizeLocale(language: string | undefined | null): SupportedLocale {
  const base = (language ?? 'en').toLowerCase().split('-')[0];
  return (SUPPORTED_LOCALES as readonly string[]).includes(base)
    ? (base as SupportedLocale)
    : 'en';
}
