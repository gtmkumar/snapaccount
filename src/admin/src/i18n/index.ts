/**
 * Lightweight i18n implementation.
 * Reads locale from localStorage key "snap_locale" (default: "en").
 * Keys support {{param}} interpolation.
 * Locale files: en.json, hi.json, bn.json
 *
 * Usage:
 *   import { t, setLocale, useLocale } from '@/i18n'
 *   const label = t('admin.callbacks.title')
 */
import en from './en.json'
import hi from './hi.json'
import bn from './bn.json'

type Locale = 'en' | 'hi' | 'bn'

const catalogs: Record<Locale, Record<string, string>> = { en, hi, bn }

const STORAGE_KEY = 'snap_locale'

function getLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'hi' || stored === 'bn') return stored
  } catch {
    // SSR / restricted
  }
  return 'en'
}

export function setLocale(locale: Locale): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale)
    // Trigger a storage event so useLocale picks it up within the same tab
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: locale }))
  } catch {
    // noop
  }
}

/** Translate a key with optional interpolation variables */
export function t(key: string, vars?: Record<string, string | number>): string {
  const locale = getLocale()
  const catalog = catalogs[locale]
  let str = catalog[key] ?? catalogs['en'][key] ?? key
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replaceAll(`{{${k}}}`, String(v))
    }
  }
  return str
}

export { getLocale }
export type { Locale }
