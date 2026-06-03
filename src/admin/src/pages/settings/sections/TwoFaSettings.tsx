/**
 * TwoFaSettings — Task #20
 * Wired to:
 *   GET  /auth/me/2fa/status
 *   POST /auth/me/2fa/enroll   -> { otpauthUri, base32Secret }
 *   POST /auth/me/2fa/confirm  -> { recoveryCodes[] }
 *   POST /auth/me/2fa/disable  -> 204
 *
 * Flow: status -> enroll -> QR + manual secret -> confirm code -> recovery codes shown once.
 * Disable: prompt for TOTP or recovery code -> disable.
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { QRCodeSVG } from 'qrcode.react'
import {
  ShieldCheck,
  ShieldOff,
  Copy,
  CheckCircle2,
} from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Dialog } from '@/components/ui/Dialog'
import { Skeleton } from '@/components/ui/Skeleton'
import {
  get2FaStatus,
  enroll2Fa,
  confirm2Fa,
  disable2Fa,
  type TwoFaEnrollResponse,
} from '@/lib/settingsApi'
import { t } from '@/i18n'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

// ── Enroll flow dialog ────────────────────────────────────────────────────────

type EnrollStep = 'qr' | 'confirm' | 'recovery'

function EnrollDialog({
  open,
  onClose,
  enrollData,
}: {
  open: boolean
  onClose: () => void
  enrollData: TwoFaEnrollResponse
}) {
  const queryClient = useQueryClient()
  const [step, setStep] = useState<EnrollStep>('qr')
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState('')
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([])
  const [acknowledged, setAcknowledged] = useState(false)
  const [copied, setCopied] = useState(false)

  const confirmMutation = useMutation({
    mutationFn: () => confirm2Fa(code),
    onSuccess: (data) => {
      setRecoveryCodes(data.recoveryCodes)
      setStep('recovery')
      void queryClient.invalidateQueries({ queryKey: ['2fa-status'] })
    },
    onError: () => {
      setCodeError(t('twofa.invalidCode'))
    },
  })

  function handleConfirm() {
    setCodeError('')
    if (!/^\d{6}$/.test(code)) {
      setCodeError(t('twofa.codeMustBe6Digits'))
      return
    }
    confirmMutation.mutate()
  }

  function handleCopySecret() {
    void navigator.clipboard.writeText(enrollData.base32Secret)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleCopyRecovery() {
    void navigator.clipboard.writeText(recoveryCodes.join('\n'))
    toast.success(t('twofa.recoveryCopied'))
  }

  function handleDone() {
    onClose()
    toast.success(t('twofa.enabled'))
  }

  const inputClass = cn(
    'w-full rounded-lg border px-3 py-2 text-sm text-center tracking-widest font-mono',
    'bg-[var(--surface-sunken)] border-[var(--border-default)] text-[var(--text-primary)]',
    'focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]',
    codeError && 'border-rose-500'
  )

  return (
    <Dialog
      open={open}
      onClose={step === 'recovery' ? (acknowledged ? onClose : () => {}) : onClose}
      title={
        step === 'qr'
          ? t('twofa.enroll.title')
          : step === 'confirm'
            ? t('twofa.confirm.title')
            : t('twofa.recovery.title')
      }
      description={
        step === 'qr'
          ? t('twofa.enroll.desc')
          : step === 'confirm'
            ? t('twofa.confirm.desc')
            : t('twofa.recovery.desc')
      }
      size="md"
      mandatoryConfirm={step === 'recovery' && !acknowledged}
      footer={
        step === 'qr' ? (
          <>
            <Button variant="primary" onClick={() => setStep('confirm')}>
              {t('twofa.enroll.next')}
            </Button>
            <Button variant="ghost" onClick={onClose}>
              {t('common.cancel')}
            </Button>
          </>
        ) : step === 'confirm' ? (
          <>
            <Button
              variant="primary"
              onClick={handleConfirm}
              loading={confirmMutation.isPending}
            >
              {t('twofa.confirm.cta')}
            </Button>
            <Button variant="ghost" onClick={() => setStep('qr')}>
              {t('common.back')}
            </Button>
          </>
        ) : (
          <Button variant="primary" onClick={handleDone} disabled={!acknowledged}>
            {t('twofa.recovery.done')}
          </Button>
        )
      }
    >
      {/* Step 1: QR code */}
      {step === 'qr' && (
        <div className="space-y-4">
          <div className="flex justify-center p-4 bg-white rounded-xl border border-[var(--border-subtle)]">
            <QRCodeSVG
              value={enrollData.otpauthUri}
              size={180}
              level="M"
              aria-label={t('twofa.enroll.qrAriaLabel')}
            />
          </div>
          <div>
            <p className="text-xs text-[var(--text-secondary)] mb-1.5">
              {t('twofa.enroll.manualEntry')}
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 rounded-lg bg-[var(--surface-sunken)] border border-[var(--border-default)] text-xs font-mono text-[var(--text-primary)] break-all">
                {enrollData.base32Secret}
              </code>
              <button
                onClick={handleCopySecret}
                className="shrink-0 p-2 rounded-lg hover:bg-[var(--surface-sunken)] transition-colors text-[var(--text-secondary)]"
                aria-label={t('twofa.enroll.copySecret')}
              >
                {copied ? (
                  <CheckCircle2 className="h-4 w-4 text-success-600" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Enter 6-digit code */}
      {step === 'confirm' && (
        <div className="space-y-4">
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.replace(/\D/g, '').slice(0, 6))
              setCodeError('')
            }}
            className={inputClass}
            aria-label={t('twofa.confirm.codeLabel')}
            autoFocus
          />
          {codeError && (
            <p className="text-xs text-rose-600">{codeError}</p>
          )}
        </div>
      )}

      {/* Step 3: Recovery codes */}
      {step === 'recovery' && (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
            <p className="text-sm font-semibold text-amber-800 mb-2">
              {t('twofa.recovery.warning')}
            </p>
            <p className="text-xs text-amber-700">{t('twofa.recovery.warningDesc')}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {recoveryCodes.map((code) => (
              <code
                key={code}
                className="px-3 py-1.5 rounded bg-[var(--surface-sunken)] text-xs font-mono text-[var(--text-primary)] text-center"
              >
                {code}
              </code>
            ))}
          </div>
          <Button variant="secondary" size="sm" onClick={handleCopyRecovery} fullWidth>
            <Copy className="h-4 w-4 mr-1" aria-hidden="true" />
            {t('twofa.recovery.copy')}
          </Button>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-[var(--border-default)] accent-[var(--brand-primary)]"
            />
            <span className="text-sm text-[var(--text-secondary)]">
              {t('twofa.recovery.acknowledge')}
            </span>
          </label>
        </div>
      )}
    </Dialog>
  )
}

// ── Disable dialog ────────────────────────────────────────────────────────────

function DisableDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState('')

  const disableMutation = useMutation({
    mutationFn: () => disable2Fa(code),
    onSuccess: () => {
      toast.success(t('twofa.disabled'))
      void queryClient.invalidateQueries({ queryKey: ['2fa-status'] })
      onClose()
    },
    onError: () => {
      setCodeError(t('twofa.invalidCode'))
    },
  })

  function handleDisable() {
    setCodeError('')
    if (!code.trim()) {
      setCodeError(t('twofa.codeRequired'))
      return
    }
    disableMutation.mutate()
  }

  const inputClass = cn(
    'w-full rounded-lg border px-3 py-2 text-sm text-center tracking-widest font-mono',
    'bg-[var(--surface-sunken)] border-[var(--border-default)] text-[var(--text-primary)]',
    'focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]',
    codeError && 'border-rose-500'
  )

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('twofa.disable.title')}
      description={t('twofa.disable.desc')}
      size="sm"
      footer={
        <>
          <Button
            variant="primary"
            onClick={handleDisable}
            loading={disableMutation.isPending}
            className="bg-rose-600 hover:bg-rose-700"
          >
            {t('twofa.disable.cta')}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        <label className="block text-sm font-medium text-[var(--text-primary)]">
          {t('twofa.disable.codeLabel')}
        </label>
        <input
          type="text"
          inputMode="numeric"
          placeholder={t('twofa.disable.codePlaceholder')}
          value={code}
          onChange={(e) => {
            setCode(e.target.value)
            setCodeError('')
          }}
          className={inputClass}
          aria-label={t('twofa.disable.codeLabel')}
          autoFocus
        />
        {codeError && (
          <p className="text-xs text-rose-600">{codeError}</p>
        )}
        <p className="text-xs text-[var(--text-tertiary)]">
          {t('twofa.disable.codeHint')}
        </p>
      </div>
    </Dialog>
  )
}

// ── Main section ──────────────────────────────────────────────────────────────

export function TwoFaSettings() {
  const [showEnroll, setShowEnroll] = useState(false)
  const [showDisable, setShowDisable] = useState(false)
  const [enrollData, setEnrollData] = useState<TwoFaEnrollResponse | null>(null)

  const { data: status, isLoading } = useQuery({
    queryKey: ['2fa-status'],
    queryFn: get2FaStatus,
    staleTime: 30_000,
  })

  const enrollMutation = useMutation({
    mutationFn: enroll2Fa,
    onSuccess: (data) => {
      setEnrollData(data)
      setShowEnroll(true)
    },
    onError: () => toast.error(t('twofa.enrollError')),
  })

  if (isLoading) return <Skeleton variant="card" />

  const enabled = status?.enabled ?? false

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-[var(--text-primary)]">
          {t('twofa.title')}
        </h2>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          {t('twofa.subtitle')}
        </p>
      </div>

      <Card>
        <CardHeader
          title={t('twofa.section.title')}
          actions={
            <Badge variant={enabled ? 'success' : 'neutral'}>
              {enabled ? t('twofa.status.enabled') : t('twofa.status.disabled')}
            </Badge>
          }
        />
        <div className="space-y-4">
          {enabled ? (
            <>
              <div className="flex items-center gap-3 py-2">
                <ShieldCheck className="h-6 w-6 text-success-600 shrink-0" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    {t('twofa.enabled.headline')}
                  </p>
                  {status?.confirmedAt && (
                    <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                      {t('twofa.enabled.since', {
                        date: new Date(status.confirmedAt).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        }),
                      })}
                    </p>
                  )}
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowDisable(true)}
                className="text-rose-600 border-rose-200 hover:bg-rose-50"
              >
                <ShieldOff className="h-4 w-4 mr-1" aria-hidden="true" />
                {t('twofa.disable.cta')}
              </Button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 py-2">
                <ShieldOff className="h-6 w-6 text-neutral-400 shrink-0" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    {t('twofa.disabled.headline')}
                  </p>
                  <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                    {t('twofa.disabled.desc')}
                  </p>
                </div>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={() => enrollMutation.mutate()}
                loading={enrollMutation.isPending}
              >
                <ShieldCheck className="h-4 w-4 mr-1" aria-hidden="true" />
                {t('twofa.enable.cta')}
              </Button>
            </>
          )}
        </div>
      </Card>

      {/* Enroll dialog */}
      {enrollData && (
        <EnrollDialog
          open={showEnroll}
          onClose={() => {
            setShowEnroll(false)
            setEnrollData(null)
          }}
          enrollData={enrollData}
        />
      )}

      {/* Disable dialog */}
      <DisableDialog open={showDisable} onClose={() => setShowDisable(false)} />
    </div>
  )
}
