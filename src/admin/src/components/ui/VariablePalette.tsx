/**
 * VariablePalette — clickable chips of valid {{variable}} tokens for a template event (GAP-037, Wave 7)
 * Clicking a chip inserts the variable at the current cursor position of the target textarea.
 * [confirm 7B] variable manifest per event.
 */
import { t } from '@/i18n'
import { cn } from '@/lib/utils'
import type { TemplateVariable } from '@/lib/notificationTemplateApi'

interface VariablePaletteProps {
  variables: TemplateVariable[]
  targetRef: React.RefObject<HTMLTextAreaElement | null>
  onInsert?: (newValue: string) => void
  className?: string
}

export function VariablePalette({ variables, targetRef, onInsert, className }: VariablePaletteProps) {
  function handleInsert(variable: TemplateVariable) {
    const textarea = targetRef.current
    if (!textarea) {
      onInsert?.(`{{${variable.key}}}`)
      return
    }

    const start = textarea.selectionStart ?? textarea.value.length
    const end = textarea.selectionEnd ?? textarea.value.length
    const token = `{{${variable.key}}}`
    const newValue = textarea.value.slice(0, start) + token + textarea.value.slice(end)

    // Update the native value for React-controlled inputs via the native setter
    const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
    nativeSetter?.call(textarea, newValue)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))

    // Restore cursor position
    const newPos = start + token.length
    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(newPos, newPos)
    }, 0)

    onInsert?.(newValue)
  }

  if (variables.length === 0) return null

  return (
    <div className={cn('space-y-1', className)}>
      <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
        {t('ntpl.editor.variables')}
      </p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('ntpl.editor.variables')}>
        {variables.map(v => (
          <button
            key={v.key}
            type="button"
            onClick={() => handleInsert(v)}
            className={cn(
              'inline-flex items-center text-xs rounded px-2 py-0.5 font-mono',
              'bg-brand-50 text-brand-700 border border-brand-200',
              'hover:bg-brand-100 hover:border-brand-300',
              'focus:outline-none focus:ring-2 focus:ring-brand-500/30',
              'transition-colors'
            )}
            aria-label={`${t('ntpl.variable.insert', { key: v.key })} — ${v.description}`}
            title={`${v.description} (sample: ${v.sampleValue})`}
          >
            {`{{${v.key}}}`}
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Unknown variable highlighter — returns true if token is NOT in the manifest
// ---------------------------------------------------------------------------

export function isUnknownVariable(token: string, variables: TemplateVariable[]): boolean {
  // token is expected as "variableName" (without braces)
  return !variables.some(v => v.key === token)
}
