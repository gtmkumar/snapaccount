/**
 * PdfViewerWebPackagePane — Phase 6C
 * Extends the existing PdfViewer concept with:
 *  - Watermark integrity badge (Watermark intact / Integrity failed)
 *  - DisclaimerCard with canonical loan disclaimer text
 *  - Used in LoanDetailPage > Documents tab
 *
 * Note: This component uses an iframe embed for PDF rendering in web.
 * For full PDF.js integration the project can swap the iframe for a canvas
 * renderer in a future phase.
 */
import { useState } from 'react'
import { ShieldCheck, ShieldAlert, Download, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import { Button } from './Button'

interface WatermarkBadgeProps {
  status: 'intact' | 'failed' | 'unknown' | 'checking'
}

function WatermarkBadge({ status }: WatermarkBadgeProps) {
  if (status === 'checking') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-[var(--text-tertiary)]">
        <span className="h-3 w-3 animate-spin rounded-full border border-neutral-400 border-t-transparent" aria-hidden="true" />
        {t('admin.pdfViewer.checking')}
      </span>
    )
  }
  if (status === 'intact') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-success-700">
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
        {t('admin.pdfViewer.watermarkIntact')}
      </span>
    )
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-error-700 font-semibold">
        <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
        {t('admin.pdfViewer.integrityFailed')}
      </span>
    )
  }
  return null
}

interface DisclaimerCardProps {
  compact?: boolean
}

export function DisclaimerCard({ compact = false }: DisclaimerCardProps) {
  return (
    <div
      className={cn(
        'rounded-lg border border-[var(--semantic-warning-fg)]/20 bg-[var(--semantic-warning-bg)]',
        compact ? 'px-3 py-2' : 'px-4 py-3'
      )}
      role="note"
      aria-label={t('admin.disclaimer.ariaLabel')}
    >
      <p className={cn('text-[var(--semantic-warning-fg)]', compact ? 'text-xs' : 'text-sm')}>
        {t('admin.disclaimer.loanPackage')}
      </p>
    </div>
  )
}

interface PdfViewerWebPackagePaneProps {
  pdfUrl: string | null | undefined
  watermarkStatus?: 'intact' | 'failed' | 'unknown' | 'checking'
  sha256Hash?: string | null
  pageCount?: number | null
  generatedAt?: string | null
  downloadFileName?: string
  className?: string
}

export function PdfViewerWebPackagePane({
  pdfUrl,
  watermarkStatus = 'unknown',
  sha256Hash,
  pageCount,
  generatedAt,
  downloadFileName = 'loan-package.pdf',
  className,
}: PdfViewerWebPackagePaneProps) {
  const [expanded, setExpanded] = useState(false)

  const formattedDate = generatedAt
    ? new Date(generatedAt).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

  return (
    <div className={cn('space-y-3', className)}>
      {/* DisclaimerCard — required per design spec */}
      <DisclaimerCard />

      {/* Meta strip */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4 text-xs text-[var(--text-tertiary)]">
          {pageCount != null && (
            <span>
              <span className="font-medium text-[var(--text-primary)]">{pageCount}</span>{' '}
              {t('admin.pdfViewer.pages')}
            </span>
          )}
          {formattedDate && (
            <span>
              {t('admin.pdfViewer.generated')} {formattedDate}
            </span>
          )}
          {sha256Hash && (
            <span
              className="font-mono text-[var(--text-disabled)]"
              title={sha256Hash}
              aria-label={`SHA-256: ${sha256Hash.slice(0, 8)}…`}
            >
              SHA-256: {sha256Hash.slice(0, 8)}…
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <WatermarkBadge status={watermarkStatus} />
          {pdfUrl && (
            <div className="flex items-center gap-1">
              <a
                href={pdfUrl}
                download={downloadFileName}
                className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline"
                aria-label={t('admin.pdfViewer.download')}
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                {t('admin.pdfViewer.download')}
              </a>
              <a
                href={pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline"
                aria-label={t('admin.pdfViewer.openInNewTab')}
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                {t('admin.pdfViewer.openInNewTab')}
              </a>
            </div>
          )}
        </div>
      </div>

      {/* PDF preview */}
      {pdfUrl ? (
        <div className="rounded-lg border border-[var(--border-default)] overflow-hidden bg-[var(--surface-raised)]">
          <Button
            variant="ghost"
            size="sm"
            className="w-full rounded-none border-b border-[var(--border-subtle)] text-xs justify-start px-3"
            onClick={() => setExpanded(v => !v)}
            aria-expanded={expanded}
          >
            {expanded
              ? t('admin.pdfViewer.collapse')
              : t('admin.pdfViewer.expand')}
          </Button>
          {expanded && (
            <iframe
              src={pdfUrl}
              title={t('admin.pdfViewer.iframeTitle')}
              className="w-full h-96 border-0"
              aria-label={t('admin.pdfViewer.iframeTitle')}
            />
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-sunken)] p-8 text-center text-sm text-[var(--text-tertiary)]">
          {t('admin.pdfViewer.noPackage')}
        </div>
      )}
    </div>
  )
}
