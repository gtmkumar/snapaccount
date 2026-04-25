import { useId } from 'react'
import { cn } from '@/lib/utils'

type ToggleSize = 'sm' | 'md' | 'lg'

interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
  description?: string
  size?: ToggleSize
  disabled?: boolean
  loading?: boolean
  id?: string
}

const sizeConfig: Record<ToggleSize, { track: string; thumb: string; thumbTranslate: string }> = {
  sm: {
    track: 'h-[18px] w-8',
    thumb: 'h-3.5 w-3.5',
    thumbTranslate: 'translate-x-4',
  },
  md: {
    track: 'h-6 w-11',
    thumb: 'h-5 w-5',
    thumbTranslate: 'translate-x-5',
  },
  lg: {
    track: 'h-[30px] w-[52px]',
    thumb: 'h-6 w-6',
    thumbTranslate: 'translate-x-6',
  },
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  size = 'md',
  disabled = false,
  loading = false,
  id: providedId,
}: ToggleProps) {
  const generatedId = useId()
  const id = providedId ?? generatedId
  const config = sizeConfig[size]

  return (
    <label
      htmlFor={id}
      className={cn(
        'flex items-start gap-3',
        (disabled || loading) ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
      )}
    >
      {/* Track */}
      <div className="relative shrink-0 mt-0.5">
        <input
          type="checkbox"
          id={id}
          checked={checked}
          disabled={disabled || loading}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only"
          role="switch"
          aria-checked={checked}
        />
        <div
          className={cn(
            'rounded-full transition-colors duration-200',
            config.track,
            checked ? 'bg-brand-500' : 'bg-neutral-300',
            disabled && (checked ? 'bg-brand-300' : 'bg-neutral-200')
          )}
        />
        {/* Thumb */}
        <div
          className={cn(
            'absolute top-0.5 left-0.5 rounded-full bg-white shadow-sm transition-transform duration-200',
            config.thumb,
            checked ? config.thumbTranslate : 'translate-x-0'
          )}
        >
          {loading && (
            <svg
              className="animate-spin h-full w-full text-brand-500"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
        </div>
      </div>

      {/* Label */}
      {(label ?? description) && (
        <div className="flex flex-col">
          {label && (
            <span className="text-sm font-medium text-neutral-700">{label}</span>
          )}
          {description && (
            <span className="text-xs text-neutral-500 mt-0.5">{description}</span>
          )}
        </div>
      )}
    </label>
  )
}
