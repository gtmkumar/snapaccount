/**
 * UserAttributeFields — Auth/RBAC Module 1, Increment 1.4 Phase B
 *
 * Shared form section for the user attribute + KYC/profile fields used by both
 * AddUserDialog and EditUserDialog. All dropdowns are sourced from reference-data
 * (LANGUAGE / USER_TYPE / GENDER / COUNTRY / STATE) via listReferenceData(cat, true).
 * State options are filtered by the selected country's code (STATE.parentCode === country).
 *
 * i18n: @/i18n t() (NOT react-i18next).
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Toggle } from '@/components/ui/Toggle'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import { listReferenceData, refDataQueryKey, type RefDataItem } from '@/lib/referenceDataApi'

// ── Value model ─────────────────────────────────────────────────────────────

export interface UserAttributesValue {
  preferredLanguage: string
  userType: string
  isActive: boolean
  panNumber: string
  aadhaarLast4: string
  dateOfBirth: string
  gender: string
  addressLine1: string
  addressLine2: string
  city: string
  state: string
  pincode: string
  country: string
}

export function emptyUserAttributes(): UserAttributesValue {
  return {
    preferredLanguage: 'en',
    userType: '',
    isActive: true,
    panNumber: '',
    aadhaarLast4: '',
    dateOfBirth: '',
    gender: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    pincode: '',
    country: 'IN',
  }
}

// ── Styling helpers (match AddUserDialog inputs) ────────────────────────────

const INPUT_CLS =
  'w-full px-3 py-2 rounded-lg border bg-[var(--surface-sunken)] text-[var(--text-primary)] text-sm ' +
  'focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)] border-[var(--border-default)]'
const ERR_CLS = 'border-rose-500'

interface Props {
  value: UserAttributesValue
  onChange: (patch: Partial<UserAttributesValue>) => void
  /** Edit mode only: masked PAN shown as the input placeholder (leave blank to keep). */
  panMasked?: string | null
  errors?: Record<string, string>
  /** Whether to render the active toggle (default true). */
  showActive?: boolean
  /** Whether the dialog is open (gates the refdata queries). */
  enabled?: boolean
  idPrefix?: string
}

function useRefData(category: Parameters<typeof refDataQueryKey>[0], enabled: boolean) {
  return useQuery({
    queryKey: refDataQueryKey(category, true),
    queryFn: () => listReferenceData(category, true),
    enabled,
    staleTime: 5 * 60_000,
  })
}

export function UserAttributeFields({
  value, onChange, panMasked, errors = {}, showActive = true, enabled = true, idPrefix = 'attr',
}: Props) {
  const [profileOpen, setProfileOpen] = useState(false)

  const { data: languages = [] } = useRefData('LANGUAGE', enabled)
  const { data: userTypes = [] } = useRefData('USER_TYPE', enabled)
  const { data: genders = [] } = useRefData('GENDER', enabled)
  const { data: countries = [] } = useRefData('COUNTRY', enabled)
  const { data: states = [] } = useRefData('STATE', enabled)

  // States are scoped to the selected country (STATE.parentCode === COUNTRY.code).
  const stateOptions: RefDataItem[] = states.filter(s => s.parentCode === value.country)

  // Switching country clears a now-mismatched state selection.
  const handleCountry = (country: string) => {
    const stillValid = states.some(s => s.code === value.state && s.parentCode === country)
    onChange({ country, ...(stillValid ? {} : { state: '' }) })
  }

  return (
    <div className="space-y-4">
      {/* ── Account attributes ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${idPrefix}-language`} className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
            {t('users.attrs.language')}
          </label>
          <select
            id={`${idPrefix}-language`}
            value={value.preferredLanguage}
            onChange={e => onChange({ preferredLanguage: e.target.value })}
            className={INPUT_CLS}
          >
            {languages.map(l => <option key={l.id} value={l.code}>{l.name}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor={`${idPrefix}-userType`} className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
            {t('users.attrs.userType')}
          </label>
          <select
            id={`${idPrefix}-userType`}
            value={value.userType}
            onChange={e => onChange({ userType: e.target.value })}
            className={INPUT_CLS}
          >
            <option value="">{t('users.attrs.userTypeAuto')}</option>
            {userTypes.map(u => <option key={u.id} value={u.code}>{u.name}</option>)}
          </select>
        </div>
      </div>

      {showActive && (
        <div className="flex items-center justify-between rounded-lg border border-[var(--border-default)] px-3 py-2.5">
          <div>
            <p className="text-sm font-medium text-[var(--text-primary)]">{t('users.attrs.active')}</p>
            <p className="text-xs text-[var(--text-tertiary)]">{t('users.attrs.activeHint')}</p>
          </div>
          <Toggle
            checked={value.isActive}
            onChange={() => onChange({ isActive: !value.isActive })}
            size="sm"
            id={`${idPrefix}-active`}
          />
        </div>
      )}

      {/* ── Collapsible KYC / profile ──────────────────────────────────── */}
      <div className="rounded-xl border border-[var(--border-subtle)] overflow-hidden">
        <button
          type="button"
          onClick={() => setProfileOpen(o => !o)}
          aria-expanded={profileOpen}
          className="w-full flex items-center gap-3 px-4 py-2.5 bg-[var(--surface-sunken)] hover:bg-[var(--surface-raised)] transition-colors text-left"
        >
          {profileOpen ? <ChevronDown className="h-4 w-4 text-[var(--text-tertiary)]" /> : <ChevronRight className="h-4 w-4 text-[var(--text-tertiary)]" />}
          <span className="flex-1 text-sm font-semibold text-[var(--text-primary)]">{t('users.attrs.profileSection')}</span>
          <span className="text-xs text-[var(--text-tertiary)]">{t('users.attrs.profileOptional')}</span>
        </button>

        {profileOpen && (
          <div className="p-4 space-y-3 bg-[var(--surface-raised)]">
            <div className="grid grid-cols-2 gap-3">
              {/* PAN */}
              <div>
                <label htmlFor={`${idPrefix}-pan`} className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
                  {t('users.attrs.pan')}
                </label>
                <input
                  id={`${idPrefix}-pan`}
                  value={value.panNumber}
                  onChange={e => onChange({ panNumber: e.target.value.toUpperCase() })}
                  maxLength={10}
                  placeholder={panMasked ?? 'ABCDE1234F'}
                  className={cn(INPUT_CLS, 'font-mono', errors.panNumber && ERR_CLS)}
                />
                {panMasked && <p className="mt-1 text-xs text-[var(--text-tertiary)]">{t('users.attrs.panKeepHint')}</p>}
                {errors.panNumber && <p className="mt-1 text-xs text-rose-600">{errors.panNumber}</p>}
              </div>

              {/* Aadhaar last 4 */}
              <div>
                <label htmlFor={`${idPrefix}-aadhaar`} className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
                  {t('users.attrs.aadhaar')}
                </label>
                <input
                  id={`${idPrefix}-aadhaar`}
                  value={value.aadhaarLast4}
                  inputMode="numeric"
                  maxLength={4}
                  onChange={e => onChange({ aadhaarLast4: e.target.value.replace(/\D/g, '') })}
                  placeholder="1234"
                  className={cn(INPUT_CLS, 'font-mono', errors.aadhaarLast4 && ERR_CLS)}
                />
                {errors.aadhaarLast4 && <p className="mt-1 text-xs text-rose-600">{errors.aadhaarLast4}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Gender */}
              <div>
                <label htmlFor={`${idPrefix}-gender`} className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
                  {t('users.attrs.gender')}
                </label>
                <select
                  id={`${idPrefix}-gender`}
                  value={value.gender}
                  onChange={e => onChange({ gender: e.target.value })}
                  className={INPUT_CLS}
                >
                  <option value="">{t('users.attrs.select')}</option>
                  {genders.map(g => <option key={g.id} value={g.code}>{g.name}</option>)}
                </select>
              </div>

              {/* DOB */}
              <div>
                <label htmlFor={`${idPrefix}-dob`} className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
                  {t('users.attrs.dob')}
                </label>
                <input
                  id={`${idPrefix}-dob`}
                  type="date"
                  value={value.dateOfBirth}
                  onChange={e => onChange({ dateOfBirth: e.target.value })}
                  className={cn(INPUT_CLS, errors.dateOfBirth && ERR_CLS)}
                />
                {errors.dateOfBirth && <p className="mt-1 text-xs text-rose-600">{errors.dateOfBirth}</p>}
              </div>
            </div>

            {/* Address */}
            <div>
              <label htmlFor={`${idPrefix}-addr1`} className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
                {t('users.attrs.address1')}
              </label>
              <input
                id={`${idPrefix}-addr1`}
                value={value.addressLine1}
                onChange={e => onChange({ addressLine1: e.target.value })}
                className={INPUT_CLS}
              />
            </div>
            <div>
              <label htmlFor={`${idPrefix}-addr2`} className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
                {t('users.attrs.address2')}
              </label>
              <input
                id={`${idPrefix}-addr2`}
                value={value.addressLine2}
                onChange={e => onChange({ addressLine2: e.target.value })}
                className={INPUT_CLS}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Country */}
              <div>
                <label htmlFor={`${idPrefix}-country`} className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
                  {t('users.attrs.country')}
                </label>
                <select
                  id={`${idPrefix}-country`}
                  value={value.country}
                  onChange={e => handleCountry(e.target.value)}
                  className={INPUT_CLS}
                >
                  {countries.map(c => <option key={c.id} value={c.code}>{c.name}</option>)}
                </select>
              </div>

              {/* State (filtered by country) */}
              <div>
                <label htmlFor={`${idPrefix}-state`} className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
                  {t('users.attrs.state')}
                </label>
                <select
                  id={`${idPrefix}-state`}
                  value={value.state}
                  onChange={e => onChange({ state: e.target.value })}
                  className={INPUT_CLS}
                  disabled={stateOptions.length === 0}
                >
                  <option value="">{t('users.attrs.select')}</option>
                  {stateOptions.map(s => <option key={s.id} value={s.code}>{s.name}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* City */}
              <div>
                <label htmlFor={`${idPrefix}-city`} className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
                  {t('users.attrs.city')}
                </label>
                <input
                  id={`${idPrefix}-city`}
                  value={value.city}
                  onChange={e => onChange({ city: e.target.value })}
                  className={INPUT_CLS}
                />
              </div>

              {/* Pincode */}
              <div>
                <label htmlFor={`${idPrefix}-pincode`} className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
                  {t('users.attrs.pincode')}
                </label>
                <input
                  id={`${idPrefix}-pincode`}
                  value={value.pincode}
                  inputMode="numeric"
                  maxLength={6}
                  onChange={e => onChange({ pincode: e.target.value.replace(/\D/g, '') })}
                  placeholder="400001"
                  className={cn(INPUT_CLS, 'font-mono', errors.pincode && ERR_CLS)}
                />
                {errors.pincode && <p className="mt-1 text-xs text-rose-600">{errors.pincode}</p>}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Shared client-side validation for the KYC fields ────────────────────────

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/

/** Validates the optional KYC fields; returns a field→message map (empty = valid). */
export function validateUserAttributes(v: UserAttributesValue): Record<string, string> {
  const errs: Record<string, string> = {}
  if (v.panNumber && !PAN_RE.test(v.panNumber)) errs.panNumber = t('users.attrs.err.pan')
  if (v.aadhaarLast4 && !/^[0-9]{4}$/.test(v.aadhaarLast4)) errs.aadhaarLast4 = t('users.attrs.err.aadhaar')
  if (v.pincode && !/^[0-9]{6}$/.test(v.pincode)) errs.pincode = t('users.attrs.err.pincode')
  if (v.dateOfBirth && v.dateOfBirth > new Date().toISOString().slice(0, 10)) {
    errs.dateOfBirth = t('users.attrs.err.dob')
  }
  return errs
}

/** Maps the attribute value to the API profile input (omitting empties; PAN only when entered). */
export function toProfileInput(v: UserAttributesValue) {
  return {
    panNumber: v.panNumber || undefined,
    aadhaarLast4: v.aadhaarLast4 || undefined,
    dateOfBirth: v.dateOfBirth || undefined,
    gender: v.gender || undefined,
    addressLine1: v.addressLine1 || undefined,
    addressLine2: v.addressLine2 || undefined,
    city: v.city || undefined,
    state: v.state || undefined,
    pincode: v.pincode || undefined,
    country: v.country || undefined,
  }
}
