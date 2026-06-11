/**
 * SimulatorEntryBanner — DRC-01B/01C pre-filing simulator entry (GAP-108, Wave 7)
 * Displayed on the GST reconciliation / ITC-mismatch page.
 * The simulator backend is not yet built; this banner provides the entry point only.
 * [confirm 7B] simulator endpoint when available.
 */
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import { Button } from './Button'
import { GitCompare } from 'lucide-react'

interface SimulatorEntryBannerProps {
  /** If a specific period is known (from a DRC-01B/01C notice detail), scope the run */
  periodContext?: { gstin?: string; period?: string }
  /** Handler when "Run pre-filing check" CTA is clicked */
  onRun?: (context?: { gstin?: string; period?: string }) => void
  /** If false (feature probe negative), hide the banner entirely */
  enabled?: boolean
  className?: string
}

export function SimulatorEntryBanner({
  periodContext,
  onRun,
  enabled = true,
  className,
}: SimulatorEntryBannerProps) {
  if (!enabled) return null

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-xl px-4 py-3.5',
        'bg-violet-50 border border-violet-200',
        className
      )}
      role="complementary"
      aria-label={t('gst.recon.simulator.banner')}
    >
      <GitCompare
        className="h-5 w-5 shrink-0 mt-0.5 text-violet-600"
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-violet-900">
          {t('gst.recon.simulator.banner')}
        </p>
        {periodContext?.period && (
          <p className="text-xs text-violet-700 mt-0.5">
            {periodContext.gstin && (
              <span className="font-mono mr-1">{periodContext.gstin}</span>
            )}
            {periodContext.period}
          </p>
        )}
      </div>
      <Button
        variant="primary"
        size="sm"
        className="shrink-0 bg-violet-600 hover:bg-violet-700 focus:ring-violet-500/20"
        onClick={() => onRun?.(periodContext)}
      >
        {t('gst.recon.simulator.cta')}
      </Button>
    </div>
  )
}
