/**
 * ConsentAuditCard — Phase 6C
 * Read-only DPDP audit row for the Consents tab on LoanDetailPage.
 * Hash announced as "signature ending {last4}" for accessibility.
 */
import { Shield, ShieldCheck, ShieldAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import { Badge } from './Badge'
import type { ConsentType } from '@/lib/loanApi'

interface ConsentAuditCardProps {
  consentType: ConsentType
  version: string
  signedAt: string
  signatureHex: string
  ip: string | null | undefined
  userAgent: string | null | undefined
  biometricUsed: boolean | null | undefined
  onVerifyHmac: () => void
  onViewText: () => void
  verifyResult?: 'ok' | 'fail' | null
  verifying?: boolean
  className?: string
}

const consentTypeLabels: Record<ConsentType, string> = {
  CREDIT_BUREAU: 'Credit Bureau',
  DATA_SHARE_WITH_BANK: 'Data Share with Bank',
  DISBURSEMENT_MANDATE: 'Disbursement Mandate',
}

export function ConsentAuditCard({
  consentType,
  version,
  signedAt,
  signatureHex,
  ip,
  userAgent,
  biometricUsed,
  onVerifyHmac,
  onViewText,
  verifyResult,
  verifying = false,
  className,
}: ConsentAuditCardProps) {
  const last4 = signatureHex ? signatureHex.slice(-4) : '????'
  const signedDate = new Date(signedAt).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  })

  return (
    <div
      className={cn(
        'rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 space-y-3',
        className
      )}
      role="article"
      aria-label={`Consent record for ${consentTypeLabels[consentType]}`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" aria-hidden="true" />
          <span className="font-semibold text-sm text-[var(--text-primary)]">
            {consentTypeLabels[consentType]}
          </span>
        </div>
        <Badge variant="success" size="sm">{t('admin.loanDetail.consent.signed')}</Badge>
      </div>

      {/* Meta rows */}
      <div className="text-xs text-[var(--text-secondary)] space-y-1">
        <p>
          <span className="font-medium">{t('admin.loanDetail.consent.version')}: </span>
          {version}
          {' · '}
          <span>{t('admin.loanDetail.consent.signedAt')} {signedDate}</span>
        </p>
        <p
          aria-label={`Signature ending ${last4}`}
        >
          <span className="font-medium">{t('admin.loanDetail.consent.hash')}: </span>
          <span className="font-mono text-[var(--text-disabled)]">…{last4}</span>
        </p>
        {ip && (
          <p>
            <span className="font-medium">IP: </span>
            {ip}
            {userAgent && (
              <> · <span className="text-[var(--text-disabled)] truncate max-w-xs inline-block align-bottom">{userAgent.slice(0, 60)}</span></>
            )}
            {biometricUsed !== null && biometricUsed !== undefined && (
              <> · Bio: {biometricUsed ? 'yes' : 'no'}</>
            )}
          </p>
        )}
      </div>

      {/* HMAC verify result */}
      {verifyResult === 'ok' && (
        <div className="flex items-center gap-1.5 text-xs text-success-700">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          {t('admin.loanDetail.consent.verifyResult.ok')}
        </div>
      )}
      {verifyResult === 'fail' && (
        <div className="flex items-center gap-1.5 text-xs text-error-700 font-semibold">
          <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
          {t('admin.loanDetail.consent.verifyResult.fail')}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={onViewText}
          className="text-xs text-brand-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
        >
          {t('admin.loanDetail.consent.viewText', { version })}
        </button>
        <span className="text-[var(--border-default)]" aria-hidden="true">·</span>
        <button
          type="button"
          onClick={onVerifyHmac}
          disabled={verifying}
          aria-describedby={`verify-hint-${consentType}`}
          className={cn(
            'text-xs text-brand-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded',
            verifying && 'opacity-50 cursor-wait'
          )}
        >
          {verifying
            ? t('admin.loanDetail.consent.verifying')
            : t('admin.loanDetail.consent.verifyHmac')}
        </button>
        <span
          id={`verify-hint-${consentType}`}
          className="sr-only"
        >
          {t('admin.loanDetail.consent.verifyHint')}
        </span>
      </div>
    </div>
  )
}
