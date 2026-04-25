/**
 * WhatsAppSettings — Phase 6F
 * Wired to GET/PATCH /auth/config/whatsapp.
 * Replaces local-state-only version.
 */
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff, Copy, Save } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Toggle } from '@/components/ui/Toggle'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { AlertBanner } from '@/components/shared/AlertBanner'
import { Skeleton } from '@/components/ui/Skeleton'
import { getWhatsAppConfig, updateWhatsAppConfig } from '@/lib/settingsApi'
import { toast } from 'sonner'

const MESSAGE_EVENTS = [
  'GST filing reminders',
  'ITR deadline reminders',
  'Document processing updates',
  'Loan status updates',
  'Chat message notifications',
  'E-verification reminders',
  'Subscription renewal reminders',
  'Support callbacks',
]

export function WhatsAppSettings() {
  const queryClient = useQueryClient()
  const [enabled, setEnabled] = useState(false)
  const [showEnableConfirm, setShowEnableConfirm] = useState(false)
  const [showToken, setShowToken] = useState(false)
  const [wabaId, setWabaId] = useState('')
  const [phoneNumberId, setPhoneNumberId] = useState('')
  const [webhookVerifyToken, setWebhookVerifyToken] = useState('')
  const [eventToggles, setEventToggles] = useState<Record<string, boolean>>(
    Object.fromEntries(MESSAGE_EVENTS.map((e) => [e, false]))
  )

  const webhookUrl = 'https://api.snapaccount.in/webhooks/whatsapp'

  const { data, isLoading } = useQuery({
    queryKey: ['whatsapp-config'],
    queryFn: getWhatsAppConfig,
    staleTime: 60_000,
  })

  useEffect(() => {
    if (data) {
      setEnabled(data.enabled)
      if (data.wabaId) setWabaId(data.wabaId)
      if (data.phoneNumberId) setPhoneNumberId(data.phoneNumberId)
      if (data.webhookVerifyToken) setWebhookVerifyToken(data.webhookVerifyToken)
    }
  }, [data])

  const saveMutation = useMutation({
    mutationFn: () => updateWhatsAppConfig({
      enabled,
      wabaId: wabaId || null,
      phoneNumberId: phoneNumberId || null,
      webhookVerifyToken: webhookVerifyToken || null,
    }),
    onSuccess: () => {
      toast.success('WhatsApp settings saved')
      void queryClient.invalidateQueries({ queryKey: ['whatsapp-config'] })
    },
    onError: () => toast.error('Failed to save WhatsApp settings'),
  })

  const handleEnableToggle = (val: boolean) => {
    if (val) {
      setShowEnableConfirm(true)
    } else {
      setEnabled(false)
      toast.info('WhatsApp messaging disabled')
    }
  }

  if (isLoading) return <Skeleton variant="card" />

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-[var(--text-primary)]">WhatsApp Business API</h2>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Enable WhatsApp messaging for user communications. Off by default.
        </p>
      </div>

      {/* Master toggle */}
      <Card>
        <Toggle
          checked={enabled}
          onChange={handleEnableToggle}
          label="Enable WhatsApp Messaging"
          description={enabled
            ? 'WhatsApp messages are active. Users will receive messages on WhatsApp.'
            : 'WhatsApp messaging is disabled. All fields below are inactive.'}
          size="lg"
        />
        {!enabled && (
          <p className="text-xs text-[var(--text-tertiary)] mt-3">
            Feature-flagged OFF by default. Enable only when your WhatsApp Business account and Meta approval are complete.
          </p>
        )}
      </Card>

      {/* Inline enable confirmation banner */}
      {showEnableConfirm && (
        <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-blue-800 dark:text-blue-300 font-semibold text-sm">Enable WhatsApp Messaging?</p>
            <p className="text-blue-700 dark:text-blue-400 text-sm mt-0.5">
              This will start sending WhatsApp messages to users. Ensure your WhatsApp Business account is fully set up and Meta approval is complete.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="secondary" size="sm" onClick={() => setShowEnableConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setEnabled(true)
                setShowEnableConfirm(false)
                toast.success('WhatsApp messaging enabled')
              }}
            >
              Enable
            </Button>
          </div>
        </div>
      )}

      {/* Status (when enabled) */}
      {enabled && (
        <Card>
          <CardHeader title="Account Status" />
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-[var(--text-secondary)]">Account Status</p>
              <Badge variant="success" size="md" dot className="mt-1">Verified</Badge>
            </div>
            <div>
              <p className="text-xs text-[var(--text-secondary)]">Phone Number</p>
              <p className="text-sm font-mono font-medium text-[var(--text-primary)] mt-1">+91 XXXXXXXXXX</p>
            </div>
            <div>
              <p className="text-xs text-[var(--text-secondary)]">Monthly Messages</p>
              <p className="text-sm font-medium text-[var(--text-primary)] mt-1">1,247 / 10,000</p>
            </div>
          </div>
        </Card>
      )}

      {/* Credentials */}
      <Card>
        <CardHeader title="API Credentials" />
        <div className={`space-y-4 ${!enabled ? 'opacity-50 pointer-events-none' : ''}`}>
          <Input
            label="WhatsApp Business Account ID (WABA ID)"
            value={wabaId}
            onChange={(e) => setWabaId(e.target.value)}
            placeholder="1234567890123456"
            disabled={!enabled}
          />
          <Input
            label="Phone Number ID"
            value={phoneNumberId}
            onChange={(e) => setPhoneNumberId(e.target.value)}
            placeholder="9876543210123456"
            disabled={!enabled}
          />
          <Input
            label="Webhook Verify Token"
            type={showToken ? 'text' : 'password'}
            value={webhookVerifyToken}
            onChange={(e) => setWebhookVerifyToken(e.target.value)}
            placeholder="snap_wa_verify_token"
            disabled={!enabled}
            suffix={
              <button
                onClick={() => setShowToken((p) => !p)}
                disabled={!enabled}
                aria-label={showToken ? 'Hide token' : 'Show token'}
                className="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            }
          />
          <Button variant="secondary" size="sm" disabled={!enabled}>
            Verify Credentials
          </Button>
        </div>
      </Card>

      {/* Webhook */}
      <Card>
        <CardHeader title="Webhook Configuration (for Meta)" />
        <div className={`space-y-3 ${!enabled ? 'opacity-50' : ''}`}>
          <div>
            <label className="text-sm font-medium text-[var(--text-primary)] block mb-1.5">Webhook URL</label>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-9 rounded-lg border border-[var(--border-default)] bg-[var(--surface-sunken)] px-3 flex items-center text-sm font-mono text-[var(--text-primary)]">
                <span className="truncate">{webhookUrl}</span>
              </div>
              <Button variant="icon" size="sm" ariaLabel="Copy webhook URL" onClick={() => void navigator.clipboard.writeText(webhookUrl).then(() => toast.success('Copied'))}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Message events */}
      <Card>
        <CardHeader
          title="Send WhatsApp Messages For"
          subtitle="Choose which events trigger WhatsApp notifications"
        />
        <div className={`space-y-4 ${!enabled ? 'opacity-50 pointer-events-none' : ''}`}>
          {MESSAGE_EVENTS.map((event) => (
            <Toggle
              key={event}
              checked={eventToggles[event] ?? false}
              onChange={(val) => setEventToggles((prev) => ({ ...prev, [event]: val }))}
              label={event}
              disabled={!enabled}
            />
          ))}
        </div>
      </Card>

      {/* Opt-out notice */}
      <AlertBanner
        type="info"
        title="TRAI Compliance"
        description="Users who reply STOP are automatically unsubscribed. 0 users have opted out of WhatsApp messages."
      />

      <div className="flex justify-end gap-3 pt-2">
        <Button variant="ghost" onClick={() => queryClient.invalidateQueries({ queryKey: ['whatsapp-config'] })}>
          Cancel
        </Button>
        <Button variant="primary" onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>
          <Save className="h-4 w-4 mr-1" />
          Save WhatsApp Settings
        </Button>
      </div>
    </div>
  )
}
