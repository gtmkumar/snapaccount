/**
 * i18n key-parity test — CI gate.
 *
 * Verifies that en.json, hi.json, and bn.json all contain exactly the same
 * set of keys. A divergence means a translator added a key to one locale
 * without adding it to the others, or a developer added an English key and
 * forgot to add the placeholder in hi/bn.
 *
 * This test will FAIL on any key-set mismatch, blocking CI until the parity
 * is restored.
 */
import { describe, it, expect } from 'vitest'
import en from '../i18n/en.json'
import hi from '../i18n/hi.json'
import bn from '../i18n/bn.json'

type Catalog = Record<string, string>

/**
 * Flatten a potentially nested JSON object into dot-notation keys.
 * Our i18n files are already flat (all keys are at root level), but this
 * handles the case where someone accidentally nests them.
 */
function flattenKeys(obj: Catalog, prefix = ''): Set<string> {
  const keys = new Set<string>()
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k
    if (typeof v === 'object' && v !== null) {
      for (const nested of flattenKeys(v as unknown as Catalog, fullKey)) {
        keys.add(nested)
      }
    } else {
      keys.add(fullKey)
    }
  }
  return keys
}

describe('i18n key parity', () => {
  const enKeys = flattenKeys(en as unknown as Catalog)
  const hiKeys = flattenKeys(hi as unknown as Catalog)
  const bnKeys = flattenKeys(bn as unknown as Catalog)

  it('hi.json has all keys present in en.json', () => {
    const missingFromHi = [...enKeys].filter(k => !hiKeys.has(k))
    if (missingFromHi.length > 0) {
      throw new Error(
        `hi.json is missing ${missingFromHi.length} key(s) present in en.json:\n` +
          missingFromHi.map(k => `  - ${k}`).join('\n')
      )
    }
    expect(missingFromHi).toHaveLength(0)
  })

  it('bn.json has all keys present in en.json', () => {
    const missingFromBn = [...enKeys].filter(k => !bnKeys.has(k))
    if (missingFromBn.length > 0) {
      throw new Error(
        `bn.json is missing ${missingFromBn.length} key(s) present in en.json:\n` +
          missingFromBn.map(k => `  - ${k}`).join('\n')
      )
    }
    expect(missingFromBn).toHaveLength(0)
  })

  it('en.json has all keys present in hi.json (no orphaned hi keys)', () => {
    const missingFromEn = [...hiKeys].filter(k => !enKeys.has(k))
    if (missingFromEn.length > 0) {
      throw new Error(
        `hi.json has ${missingFromEn.length} key(s) not present in en.json:\n` +
          missingFromEn.map(k => `  - ${k}`).join('\n')
      )
    }
    expect(missingFromEn).toHaveLength(0)
  })

  it('en.json has all keys present in bn.json (no orphaned bn keys)', () => {
    const missingFromEn = [...bnKeys].filter(k => !enKeys.has(k))
    if (missingFromEn.length > 0) {
      throw new Error(
        `bn.json has ${missingFromEn.length} key(s) not present in en.json:\n` +
          missingFromEn.map(k => `  - ${k}`).join('\n')
      )
    }
    expect(missingFromEn).toHaveLength(0)
  })

  it('all three locale files have the same number of keys', () => {
    expect(hiKeys.size).toBe(enKeys.size)
    expect(bnKeys.size).toBe(enKeys.size)
  })
})
