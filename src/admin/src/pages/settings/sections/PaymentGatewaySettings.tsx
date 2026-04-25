/**
 * PaymentGatewaySettings — Phase 6F
 *
 * SEC-056 (LOW): Save actions currently call toast.success with a "local only — API endpoint
 * pending" message. This is intentional — SubscriptionService does not yet expose
 * PATCH /subscriptions/config/razorpay. When that endpoint ships, replace the toast.success
 * stub on the Save button with a useMutation calling settingsApi.updatePaymentGateway().
 * Track in backlog: "Wire PaymentGatewaySettings save to SubscriptionService API".
 */
import { useState } from 'react'
import { Eye, EyeOff, Copy, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardHeader } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Toggle } from '@/components/ui/Toggle'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { AlertBanner } from '@/components/shared/AlertBanner'

export function PaymentGatewaySettings() {
  const [isLiveMode, setIsLiveMode] = useState(false)
  const [showLiveModeConfirm, setShowLiveModeConfirm] = useState(false)
  const [showTestKey, setShowTestKey] = useState(false)
  const [showTestSecret, setShowTestSecret] = useState(false)
  const [showLiveKey, setShowLiveKey] = useState(false)
  const [showLiveSecret, setShowLiveSecret] = useState(false)
  const [testKeyId, setTestKeyId] = useState('')
  const [testKeySecret, setTestKeySecret] = useState('')
  const [liveKeyId, setLiveKeyId] = useState('')
  const [liveKeySecret, setLiveKeySecret] = useState('')
  const [webhookSecret, setWebhookSecret] = useState('')

  const webhookUrl = 'https://api.snapaccount.in/webhooks/razorpay'

  const handleModeSwitchToLive = () => {
    if (!isLiveMode) {
      setShowLiveModeConfirm(true)
    } else {
      setIsLiveMode(false)
      toast.info('Switched back to Test Mode')
    }
  }

  const copyToClipboard = (text: string) => {
    void navigator.clipboard.writeText(text)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-neutral-900">Payment Gateway</h2>
          <p className="text-sm text-neutral-500 mt-1">Configure Razorpay credentials for subscription billing</p>
        </div>
        <Badge variant={isLiveMode ? 'success' : 'warning'} size="md">
          {isLiveMode ? 'LIVE' : 'TEST'} MODE
        </Badge>
      </div>

      {/* Status card */}
      <Card>
        <CardHeader title="Connection Status" />
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-success-500" aria-hidden="true" />
              <span className="text-sm font-medium text-success-700">Connected</span>
            </div>
            <p className="text-xs text-neutral-400">Last tested: 2 hours ago</p>
          </div>
          <Button variant="secondary" size="sm">Test Connection</Button>
        </div>
      </Card>

      {/* Gateway selector */}
      <Card>
        <CardHeader title="Payment Gateway" />
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg border-2 border-brand-500 bg-brand-50">
            <input type="radio" name="gateway" defaultChecked className="text-brand-500" />
            <div className="flex-1">
              <span className="text-sm font-semibold text-brand-700">Razorpay</span>
              <Badge variant="brand" size="sm" className="ml-2">Active</Badge>
            </div>
          </label>
          <p className="text-xs text-neutral-400 px-1">Additional payment gateways can be configured when required.</p>
        </div>
      </Card>

      {/* Mode toggle */}
      <Card>
        <CardHeader title="Mode Configuration" />
        <Toggle
          checked={isLiveMode}
          onChange={handleModeSwitchToLive}
          label={isLiveMode ? 'Live Mode' : 'Test Mode'}
          description={isLiveMode
            ? 'Real payments are being processed. Handle credentials with extreme care.'
            : 'Using test credentials. No real payments will be processed.'}
          size="lg"
        />

        {/* Inline live-mode confirmation banner */}
        {showLiveModeConfirm && (
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start justify-between gap-4">
            <div>
              <p className="text-amber-800 font-semibold text-sm">Switch to LIVE mode?</p>
              <p className="text-amber-700 text-sm mt-0.5">Real payments will be processed. Ensure your live credentials are correct before proceeding.</p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowLiveModeConfirm(false)}
              >
                Cancel
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="bg-amber-600 text-white hover:bg-amber-700"
                onClick={() => {
                  setIsLiveMode(true)
                  setShowLiveModeConfirm(false)
                  toast.warning('Switched to LIVE mode — real payments are now active')
                }}
              >
                Switch to Live
              </Button>
            </div>
          </div>
        )}

        {isLiveMode && (
          <AlertBanner
            type="warning"
            title="Live Mode Active"
            description="Real payments will be processed. Never share or commit these credentials to version control."
            className="mt-4"
          />
        )}
      </Card>

      {/* Credentials */}
      <Card>
        <CardHeader title={isLiveMode ? 'Live Credentials' : 'Test Credentials'} />
        <div className="space-y-4">
          <Input
            label={isLiveMode ? 'Razorpay Live Key ID' : 'Razorpay Test Key ID'}
            type={isLiveMode ? (showLiveKey ? 'text' : 'password') : (showTestKey ? 'text' : 'password')}
            value={isLiveMode ? liveKeyId : testKeyId}
            onChange={(e) => isLiveMode ? setLiveKeyId(e.target.value) : setTestKeyId(e.target.value)}
            placeholder={isLiveMode ? 'rzp_live_xxxxxxxxxxxxxxxx' : 'rzp_test_xxxxxxxxxxxxxxxx'}
            hint={`Format: ${isLiveMode ? 'rzp_live_' : 'rzp_test_'} prefix required`}
            suffix={
              <button
                onClick={() => isLiveMode ? setShowLiveKey(p => !p) : setShowTestKey(p => !p)}
                aria-label={isLiveMode ? (showLiveKey ? 'Hide' : 'Show') + ' live key' : (showTestKey ? 'Hide' : 'Show') + ' test key'}
                className="text-neutral-400 hover:text-neutral-600"
              >
                {(isLiveMode ? showLiveKey : showTestKey) ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            }
          />

          <Input
            label={isLiveMode ? 'Razorpay Live Key Secret' : 'Razorpay Test Key Secret'}
            type={isLiveMode ? (showLiveSecret ? 'text' : 'password') : (showTestSecret ? 'text' : 'password')}
            value={isLiveMode ? liveKeySecret : testKeySecret}
            onChange={(e) => isLiveMode ? setLiveKeySecret(e.target.value) : setTestKeySecret(e.target.value)}
            placeholder="••••••••••••••••••••"
            suffix={
              <button
                onClick={() => isLiveMode ? setShowLiveSecret(p => !p) : setShowTestSecret(p => !p)}
                aria-label="Toggle secret visibility"
                className="text-neutral-400 hover:text-neutral-600"
              >
                {(isLiveMode ? showLiveSecret : showTestSecret) ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            }
          />
        </div>
      </Card>

      {/* Webhook */}
      <Card>
        <CardHeader title="Webhook Configuration" />
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-neutral-700 block mb-1.5">
              Webhook URL (configure in Razorpay Dashboard)
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-9 rounded-lg border border-neutral-200 bg-neutral-50 px-3 flex items-center text-sm font-mono text-neutral-700 overflow-hidden">
                <span className="truncate">{webhookUrl}</span>
              </div>
              <Button
                variant="icon"
                size="sm"
                ariaLabel="Copy webhook URL"
                onClick={() => copyToClipboard(webhookUrl)}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-neutral-400 mt-1">
              Configure this URL in your Razorpay Dashboard → Settings → Webhooks.{' '}
              <a
                href="https://dashboard.razorpay.com/app/webhooks"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-600 hover:underline inline-flex items-center gap-1"
              >
                Open Razorpay Dashboard <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          </div>

          <Input
            label="Webhook Secret"
            type="password"
            value={webhookSecret}
            onChange={(e) => setWebhookSecret(e.target.value)}
            placeholder="Webhook signing secret from Razorpay"
            hint="Used to verify webhook request signatures"
          />
        </div>
      </Card>

      {/* Supported payment methods */}
      <Card>
        <CardHeader title="Supported Payment Methods" subtitle="Enabled by default in Razorpay" />
        <div className="flex flex-wrap gap-3">
          {['UPI', 'Cards', 'Net Banking', 'Wallets', 'EMI'].map((method) => (
            <label key={method} className="flex items-center gap-2 cursor-default">
              <input type="checkbox" defaultChecked disabled className="text-brand-500" />
              <span className="text-sm text-neutral-600">{method}</span>
            </label>
          ))}
        </div>
      </Card>

      {/* Save */}
      {/* TODO: Wire to API when SubscriptionService exposes PATCH /subscriptions/config/razorpay */}
      <div className="flex justify-end gap-3 pt-2">
        <Button variant="ghost">Cancel</Button>
        <Button variant="primary" onClick={() => toast.success('Payment settings saved (local only — API endpoint pending)')}>
          Save Payment Settings
        </Button>
      </div>
    </div>
  )
}
