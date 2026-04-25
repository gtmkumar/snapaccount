/**
 * PayloadViewer — Phase 6C
 * JSON tree viewer with raw toggle for REST adapter payloads;
 * sanitized HTML viewer for email bodies.
 * Tokens/secrets are redacted via redactPaths.
 *
 * Security: iframe sandbox prevents script execution in email body.
 * OAuth tokens are never displayed in full — only Bearer ***{last6} + scopes/expiry shown.
 *
 * SEC-045 FIXED: oauth-token kind no longer renders raw bearer token.
 * The access_token, refresh_token, id_token, and client_secret values
 * are permanently stripped before any rendering occurs.
 */
import { useState } from 'react'
import { Code, AlignLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'

type PayloadKind = 'json' | 'email' | 'oauth-token'

interface PayloadViewerProps {
  kind: PayloadKind
  payload: string | null | undefined
  redactPaths?: string[]
  className?: string
}

function redactJson(obj: unknown, paths: string[], currentPath = ''): unknown {
  if (obj === null || obj === undefined) return obj
  if (typeof obj !== 'object') return obj
  if (Array.isArray(obj)) {
    return obj.map((item, i) => redactJson(item, paths, `${currentPath}[${i}]`))
  }
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const fullPath = currentPath ? `${currentPath}.${key}` : key
    const shouldRedact = paths.some(p => p === key || p === fullPath || key.toLowerCase().includes('token') || key.toLowerCase().includes('secret') || key.toLowerCase().includes('password') || key.toLowerCase().includes('apikey'))
    if (shouldRedact) {
      result[key] = typeof value === 'string' ? `***${(value as string).slice(-4)}` : '***REDACTED***'
    } else {
      result[key] = redactJson(value, paths, fullPath)
    }
  }
  return result
}

function JsonTree({ data, depth = 0 }: { data: unknown; depth?: number }) {
  if (data === null) return <span className="text-neutral-400">null</span>
  if (typeof data === 'boolean') return <span className="text-amber-600">{String(data)}</span>
  if (typeof data === 'number') return <span className="text-blue-600">{data}</span>
  if (typeof data === 'string') return <span className="text-green-700">"{data}"</span>
  if (Array.isArray(data)) {
    if (data.length === 0) return <span className="text-neutral-400">[]</span>
    return (
      <span>
        {'['}
        <div className={`pl-${Math.min(depth * 2 + 2, 8)} border-l border-neutral-100`}>
          {data.map((item, i) => (
            <div key={i}>
              <JsonTree data={item} depth={depth + 1} />
              {i < data.length - 1 && <span className="text-neutral-400">,</span>}
            </div>
          ))}
        </div>
        {']'}
      </span>
    )
  }
  if (typeof data === 'object') {
    const entries = Object.entries(data as Record<string, unknown>)
    if (entries.length === 0) return <span className="text-neutral-400">{'{}'}</span>
    return (
      <span>
        {'{'}
        <div className="pl-4 border-l border-neutral-100">
          {entries.map(([key, value], i) => (
            <div key={key}>
              <span className="text-purple-700">"{key}"</span>
              <span className="text-neutral-500">: </span>
              <JsonTree data={value} depth={depth + 1} />
              {i < entries.length - 1 && <span className="text-neutral-400">,</span>}
            </div>
          ))}
        </div>
        {'}'}
      </span>
    )
  }
  return <span>{String(data)}</span>
}

export function PayloadViewer({ kind, payload, redactPaths = [], className }: PayloadViewerProps) {
  const [showRaw, setShowRaw] = useState(false)

  if (!payload) {
    return (
      <div className={cn('rounded-lg bg-neutral-50 border border-neutral-200 p-4 text-xs text-neutral-400 italic', className)}>
        {t('admin.payloadViewer.empty')}
      </div>
    )
  }

  if (kind === 'email') {
    return (
      <div className={cn('rounded-lg border border-neutral-200 overflow-hidden', className)}>
        <div className="flex items-center justify-between px-3 py-2 bg-neutral-50 border-b border-neutral-200">
          <span className="text-xs font-medium text-neutral-600">{t('admin.payloadViewer.emailBody')}</span>
          <button
            type="button"
            onClick={() => setShowRaw(v => !v)}
            className="text-xs text-brand-600 hover:underline"
          >
            {showRaw ? t('admin.payloadViewer.rendered') : t('admin.bankComms.detail.viewSource')}
          </button>
        </div>
        {showRaw ? (
          <pre className="p-3 text-xs font-mono text-neutral-700 overflow-auto max-h-64 whitespace-pre-wrap">
            {payload}
          </pre>
        ) : (
          <iframe
            srcDoc={`<!DOCTYPE html><html><body style="font-family:sans-serif;font-size:13px;padding:12px">${payload}</body></html>`}
            sandbox=""
            title={t('admin.payloadViewer.emailBodyTitle')}
            className="w-full h-48 border-0"
            aria-label={t('admin.payloadViewer.emailBodyTitle')}
          />
        )}
      </div>
    )
  }

  if (kind === 'oauth-token') {
    // SEC-045: Never render raw token. Extract only safe display fields.
    // access_token, refresh_token, id_token, client_secret are permanently stripped.
    const REDACTED_OAUTH_FIELDS = new Set([
      'access_token', 'refresh_token', 'id_token', 'client_secret',
    ])

    let tokenLast6 = '??????'
    let safeFields: Record<string, unknown> = {}

    try {
      const parsed = JSON.parse(payload) as Record<string, unknown>
      // Extract last 6 chars of the bearer token for display hint
      if (typeof parsed.access_token === 'string' && parsed.access_token.length >= 6) {
        tokenLast6 = parsed.access_token.slice(-6)
      }
      // Keep only non-sensitive fields
      for (const [key, value] of Object.entries(parsed)) {
        if (!REDACTED_OAUTH_FIELDS.has(key)) {
          safeFields[key] = value
        }
      }
    } catch {
      // payload is not JSON (raw token string) — mask it entirely
      if (typeof payload === 'string' && payload.length >= 6) {
        tokenLast6 = payload.slice(-6)
      }
      safeFields = {}
    }

    const hasSafeFields = Object.keys(safeFields).length > 0

    return (
      <div className={cn('rounded-lg bg-neutral-50 border border-neutral-200 p-4 text-xs text-neutral-600', className)}>
        <p className="font-medium text-neutral-700 mb-2">{t('admin.payloadViewer.oauthToken')}</p>
        <p className="text-neutral-400 italic mb-3">{t('admin.payloadViewer.oauthMasked')}</p>
        <div className="font-mono bg-white border border-neutral-200 rounded px-3 py-2 text-xs text-neutral-700 mb-3">
          <span className="text-neutral-400 select-none">{t('admin.payloadViewer.oauthBearerLabel')}: </span>
          <span data-testid="oauth-masked-token">Bearer ***{tokenLast6}</span>
        </div>
        {hasSafeFields && (
          <div className="mt-1">
            <p className="text-neutral-500 font-medium mb-1">{t('admin.payloadViewer.oauthSafeFields')}</p>
            <div className="font-mono text-xs" role="tree" aria-label={t('admin.payloadViewer.oauthSafeFields')}>
              <JsonTree data={safeFields} />
            </div>
          </div>
        )}
      </div>
    )
  }

  // JSON kind
  let parsed: unknown = null
  let parseError = false
  try {
    parsed = JSON.parse(payload)
    // Always pass through redactJson — it auto-redacts token/secret/password fields
    parsed = redactJson(parsed, redactPaths)
  } catch {
    parseError = true
  }

  return (
    <div className={cn('rounded-lg border border-neutral-200 overflow-hidden', className)}>
      <div className="flex items-center justify-between px-3 py-2 bg-neutral-50 border-b border-neutral-200">
        <span className="text-xs font-medium text-neutral-600">{t('admin.payloadViewer.jsonPayload')}</span>
        <button
          type="button"
          onClick={() => setShowRaw(v => !v)}
          className="flex items-center gap-1 text-xs text-brand-600 hover:underline"
        >
          {showRaw ? (
            <><Code className="h-3 w-3" aria-hidden="true" />{t('admin.payloadViewer.treeView')}</>
          ) : (
            <><AlignLeft className="h-3 w-3" aria-hidden="true" />{t('admin.payloadViewer.rawView')}</>
          )}
        </button>
      </div>
      <div className="p-3 overflow-auto max-h-64">
        {parseError ? (
          <pre className="text-xs font-mono text-neutral-700 whitespace-pre-wrap">{payload}</pre>
        ) : showRaw ? (
          <pre className="text-xs font-mono text-neutral-700 whitespace-pre-wrap">
            {JSON.stringify(parsed, null, 2)}
          </pre>
        ) : (
          <div className="text-xs font-mono" role="tree" aria-label={t('admin.payloadViewer.jsonTree')}>
            <JsonTree data={parsed} />
          </div>
        )}
      </div>
    </div>
  )
}
