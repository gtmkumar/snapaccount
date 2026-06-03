/**
 * UserPreferencesSettings — Task #20
 * Wired to GET/PATCH /auth/me/preferences.
 * Theme select, language select, four notification toggles.
 */
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Toggle } from '@/components/ui/Toggle'
import { Skeleton } from '@/components/ui/Skeleton'
import { getUserPreferences, updateUserPreferences } from '@/lib/settingsApi'
import { t } from '@/i18n'
import { toast } from 'sonner'

const THEME_OPTIONS = [
  { value: 'LIGHT', label: t('settings.prefs.theme.light') },
  { value: 'DARK', label: t('settings.prefs.theme.dark') },
  { value: 'SYSTEM', label: t('settings.prefs.theme.system') },
] as const

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'Hindi (हिन्दी)' },
  { value: 'bn', label: 'Bengali (বাংলা)' },
  { value: 'gu', label: 'Gujarati (ગુજરાતી)' },
  { value: 'ta', label: 'Tamil (தமிழ்)' },
  { value: 'te', label: 'Telugu (తెలుగు)' },
]

export function UserPreferencesSettings() {
  const queryClient = useQueryClient()

  const [theme, setTheme] = useState<'LIGHT' | 'DARK' | 'SYSTEM'>('SYSTEM')
  const [lang, setLang] = useState('en')
  const [push, setPush] = useState(true)
  const [sms, setSms] = useState(true)
  const [email, setEmail] = useState(true)
  const [whatsapp, setWhatsapp] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['user-preferences'],
    queryFn: getUserPreferences,
    staleTime: 60_000,
  })

  useEffect(() => {
    if (!data) return
    if (data.theme) setTheme(data.theme)
    if (data.preferredLanguage) setLang(data.preferredLanguage)
    if (data.pushNotificationsEnabled !== undefined) setPush(data.pushNotificationsEnabled)
    if (data.smsNotificationsEnabled !== undefined) setSms(data.smsNotificationsEnabled)
    if (data.emailNotificationsEnabled !== undefined) setEmail(data.emailNotificationsEnabled)
    if (data.whatsappNotificationsEnabled !== undefined) setWhatsapp(data.whatsappNotificationsEnabled)
  }, [data])

  const saveMutation = useMutation({
    mutationFn: () =>
      updateUserPreferences({
        theme,
        preferredLanguage: lang,
        pushNotificationsEnabled: push,
        smsNotificationsEnabled: sms,
        emailNotificationsEnabled: email,
        whatsappNotificationsEnabled: whatsapp,
      }),
    onSuccess: () => {
      toast.success(t('settings.prefs.saved'))
      void queryClient.invalidateQueries({ queryKey: ['user-preferences'] })
    },
    onError: () => toast.error(t('settings.prefs.saveError')),
  })

  if (isLoading) return <Skeleton variant="card" />

  const selectClass =
    'w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-sunken)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]'

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-[var(--text-primary)]">
          {t('settings.prefs.title')}
        </h2>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          {t('settings.prefs.subtitle')}
        </p>
      </div>

      {/* Appearance */}
      <Card>
        <CardHeader title={t('settings.prefs.appearance')} />
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
              {t('settings.prefs.theme.label')}
            </label>
            <select
              className={selectClass}
              value={theme}
              onChange={(e) => setTheme(e.target.value as 'LIGHT' | 'DARK' | 'SYSTEM')}
              aria-label={t('settings.prefs.theme.label')}
            >
              {THEME_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
              {t('settings.prefs.language.label')}
            </label>
            <select
              className={selectClass}
              value={lang}
              onChange={(e) => setLang(e.target.value)}
              aria-label={t('settings.prefs.language.label')}
            >
              {LANGUAGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader title={t('settings.prefs.notifications')} />
        <div className="space-y-4">
          <Toggle
            checked={push}
            onChange={setPush}
            label={t('settings.prefs.notif.push')}
            description={t('settings.prefs.notif.pushDesc')}
          />
          <Toggle
            checked={sms}
            onChange={setSms}
            label={t('settings.prefs.notif.sms')}
            description={t('settings.prefs.notif.smsDesc')}
          />
          <Toggle
            checked={email}
            onChange={setEmail}
            label={t('settings.prefs.notif.email')}
            description={t('settings.prefs.notif.emailDesc')}
          />
          <Toggle
            checked={whatsapp}
            onChange={setWhatsapp}
            label={t('settings.prefs.notif.whatsapp')}
            description={t('settings.prefs.notif.whatsappDesc')}
          />
        </div>
      </Card>

      <div className="flex justify-end gap-3 pt-2">
        <Button
          variant="ghost"
          onClick={() => void queryClient.invalidateQueries({ queryKey: ['user-preferences'] })}
        >
          {t('common.cancel')}
        </Button>
        <Button
          variant="primary"
          onClick={() => saveMutation.mutate()}
          loading={saveMutation.isPending}
        >
          <Save className="h-4 w-4 mr-1" aria-hidden="true" />
          {t('settings.prefs.save')}
        </Button>
      </div>
    </div>
  )
}
