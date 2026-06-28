/**
 * PaymentGatewaySettings — Phase 6F / DG-SUB-06 fix
 *
 * DG-SUB-06: Save button previously called toast.success with a "local only —
 * API endpoint pending" stub. The backend PATCH /subscriptions/config/razorpay
 * (UpdateRazorpayConfigCommand, permission: subscription.config.write) already
 * exists. This file wires the Save button to a real useMutation.
 *
 * NOTE on DG-SUB-01: until the live RazorpayHttpClient is wired in the backend,
 * persisting credentials activates the DB row but does not start live billing.
 * The UI makes this clear via an info banner.
 */
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Eye, EyeOff, Copy, ExternalLink, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardHeader } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Toggle } from '@/components/ui/Toggle'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { AlertBanner } from '@/components/shared/AlertBanner'
import { updateRazorpayConfig } from '@/lib/subscriptionApi'
import { t } from '@/i18n'

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

  const saveMutation = useMutation({
    mutationFn: () => {
      const keyId     = isLiveMode ? liveKeyId     : testKeyId
      const keySecret = isLiveMode ? liveKeySecret : testKeySecret
      return updateRazorpayConfig({
        keyId,
        keySecret,
        webhookSecret: webhookSecret || undefined,
        testMode:  !isLiveMode,
        isEnabled: true,
      })
    },
    onSuccess: () => {
      toast.success(t('settings.paymentGateway.saved'))
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(t('settings.paymentGateway.saveError', { msg }))
    },
  })

  const handleSave = () => {
    const keyId     = isLiveMode ? liveKeyId     : testKeyId
    const keySecret = isLiveMode ? liveKeySecret : testKeySecret
    if (!keyId.trim() || !keySecret.trim()) {
      toast.error(t('settings.paymentGateway.validationError'))
      return
    }
    saveMutation.mutate()
  }

  const handleModeSwitchToLive = () => {
    if (!isLiveMode) {
      setShowLiveModeConfirm(true)
    } else {
      setIsLiveMode(false)
      toast.info(t('settings.paymentGateway.switchedToTest'))
    }
  }

  const copyToClipboard = (text: string) => {
    void navigator.clipboard.writeText(text)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-neutral-900">{t('settings.paymentGateway.title')}</h2>
          <p className="text-sm text-neutral-500 mt-1">{t('settings.paymentGateway.subtitle')}</p>
        </div>
        <Badge variant={isLiveMode ? 'success' : 'warning'} size="md">
          {isLiveMode ? t('settings.paymentGateway.liveMode') : t('settings.paymentGateway.testMode')}
        </Badge>
      </div>

      {/* Soft-launch info — DG-SUB-01 note */}
      <AlertBanner
        type="info"
        title={t('settings.paymentGateway.draftNote.title')}
        description={t('settings.paymentGateway.draftNote.body')}
      />

      {/* Status card */}
      <Card>
        <CardHeader title={t('settings.paymentGateway.connectionStatus')} />
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-2.5 rounded-full bg-success-500" aria-hidden="true" />
              <span className="text-sm font-medium text-success-700">{t('settings.paymentGateway.connected')}</span>
            </div>
            <p className="text-xs text-neutral-400">{t('settings.paymentGateway.lastTested')}</p>
          </div>
          <Button variant="secondary" size="sm">{t('settings.paymentGateway.testConnection')}</Button>
        </div>
      </Card>

      {/* Gateway selector */}
      <Card>
        <CardHeader title={t('settings.paymentGateway.gateway')} />
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer p-3 rounded-lg border-2 border-brand-500 bg-brand-50">
            <input type="radio" name="gateway" defaultChecked className="text-brand-500" />
            <div className="flex-1">
              <span className="text-sm font-semibold text-brand-700">Razorpay</span>
              <Badge variant="brand" size="sm" className="ml-2">{t('settings.paymentGateway.active')}</Badge>
            </div>
          </label>
          <p className="text-xs text-neutral-400 px-1">{t('settings.paymentGateway.gatewayNote')}</p>
        </div>
      </Card>

      {/* Mode toggle */}
      <Card>
        <CardHeader title={t('settings.paymentGateway.modeConfig')} />
        <Toggle
          checked={isLiveMode}
          onChange={handleModeSwitchToLive}
          label={isLiveMode ? t('settings.paymentGateway.liveMode') : t('settings.paymentGateway.testMode')}
          description={isLiveMode
            ? t('settings.paymentGateway.liveModeDesc')
            : t('settings.paymentGateway.testModeDesc')}
          size="lg"
        />

        {/* Inline live-mode confirmation banner */}
        {showLiveModeConfirm && (
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-amber-800 font-semibold text-sm">{t('settings.paymentGateway.liveModeConfirm.title')}</p>
                <p className="text-amber-700 text-sm mt-0.5">{t('settings.paymentGateway.liveModeConfirm.body')}</p>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowLiveModeConfirm(false)}
              >
                {t('common.cancel')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="bg-amber-600 text-white hover:bg-amber-700"
                onClick={() => {
                  setIsLiveMode(true)
                  setShowLiveModeConfirm(false)
                  toast.warning(t('settings.paymentGateway.switchedToLive'))
                }}
              >
                {t('settings.paymentGateway.liveModeConfirm.confirm')}
              </Button>
            </div>
          </div>
        )}

        {isLiveMode && (
          <AlertBanner
            type="warning"
            title={t('settings.paymentGateway.liveActiveTitle')}
            description={t('settings.paymentGateway.liveActiveDesc')}
            className="mt-4"
          />
        )}
      </Card>

      {/* Credentials */}
      <Card>
        <CardHeader title={isLiveMode ? t('settings.paymentGateway.liveCredentials') : t('settings.paymentGateway.testCredentials')} />
        <div className="space-y-4">
          <Input
            label={isLiveMode ? t('settings.paymentGateway.liveKeyId') : t('settings.paymentGateway.testKeyId')}
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
            label={isLiveMode ? t('settings.paymentGateway.liveKeySecret') : t('settings.paymentGateway.testKeySecret')}
            type={isLiveMode ? (showLiveSecret ? 'text' : 'password') : (showTestSecret ? 'text' : 'password')}
            value={isLiveMode ? liveKeySecret : testKeySecret}
            onChange={(e) => isLiveMode ? setLiveKeySecret(e.target.value) : setTestKeySecret(e.target.value)}
            placeholder="••••••••••••••••••••"
            suffix={
              <button
                onClick={() => isLiveMode ? setShowLiveSecret(p => !p) : setShowTestSecret(p => !p)}
                aria-label={t('settings.paymentGateway.toggleSecretVisibility')}
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
        <CardHeader title={t('settings.paymentGateway.webhookConfig')} />
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-neutral-700 block mb-1.5">
              {t('settings.paymentGateway.webhookUrl')}
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-9 rounded-lg border border-neutral-200 bg-neutral-50 px-3 flex items-center text-sm font-mono text-neutral-700 overflow-hidden">
                <span className="truncate">{webhookUrl}</span>
              </div>
              <Button
                variant="icon"
                size="sm"
                ariaLabel={t('settings.paymentGateway.copyWebhookUrl')}
                onClick={() => copyToClipboard(webhookUrl)}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-neutral-400 mt-1">
              {t('settings.paymentGateway.webhookUrlHint')}{' '}
              <a
                href="https://dashboard.razorpay.com/app/webhooks"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-600 hover:underline inline-flex items-center gap-1"
              >
                {t('settings.paymentGateway.openDashboard')} <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          </div>

          <Input
            label={t('settings.paymentGateway.webhookSecret')}
            type="password"
            value={webhookSecret}
            onChange={(e) => setWebhookSecret(e.target.value)}
            placeholder={t('settings.paymentGateway.webhookSecretPlaceholder')}
            hint={t('settings.paymentGateway.webhookSecretHint')}
          />
        </div>
      </Card>

      {/* Supported payment methods */}
      <Card>
        <CardHeader title={t('settings.paymentGateway.paymentMethods')} subtitle={t('settings.paymentGateway.paymentMethodsNote')} />
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
      <div className="flex justify-end gap-3 pt-2">
        <Button variant="ghost" disabled={saveMutation.isPending}>{t('common.cancel')}</Button>
        <Button
          variant="primary"
          onClick={handleSave}
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending ? t('common.saving') : t('settings.paymentGateway.save')}
        </Button>
      </div>
    </div>
  )
}
