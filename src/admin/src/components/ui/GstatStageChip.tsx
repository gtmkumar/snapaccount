/**
 * GstatStageChip — compact GSTAT appeal stage indicator (GAP-108, Wave 7)
 * Reuses StatusTimeline for the full ladder in detail view.
 * [confirm 7B] stage enum values.
 */
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import { StatusTimeline } from './StatusTimeline'

export type GstatStage =
  | 'ORIGINAL_ORDER'
  | 'APPEAL_FILED'
  | 'APPELLATE_ORDER'
  | 'GSTAT_FILED'
  | 'GSTAT_HEARING'
  | 'GSTAT_ORDER'
  | 'CLOSED'

const GSTAT_STAGES: GstatStage[] = [
  'ORIGINAL_ORDER',
  'APPEAL_FILED',
  'APPELLATE_ORDER',
  'GSTAT_FILED',
  'GSTAT_HEARING',
  'GSTAT_ORDER',
  'CLOSED',
]

const STAGE_LABEL_KEYS: Record<GstatStage, string> = {
  ORIGINAL_ORDER:   'gst.notice.gstat.stage.originalOrder',
  APPEAL_FILED:     'gst.notice.gstat.stage.appealFiled',
  APPELLATE_ORDER:  'gst.notice.gstat.stage.appellateOrder',
  GSTAT_FILED:      'gst.notice.gstat.stage.gstatFiled',
  GSTAT_HEARING:    'gst.notice.gstat.stage.gstatHearing',
  GSTAT_ORDER:      'gst.notice.gstat.stage.gstatOrder',
  CLOSED:           'gst.notice.gstat.stage.closed',
}

// ---------------------------------------------------------------------------
// Compact chip — for list rows
// ---------------------------------------------------------------------------

interface GstatStageChipProps {
  currentStage: GstatStage | string
  className?: string
}

export function GstatStageChip({ currentStage, className }: GstatStageChipProps) {
  const idx = GSTAT_STAGES.indexOf(currentStage as GstatStage)
  const current = idx >= 0 ? idx + 1 : null
  const total = GSTAT_STAGES.length
  const stageLabel = STAGE_LABEL_KEYS[currentStage as GstatStage]
    ? t(STAGE_LABEL_KEYS[currentStage as GstatStage])
    : currentStage

  const ariaLabel = current != null
    ? t('gst.notice.gstat.stage', { current, total, label: stageLabel })
    : stageLabel

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs font-medium rounded px-2 py-0.5',
        'bg-[var(--chip-violet-bg)] text-[var(--chip-violet-fg)] border border-[var(--chip-violet-border)] whitespace-nowrap',
        className
      )}
      aria-label={ariaLabel}
      title={ariaLabel}
    >
      {current != null && (
        <span className="text-[var(--chip-violet-fg)] opacity-80 font-mono" aria-hidden="true">
          {current}/{total}
        </span>
      )}
      <span>{stageLabel}</span>
    </span>
  )
}

// ---------------------------------------------------------------------------
// Full ladder — for detail view (reuses StatusTimeline horizontal)
// ---------------------------------------------------------------------------

interface GstatStageLadderProps {
  currentStage: GstatStage | string
  stageTimestamps?: Partial<Record<GstatStage, string>>
  className?: string
}

export function GstatStageLadder({ currentStage, stageTimestamps = {}, className }: GstatStageLadderProps) {
  const currentIdx = GSTAT_STAGES.indexOf(currentStage as GstatStage)

  const steps = GSTAT_STAGES.map((stage, idx) => {
    let status: 'completed' | 'active' | 'pending'
    if (idx < currentIdx) status = 'completed'
    else if (idx === currentIdx) status = 'active'
    else status = 'pending'

    return {
      id: stage,
      label: t(STAGE_LABEL_KEYS[stage]),
      status,
      timestamp: stageTimestamps[stage] ?? null,
    }
  })

  return (
    <div className={cn('overflow-x-auto', className)}>
      <StatusTimeline steps={steps} orientation="horizontal" />
    </div>
  )
}
