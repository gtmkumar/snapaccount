/**
 * AvailabilityRuleEditor — weekly recurring availability rule rows for CA admin (GAP-031, Wave 7)
 * Rule: Every {{weekday}} {{start}}–{{end}}, {{slotLength}} min slots
 */
import { useState } from 'react'
import { Plus, Trash2, Clock } from 'lucide-react'
import { t } from '@/i18n'
import { cn } from '@/lib/utils'
import { Button } from './Button'
import type { Weekday, AvailabilityRule } from '@/lib/caApi'

const WEEKDAYS: Weekday[] = [
  'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY',
]

const SLOT_DURATIONS = [15, 30, 45, 60]

const WEEKDAY_LABELS: Record<Weekday, string> = {
  MONDAY:    'ca.weekday.monday',
  TUESDAY:   'ca.weekday.tuesday',
  WEDNESDAY: 'ca.weekday.wednesday',
  THURSDAY:  'ca.weekday.thursday',
  FRIDAY:    'ca.weekday.friday',
  SATURDAY:  'ca.weekday.saturday',
  SUNDAY:    'ca.weekday.sunday',
}

interface NewRuleForm {
  weekday: Weekday
  startTime: string
  endTime: string
  slotDurationMinutes: number
}

const DEFAULT_NEW_RULE: NewRuleForm = {
  weekday: 'MONDAY',
  startTime: '09:00',
  endTime: '17:00',
  slotDurationMinutes: 30,
}

interface AvailabilityRuleEditorProps {
  rules: AvailabilityRule[]
  onAdd: (rule: NewRuleForm) => Promise<void> | void
  onDelete: (ruleId: string) => Promise<void> | void
  onToggle?: (ruleId: string, active: boolean) => Promise<void> | void
  isLoading?: boolean
  className?: string
}

export function AvailabilityRuleEditor({
  rules,
  onAdd,
  onDelete,
  onToggle,
  isLoading,
  className,
}: AvailabilityRuleEditorProps) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [form, setForm] = useState<NewRuleForm>(DEFAULT_NEW_RULE)
  const [adding, setAdding] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof NewRuleForm, string>>>({})

  function validate(): boolean {
    const e: typeof errors = {}
    if (form.startTime >= form.endTime) {
      e.endTime = t('ca.admin.availability.error.endAfterStart')
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleAdd() {
    if (!validate()) return
    setAdding(true)
    try {
      await onAdd(form)
      setShowAddForm(false)
      setForm(DEFAULT_NEW_RULE)
    } finally {
      setAdding(false)
    }
  }

  const inputClass = cn(
    'rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm',
    'focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none',
    'bg-white text-neutral-900'
  )

  return (
    <div className={cn('space-y-3', className)}>
      {/* Existing rules */}
      {isLoading ? (
        <div className="space-y-2 animate-pulse">
          {[1, 2].map(i => <div key={i} className="h-12 bg-neutral-100 rounded-lg" />)}
        </div>
      ) : rules.length === 0 ? (
        <p className="text-sm text-neutral-400 text-center py-4">
          {t('ca.admin.availability.empty')}
        </p>
      ) : (
        <ul className="space-y-2" role="list" aria-label={t('ca.admin.availability.title')}>
          {rules.map(rule => (
            <li
              key={rule.id}
              className={cn(
                'flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border',
                'bg-white',
                rule.active ? 'border-neutral-200' : 'border-neutral-100 opacity-60'
              )}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Clock className="h-4 w-4 text-neutral-400 shrink-0" aria-hidden="true" />
                <span className="text-sm font-medium text-neutral-800">
                  {t(WEEKDAY_LABELS[rule.weekday])}
                </span>
                <span className="text-sm text-neutral-600">
                  {rule.startTime} – {rule.endTime}
                </span>
                <span className="text-xs text-neutral-400">
                  ({rule.slotDurationMinutes} {t('ca.admin.availability.minSlots')})
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {onToggle && (
                  <button
                    onClick={() => onToggle(rule.id, !rule.active)}
                    className={cn(
                      'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
                      rule.active ? 'bg-brand-500' : 'bg-neutral-200'
                    )}
                    role="switch"
                    aria-checked={rule.active}
                    aria-label={rule.active ? t('ca.admin.availability.deactivate') : t('ca.admin.availability.activate')}
                  >
                    <span
                      className={cn(
                        'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                        rule.active ? 'translate-x-4' : 'translate-x-0.5'
                      )}
                    />
                  </button>
                )}
                <button
                  onClick={() => onDelete(rule.id)}
                  className="p-1 rounded text-neutral-400 hover:text-error-600 hover:bg-error-50 transition-colors"
                  aria-label={`${t('ca.admin.availability.delete')} ${t(WEEKDAY_LABELS[rule.weekday])} ${rule.startTime}–${rule.endTime}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Add form */}
      {showAddForm ? (
        <div className="border border-brand-200 rounded-lg p-3 bg-brand-50/30 space-y-3">
          <p className="text-sm font-medium text-neutral-700">{t('ca.admin.availability.addRule')}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>
              <label className="block text-xs text-neutral-500 mb-1">{t('ca.admin.availability.weekday')}</label>
              <select
                value={form.weekday}
                onChange={e => setForm(f => ({ ...f, weekday: e.target.value as Weekday }))}
                className={inputClass}
                aria-label={t('ca.admin.availability.weekday')}
              >
                {WEEKDAYS.map(d => (
                  <option key={d} value={d}>{t(WEEKDAY_LABELS[d])}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-neutral-500 mb-1">{t('ca.admin.availability.startTime')}</label>
              <input
                type="time"
                value={form.startTime}
                onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
                className={inputClass}
                aria-label={t('ca.admin.availability.startTime')}
              />
            </div>
            <div>
              <label className="block text-xs text-neutral-500 mb-1">{t('ca.admin.availability.endTime')}</label>
              <input
                type="time"
                value={form.endTime}
                onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
                className={cn(inputClass, errors.endTime && 'border-error-500')}
                aria-label={t('ca.admin.availability.endTime')}
              />
              {errors.endTime && <p className="text-xs text-error-600 mt-0.5">{errors.endTime}</p>}
            </div>
            <div>
              <label className="block text-xs text-neutral-500 mb-1">{t('ca.admin.availability.slotLength')}</label>
              <select
                value={form.slotDurationMinutes}
                onChange={e => setForm(f => ({ ...f, slotDurationMinutes: Number(e.target.value) }))}
                className={inputClass}
                aria-label={t('ca.admin.availability.slotLength')}
              >
                {SLOT_DURATIONS.map(d => (
                  <option key={d} value={d}>{d} min</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={handleAdd} loading={adding}>
              {t('common.save')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => { setShowAddForm(false); setForm(DEFAULT_NEW_RULE); setErrors({}) }}
              disabled={adding}
            >
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<Plus className="h-4 w-4" />}
          onClick={() => setShowAddForm(true)}
        >
          {t('ca.admin.availability.addRule')}
        </Button>
      )}
    </div>
  )
}
