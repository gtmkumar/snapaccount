/**
 * LanguageSettings — Phase 6F
 * Wired to GET/PATCH /auth/config/language.
 * Replaces local-state-only version.
 */
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { getLanguageSettings, updateLanguageSettings } from '@/lib/settingsApi'
import { toast } from 'sonner'

const LANGUAGES = [
  { code: 'en', name: 'English', uiCompletion: 100, notificationChannels: 'All channels', status: 'Active', required: true },
  { code: 'hi', name: 'Hindi', uiCompletion: 85, notificationChannels: 'Push + SMS', status: 'Active', required: false },
  { code: 'bn', name: 'Bengali', uiCompletion: 60, notificationChannels: 'Push only', status: 'Partial', required: false },
  { code: 'gu', name: 'Gujarati', uiCompletion: 20, notificationChannels: 'None', status: 'Inactive', required: false },
  { code: 'ta', name: 'Tamil', uiCompletion: 15, notificationChannels: 'None', status: 'Inactive', required: false },
  { code: 'te', name: 'Telugu', uiCompletion: 10, notificationChannels: 'None', status: 'Inactive', required: false },
  { code: 'kn', name: 'Kannada', uiCompletion: 8, notificationChannels: 'None', status: 'Inactive', required: false },
  { code: 'mr', name: 'Marathi', uiCompletion: 25, notificationChannels: 'Push only', status: 'Inactive', required: false },
  { code: 'ml', name: 'Malayalam', uiCompletion: 5, notificationChannels: 'None', status: 'Inactive', required: false },
  { code: 'pa', name: 'Punjabi', uiCompletion: 12, notificationChannels: 'None', status: 'Inactive', required: false },
  { code: 'or', name: 'Odia', uiCompletion: 5, notificationChannels: 'None', status: 'Inactive', required: false },
]

export function LanguageSettings() {
  const queryClient = useQueryClient()
  const [defaultLanguage, setDefaultLanguage] = useState('en')
  const [enabledLanguages, setEnabledLanguages] = useState<string[]>(['en', 'hi'])

  const { data, isLoading } = useQuery({
    queryKey: ['language-settings'],
    queryFn: getLanguageSettings,
    staleTime: 60_000,
  })

  // Sync API data into local form state
  useEffect(() => {
    if (data) {
      setDefaultLanguage(data.defaultLocale ?? 'en')
      if (data.supportedLocales?.length) {
        setEnabledLanguages(data.supportedLocales)
      }
    }
  }, [data])

  const saveMutation = useMutation({
    mutationFn: () => updateLanguageSettings({
      defaultLocale: defaultLanguage,
      supportedLocales: enabledLanguages,
      fallbackLocale: 'en',
    }),
    onSuccess: () => {
      toast.success('Language settings saved')
      void queryClient.invalidateQueries({ queryKey: ['language-settings'] })
    },
    onError: () => toast.error('Failed to save language settings'),
  })

  const toggleLanguage = (code: string, required: boolean) => {
    if (required) return
    setEnabledLanguages((prev) =>
      prev.includes(code) ? prev.filter((l) => l !== code) : [...prev, code]
    )
  }

  const statusVariant = (status: string): 'success' | 'warning' | 'neutral' =>
    status === 'Active' ? 'success' : status === 'Partial' ? 'warning' : 'neutral'

  if (isLoading) return <Skeleton variant="card" />

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-[var(--text-primary)]">Language &amp; Localization</h2>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Configure default and available languages for the platform.
        </p>
      </div>

      {/* Default language */}
      <Card>
        <CardHeader title="Default Language" subtitle="Affects new users and users with no language preference set" />
        <select
          value={defaultLanguage}
          onChange={(e) => setDefaultLanguage(e.target.value)}
          className="w-64 h-11 rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)] text-base px-3 text-[var(--text-primary)] focus:border-[var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)]/20 outline-none"
          aria-label="Platform default language"
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.code} value={lang.code}>{lang.name}</option>
          ))}
        </select>
      </Card>

      {/* Enabled languages */}
      <Card>
        <CardHeader
          title="Languages Available to Users"
          subtitle="Enable languages only when UI translations and Sarvam AI are configured"
        />
        <div className="space-y-3">
          {LANGUAGES.map((lang) => (
            <label
              key={lang.code}
              className={`flex items-center gap-3 ${lang.required ? 'cursor-default' : 'cursor-pointer'}`}
            >
              <input
                type="checkbox"
                checked={enabledLanguages.includes(lang.code)}
                onChange={() => toggleLanguage(lang.code, lang.required)}
                disabled={lang.required}
                className="h-4 w-4 rounded border-[var(--border-default)] text-[var(--brand-primary)] focus:ring-[var(--brand-primary)] disabled:opacity-50"
                aria-label={`${lang.name}${lang.required ? ' (always enabled)' : ''}`}
              />
              <span className="flex-1 text-sm text-[var(--text-primary)]">
                {lang.name}
                {lang.required && (
                  <span className="text-xs text-[var(--text-tertiary)] ml-2">(always enabled)</span>
                )}
              </span>
            </label>
          ))}
        </div>
        <p className="text-xs text-[var(--text-tertiary)] mt-4">
          Sarvam AI supports all Indian state languages listed above. Enable only when corresponding UI translations and Sarvam AI keys are configured.
        </p>
      </Card>

      {/* Translation status table */}
      <Card>
        <CardHeader title="Translation Completeness" subtitle="Current status of UI translations and notification templates" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm" aria-label="Translation status">
            <thead>
              <tr className="border-b border-[var(--border-default)]">
                {['Language', 'UI Translations', 'Notification Templates', 'Status'].map((h) => (
                  <th key={h} scope="col" className="px-4 py-2 text-left text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-default)]">
              {LANGUAGES.slice(0, 5).map((lang) => (
                <tr key={lang.code} className="hover:bg-[var(--surface-sunken)]">
                  <td className="px-4 py-3 font-medium text-[var(--text-primary)]">{lang.name}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 rounded-full bg-[var(--surface-sunken)] max-w-24">
                        <div
                          className={`h-2 rounded-full ${lang.uiCompletion >= 80 ? 'bg-success-500' : lang.uiCompletion >= 40 ? 'bg-warning-500' : 'bg-error-400'}`}
                          style={{ width: `${lang.uiCompletion}%` }}
                        />
                      </div>
                      <span className="text-xs text-[var(--text-secondary)] tabular-nums w-8">{lang.uiCompletion}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)] text-xs">{lang.notificationChannels}</td>
                  <td className="px-4 py-3">
                    <Badge variant={statusVariant(lang.status)} dot size="sm">{lang.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Fixed settings */}
      <Card>
        <CardHeader title="Fixed Settings (Non-configurable)" />
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between py-2 border-b border-[var(--border-default)]">
            <dt className="text-[var(--text-secondary)]">Date Format</dt>
            <dd className="font-medium text-[var(--text-primary)]">DD/MM/YYYY (Indian standard)</dd>
          </div>
          <div className="flex justify-between py-2 border-b border-[var(--border-default)]">
            <dt className="text-[var(--text-secondary)]">Time Zone</dt>
            <dd className="font-medium text-[var(--text-primary)]">IST (UTC+5:30) — DPDP data localization</dd>
          </div>
          <div className="flex justify-between py-2">
            <dt className="text-[var(--text-secondary)]">Currency</dt>
            <dd className="font-medium text-[var(--text-primary)]">INR ₹ — Indian Rupee</dd>
          </div>
        </dl>
      </Card>

      <div className="flex justify-end gap-3 pt-2">
        <Button variant="ghost" onClick={() => queryClient.invalidateQueries({ queryKey: ['language-settings'] })}>
          Cancel
        </Button>
        <Button variant="primary" onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>
          <Save className="h-4 w-4 mr-1" />
          Save Language Settings
        </Button>
      </div>
    </div>
  )
}
