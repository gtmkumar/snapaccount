/**
 * TemplateBodyEditor — rich body textarea for notification templates (GAP-037, Wave 7)
 * Includes VariablePalette, CharCounter, inline unknown-variable detection,
 * and channel-aware constraints (DLT segment count for SMS, length caps).
 */
import { useRef, useCallback } from 'react'
import { t } from '@/i18n'
import { cn } from '@/lib/utils'
import { VariablePalette } from './VariablePalette'
import { CharCounter } from './CharCounter'
import type { TemplateChannel, TemplateVariable } from '@/lib/notificationTemplateApi'

// Channel body length caps (informational; no hard enforcement beyond DLT segments)
const BODY_MAX: Record<TemplateChannel, number | null> = {
  Sms: null,      // DLT segments, no hard JS cap
  Push: 240,      // push body
  Email: null,    // unlimited (HTML allowed)
  InApp: 500,
}

const SUBJECT_MAX: Record<TemplateChannel, number | null> = {
  Sms: null,
  Push: 65,
  Email: 255,
  InApp: null,
}

interface TemplateBodyEditorProps {
  channel: TemplateChannel
  variables: TemplateVariable[]
  subject: string
  body: string
  dltTemplateId?: string
  onSubjectChange?: (v: string) => void
  onBodyChange: (v: string) => void
  onDltTemplateIdChange?: (v: string) => void
  readOnly?: boolean
  className?: string
}

/** Extract all {{variable}} tokens from a template body string */
function extractTokens(body: string): string[] {
  const re = /\{\{([^}]+)\}\}/g
  const tokens: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) {
    tokens.push(m[1])
  }
  return tokens
}

export function TemplateBodyEditor({
  channel,
  variables,
  subject,
  body,
  dltTemplateId = '',
  onSubjectChange,
  onBodyChange,
  onDltTemplateIdChange,
  readOnly = false,
  className,
}: TemplateBodyEditorProps) {
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  const inputClass = cn(
    'w-full rounded-lg border px-3 py-2 text-sm outline-none',
    'border-neutral-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20',
    'disabled:opacity-60 disabled:cursor-not-allowed resize-none',
    'bg-white text-neutral-900 placeholder:text-neutral-400'
  )

  // Detect unknown variables inline
  const tokens = extractTokens(body)
  const unknownTokens = tokens.filter(tk => !variables.some(v => v.key === tk))

  const handleBodyChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onBodyChange(e.target.value)
  }, [onBodyChange])

  const showSubject = channel === 'Email' || channel === 'Push'
  const isSms = channel === 'Sms'

  return (
    <div className={cn('space-y-4', className)}>
      {/* Subject (email/push only) */}
      {showSubject && (
        <div>
          <label className="block text-xs font-medium text-neutral-600 mb-1">
            {t('ntpl.editor.subject')}
          </label>
          <div className="relative">
            <input
              type="text"
              value={subject}
              onChange={e => onSubjectChange?.(e.target.value)}
              disabled={readOnly}
              maxLength={SUBJECT_MAX[channel] ?? undefined}
              className={inputClass.replace('resize-none', '')}
              aria-label={t('ntpl.editor.subject')}
            />
            {SUBJECT_MAX[channel] != null && (
              <div className="text-right mt-0.5">
                <CharCounter value={subject} maxLength={SUBJECT_MAX[channel]!} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Variable palette */}
      <VariablePalette
        variables={variables}
        targetRef={bodyRef}
        onInsert={(newValue) => onBodyChange(newValue)}
      />

      {/* Body textarea */}
      <div>
        <label className="block text-xs font-medium text-neutral-600 mb-1">
          {t('ntpl.editor.body')}
        </label>
        <textarea
          ref={bodyRef}
          value={body}
          onChange={handleBodyChange}
          disabled={readOnly}
          rows={isSms ? 4 : 8}
          placeholder={isSms ? undefined : undefined}
          className={inputClass}
          aria-label={t('ntpl.editor.body')}
          aria-describedby={unknownTokens.length > 0 ? 'unknown-vars-warning' : undefined}
        />
        <div className="flex items-center justify-between mt-0.5">
          {/* Unknown variable warning */}
          {unknownTokens.length > 0 ? (
            <p
              id="unknown-vars-warning"
              className="text-xs text-error-600"
              role="alert"
              aria-live="polite"
            >
              {t('ntpl.editor.unknownVar')}: {unknownTokens.map(tk => `{{${tk}}}`).join(', ')}
            </p>
          ) : (
            <span />
          )}
          {/* Char/segment counter */}
          {isSms ? (
            <CharCounter value={body} smsMode />
          ) : BODY_MAX[channel] != null ? (
            <CharCounter value={body} maxLength={BODY_MAX[channel]!} />
          ) : null}
        </div>
      </div>

      {/* DLT Template ID (SMS only) */}
      {isSms && (
        <div>
          <label className="block text-xs font-medium text-neutral-600 mb-1">
            {t('ntpl.editor.sms.dltId')}
            <span className="ml-1 text-neutral-400 font-normal">
              (TRAI DLT — [confirm 7B])
            </span>
          </label>
          <input
            type="text"
            value={dltTemplateId}
            onChange={e => onDltTemplateIdChange?.(e.target.value)}
            disabled={readOnly}
            placeholder="1234567890123"
            className={cn(inputClass.replace('resize-none', ''), 'font-mono')}
            aria-label={t('ntpl.editor.sms.dltId')}
          />
        </div>
      )}
    </div>
  )
}
