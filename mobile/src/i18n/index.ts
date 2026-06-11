/**
 * i18n initialisation — react-i18next
 * Locales: English (en), Hindi (hi), Bengali (bn)
 * Import this module once at app root before rendering.
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import hi from './hi.json';
import bn from './bn.json';

import { normalizeLocale, type SupportedLocale } from './locale';

export { SUPPORTED_LOCALES, normalizeLocale, type SupportedLocale } from './locale';

/**
 * NEW-D10: The active UI locale, normalised to a supported base tag
 * (see ./locale.ts for the resolution rationale). Screens with a mocked
 * react-i18next should prefer `normalizeLocale(useTranslation().i18n.language)`.
 */
export function getActiveLocale(): SupportedLocale {
  return normalizeLocale(i18n.language);
}

i18n
  .use(initReactI18next)
  .init({
    compatibilityJSON: 'v4',
    lng: 'en',
    fallbackLng: 'en',
    resources: {
      en: { translation: en },
      hi: { translation: hi },
      bn: { translation: bn },
    },
    interpolation: {
      escapeValue: false,
    },
    ns: ['translation'],
    defaultNS: 'translation',
  });

export default i18n;
