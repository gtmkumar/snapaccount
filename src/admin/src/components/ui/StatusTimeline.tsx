import { cn } from '@/lib/utils'
import { formatDateTime } from '@/lib/utils'

type StepStatus = 'completed' | 'active' | 'pending' | 'error'

interface TimelineStep {
  id: string
  label: string
  status: StepStatus
  timestamp?: string | Date | null
  description?: string
}

interface StatusTimelineProps {
  steps: TimelineStep[]
  orientation?: 'horizontal' | 'vertical'
  className?: string
}

const stepStyles: Record<StepStatus, { circle: string; connector: string; text: string }> = {
  completed: {
    circle: 'bg-success-600 border-success-600 text-white',
    connector: 'bg-success-600',
    text: 'text-[var(--text-primary)]',
  },
  active: {
    circle: 'bg-brand-500 border-brand-500 text-white pulse-brand',
    connector: 'bg-[var(--border-default)]',
    text: 'text-brand-500 font-semibold',
  },
  pending: {
    circle: 'bg-[var(--surface-raised)] border-[var(--border-default)] text-[var(--text-disabled)]',
    connector: 'bg-[var(--border-default)]',
    text: 'text-[var(--text-disabled)]',
  },
  error: {
    circle: 'bg-error-600 border-error-600 text-white',
    connector: 'bg-[var(--border-default)]',
    text: 'text-error-600',
  },
}

function CheckIcon() {
  return (
    <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  )
}

function XIcon() {
  return (
    <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
    </svg>
  )
}

export function StatusTimeline({ steps, orientation = 'horizontal', className }: StatusTimelineProps) {
  if (orientation === 'vertical') {
    return (
      <ol className={cn('space-y-0', className)} aria-label="Status timeline">
        {steps.map((step, index) => {
          const styles = stepStyles[step.status]
          const isLast = index === steps.length - 1

          return (
            <li key={step.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    'h-6 w-6 rounded-full border-2 flex items-center justify-center text-xs shrink-0',
                    styles.circle
                  )}
                  aria-label={`${step.label}: ${step.status}`}
                >
                  {step.status === 'completed' && <CheckIcon />}
                  {step.status === 'error' && <XIcon />}
                  {step.status === 'active' && <span className="h-2 w-2 rounded-full bg-[var(--text-inverse)]" />}
                </div>
                {!isLast && (
                  <div className={cn('w-0.5 flex-1 my-1 min-h-[24px]', styles.connector)} />
                )}
              </div>
              <div className="pb-6">
                <p className={cn('text-sm font-medium', styles.text)}>{step.label}</p>
                {step.timestamp && (
                  <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                    {formatDateTime(step.timestamp)}
                  </p>
                )}
                {step.description && (
                  <p className="text-xs text-[var(--text-tertiary)] mt-1">{step.description}</p>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    )
  }

  return (
    <ol className={cn('flex items-start', className)} aria-label="Status timeline">
      {steps.map((step, index) => {
        const styles = stepStyles[step.status]
        const isLast = index === steps.length - 1

        return (
          <li key={step.id} className="flex-1 flex flex-col items-center">
            <div className="flex items-center w-full">
              <div className={cn('w-full h-0.5', index === 0 ? 'opacity-0' : '', stepStyles[steps[index - 1]?.status ?? 'pending'].connector)} />
              <div
                className={cn(
                  'h-7 w-7 rounded-full border-2 flex items-center justify-center text-xs shrink-0',
                  styles.circle
                )}
                aria-label={`${step.label}: ${step.status}`}
              >
                {step.status === 'completed' && <CheckIcon />}
                {step.status === 'error' && <XIcon />}
                {step.status === 'active' && <span className="h-2 w-2 rounded-full bg-[var(--text-inverse)]" />}
                {step.status === 'pending' && <span className="h-2 w-2 rounded-full bg-[var(--border-strong)]" />}
              </div>
              <div className={cn('w-full h-0.5', isLast ? 'opacity-0' : '', styles.connector)} />
            </div>
            <div className="mt-2 text-center">
              <p className={cn('text-xs font-medium', styles.text)}>{step.label}</p>
              {step.timestamp && (
                <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                  {formatDateTime(step.timestamp)}
                </p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
