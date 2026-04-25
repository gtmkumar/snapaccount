import { forwardRef, type InputHTMLAttributes, type ReactNode, useId } from 'react'
import { cn } from '@/lib/utils'

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'> {
  label?: string
  hint?: string
  error?: string
  size?: 'sm' | 'md' | 'lg'
  prefix?: ReactNode
  suffix?: ReactNode
  fullWidth?: boolean
}

const sizeClasses = {
  sm: 'h-9 text-sm px-3',
  md: 'h-11 text-base px-3',
  lg: 'h-13 text-lg px-4',
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      hint,
      error,
      size = 'md',
      prefix,
      suffix,
      required,
      fullWidth = true,
      className,
      id: providedId,
      ...props
    },
    ref
  ) => {
    const generatedId = useId()
    const id = providedId ?? generatedId
    const hintId = `${id}-hint`
    const errorId = `${id}-error`

    return (
      <div className={cn('flex flex-col gap-1.5', fullWidth && 'w-full')}>
        {label && (
          <label
            htmlFor={id}
            className="text-sm font-medium text-neutral-700"
          >
            {label}
            {required && (
              <span className="text-error-600 ml-0.5" aria-hidden="true">*</span>
            )}
          </label>
        )}

        <div className="relative flex items-center">
          {prefix && (
            <div className="absolute left-3 flex items-center text-neutral-400 pointer-events-none">
              {prefix}
            </div>
          )}

          <input
            ref={ref}
            id={id}
            required={required}
            aria-required={required}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={
              error ? errorId : hint ? hintId : undefined
            }
            className={cn(
              'w-full rounded-lg border-0 bg-neutral-50 text-neutral-900 transition-all duration-200 outline-none',
              'placeholder:text-neutral-400',
              'focus:bg-white focus:ring-2 focus:ring-brand-500/20',
              'disabled:bg-neutral-100 disabled:text-neutral-400 disabled:cursor-not-allowed',
              error
                ? 'ring-2 ring-error-600/30 bg-error-50 focus:ring-error-600/30'
                : 'ring-0',
              sizeClasses[size],
              prefix && 'pl-10',
              suffix && 'pr-10',
              className
            )}
            {...props}
          />

          {suffix && (
            <div className="absolute right-3 flex items-center text-neutral-400">
              {suffix}
            </div>
          )}
        </div>

        {error && (
          <p id={errorId} className="text-xs text-error-600 flex items-center gap-1" role="alert">
            <svg className="h-3.5 w-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            {error}
          </p>
        )}

        {hint && !error && (
          <p id={hintId} className="text-xs text-neutral-500">
            {hint}
          </p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'
