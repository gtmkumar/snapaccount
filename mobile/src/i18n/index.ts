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
