/**
 * NotificationSettings — Phase 6F
 * Wired to GET/PUT /notifications/preferences.
 * Replaces local-state-only version.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Toggle } from '@/components/ui/Toggle'
import { Button } from '@/components/ui/Button'
import { AlertBanner } from '@/components/shared/AlertBanner'
import { Skeleton } from '@/components/ui/Skeleton'
import { getNotificationPreferences, upsertNotificationPreference, type NotificationPreference } from '@/lib/settingsApi'
import { toast } from 'sonner'

export function NotificationSettings() {
  const queryClient = useQueryClient()
  const [pushEnabled, setPushEnabled] = useState(true)
  const [smsEnabled, setSmsEnabled] = useState(true)
  const [emailEnabled, setEmailEnabled] = useState(true)
  const [fromEmail, setFromEmail] = useState('noreply@snapaccount.in')
  const [fromName, setFromName] = useState('SnapAccount')

  const { data: prefs, isLoading } = useQuery({
    queryKey: ['notifications', 'preferences'],
    queryFn: getNotificationPreferences,
    staleTime: 60_000,
  })

  const saveMutation = useMutation({
    mutationFn: (pref: NotificationPreference) => upsertNotificationPreference(pref),
    onSuccess: () => {
      toast.success('Notification preferences saved')
      void queryClient.invalidateQueries({ queryKey: ['notifications', 'preferences'] })
    },
    onError: () => toast.error('Failed to save notification preferences'),
  })

  const handleSaveAll = () => {
    if (!prefs?.length) {
      // Save a default record
      saveMutation.mutate({
        eventCode: 'global',
        pushEnabled,
        smsEnabled,
        emailEnabled,
        inAppEnabled: true,
        doNotDisturb: false,
      })
    } else {
      prefs.forEach(pref => {
        saveMutation.mutate({ ...pref, pushEnabled, smsEnabled, emailEnabled })
      })
    }
  }

  if (isLoading) return <Skeleton variant="card" />

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-[var(--text-primary)]">Notification Channels</h2>
        <p className="text-sm text-[var(--text-secondary)] mt-1">Configure credentials for each notification channel.</p>
      </div>

      {/* FCM */}
      <Card>
        <CardHeader
          title="Push Notifications (FCM)"
          actions={<Toggle checked={pushEnabled} onChange={setPushEnabled} size="sm" />}
        />
        <div className={`space-y-4 ${!pushEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
          <div className="flex items-center gap-2 py-2">
            <div className="h-2.5 w-2.5 rounded-full bg-success-500" aria-hidden="true" />
            <span className="text-sm text-success-700 font-medium">Firebase project connected</span>
          </div>
          <Button variant="secondary" size="sm" disabled={!pushEnabled}>
            Test — Send Push to My Device
          </Button>
        </div>
      </Card>

      {/* MSG91 SMS */}
      <Card>
        <CardHeader
          title="SMS (MSG91)"
          actions={<Toggle checked={smsEnabled} onChange={setSmsEnabled} size="sm" />}
        />
        <div className={`space-y-4 ${!smsEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
          <AlertBanner
            type="info"
            description="DLT registration is required for commercial SMS in India. Ensure all templates are registered with TRAI."
          />
          <Button variant="secondary" size="sm" disabled={!smsEnabled}>
            Test — Send Test SMS to My Number
          </Button>
        </div>
      </Card>

      {/* SendGrid Email */}
      <Card>
        <CardHeader
          title="Email (SendGrid)"
          actions={<Toggle checked={emailEnabled} onChange={setEmailEnabled} size="sm" />}
        />
        <div className={`space-y-4 ${!emailEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
          <Input
            label="From Email Address"
            type="email"
            value={fromEmail}
            onChange={(e) => setFromEmail(e.target.value)}
            disabled={!emailEnabled}
            placeholder="noreply@snapaccount.in"
          />
          <Input
            label="From Display Name"
            value={fromName}
            onChange={(e) => setFromName(e.target.value)}
            disabled={!emailEnabled}
            placeholder="SnapAccount"
          />
          <Button variant="secondary" size="sm" disabled={!emailEnabled}>
            Test — Send Test Email
          </Button>
        </div>
      </Card>

      <div className="flex justify-end gap-3 pt-2">
        <Button variant="ghost" onClick={() => queryClient.invalidateQueries({ queryKey: ['notifications', 'preferences'] })}>
          Cancel
        </Button>
        <Button variant="primary" onClick={handleSaveAll} loading={saveMutation.isPending}>
          <Save className="h-4 w-4 mr-1" />
          Save Notification Settings
        </Button>
      </div>
    </div>
  )
}
