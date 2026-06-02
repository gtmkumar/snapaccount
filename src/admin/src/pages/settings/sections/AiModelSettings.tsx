/**
 * AiModelSettings — Phase 6F
 * Wired to GET/PATCH /auth/config/ai.
 * Replaces local-state-only version.
 */
import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, Brain, Zap, Clock } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Toggle } from '@/components/ui/Toggle'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { MetricCard } from '@/components/shared/MetricCard'
import { Skeleton } from '@/components/ui/Skeleton'
import { getAiConfig, updateAiConfig, getAiUsage, testAiConnection } from '@/lib/settingsApi'
import { toast } from 'sonner'

// Provider ids match the backend (auth.ai_configuration.ocr_provider). `needsKey` controls
// whether an API-key field is shown; tesseract/document_ai use no admin-entered key.
const AI_PROVIDERS = [
  { id: 'tesseract', label: 'Tesseract (local, free)', badge: 'Default', needsKey: false },
  { id: 'gemini', label: 'Google Gemini', badge: 'Recommended', needsKey: true },
  { id: 'openai', label: 'OpenAI (GPT)', badge: '', needsKey: true },
  { id: 'anthropic', label: 'Anthropic Claude', badge: '', needsKey: true },
  { id: 'document_ai', label: 'Google Document AI', badge: 'GCP', needsKey: false },
]

// model id → hint, keyed by provider. Tiers (fast/efficient/advanced) map to these.
const MODELS_BY_PROVIDER: Record<string, { value: string; hint: string }[]> = {
  tesseract: [{ value: 'tesseract-ocr', hint: 'Local OCR engine' }],
  gemini: [
    { value: 'gemini-2.0-flash', hint: 'Fast — recommended' },
    { value: 'gemini-1.5-flash', hint: 'Fast, cost-efficient' },
    { value: 'gemini-1.5-pro', hint: 'Most capable, higher cost' },
  ],
  openai: [
    { value: 'gpt-4o-mini', hint: 'Fast, low cost' },
    { value: 'gpt-4o', hint: 'Advanced vision' },
  ],
  anthropic: [
    { value: 'claude-haiku-4-5', hint: 'Fast' },
    { value: 'claude-sonnet-4-6', hint: 'Advanced' },
  ],
  document_ai: [{ value: 'document-ai-ocr', hint: 'Google Document AI processor' }],
}

const SARVAM_LANGUAGES = [
  'Hindi', 'Bengali', 'Gujarati', 'Tamil', 'Telugu', 'Kannada', 'Marathi', 'Malayalam', 'Punjabi', 'Odia',
]

const FEATURE_MODELS = [
  'AI Chatbot (first response)',
  'Tax Regime Recommendation',
  'Cash Flow Forecasting',
  'Document Classification',
  'Smart ITR Checklist',
]

export function AiModelSettings() {
  const queryClient = useQueryClient()
  const [provider, setProvider] = useState('tesseract')
  const [modelId, setModelId] = useState('tesseract-ocr')
  const [ocrEnabled, setOcrEnabled] = useState(true)
  const [autoClassifyEnabled, setAutoClassifyEnabled] = useState(true)
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.75)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [enabledLanguages, setEnabledLanguages] = useState<string[]>(['Hindi', 'Bengali'])
  // Raw API keys typed by the admin (write-only; cleared after save). Keyed by provider id.
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({})
  const keyInputRef = useRef<HTMLInputElement>(null)

  // Move the cursor to the API-key field and bring it into view (e.g. when a "no key" error fires).
  const focusKeyField = () => {
    const el = keyInputRef.current
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.focus({ preventScroll: true })
  }

  const { data, isLoading } = useQuery({
    queryKey: ['ai-config'],
    queryFn: getAiConfig,
    staleTime: 60_000,
  })

  // Real usage metrics (current month) for the metric cards.
  const { data: usage } = useQuery({
    queryKey: ['ai-usage'],
    queryFn: getAiUsage,
    staleTime: 30_000,
  })

  useEffect(() => {
    if (data) {
      if (data.provider) setProvider(data.provider)
      if (data.modelId) setModelId(data.modelId)
      if (data.ocrEnabled !== undefined) setOcrEnabled(data.ocrEnabled)
      if (data.autoClassifyEnabled !== undefined) setAutoClassifyEnabled(data.autoClassifyEnabled)
      if (data.confidenceThreshold !== undefined) setConfidenceThreshold(data.confidenceThreshold)
    }
  }, [data])

  // Masked key status from the server, by provider.
  const keyStatus = (data?.providerKeys ?? []).reduce<Record<string, { configured: boolean; last4?: string | null }>>(
    (acc, k) => { acc[k.provider] = { configured: k.configured, last4: k.last4 }; return acc },
    {},
  )

  const models = MODELS_BY_PROVIDER[provider] ?? MODELS_BY_PROVIDER.gemini
  const selectedProvider = AI_PROVIDERS.find((p) => p.id === provider)

  const saveMutation = useMutation({
    mutationFn: () => {
      // Only send non-empty keys (empty = leave unchanged).
      const providerKeys = Object.fromEntries(
        Object.entries(keyInputs).filter(([, v]) => v.trim().length > 0),
      )
      return updateAiConfig({
        provider,
        modelId,
        ocrEnabled,
        autoClassifyEnabled,
        confidenceThreshold,
        ...(Object.keys(providerKeys).length > 0 ? { providerKeys } : {}),
      })
    },
    onSuccess: () => {
      toast.success('AI configuration saved')
      setKeyInputs({})
      void queryClient.invalidateQueries({ queryKey: ['ai-config'] })
    },
    onError: () => toast.error('Failed to save AI configuration'),
  })

  const testMutation = useMutation({
    mutationFn: () => testAiConnection(provider),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success(r.message)
      } else {
        toast.error(r.message)
        // Guide the user to the key field when the failure is a missing key.
        if (/no api key|key configured/i.test(r.message)) focusKeyField()
      }
    },
    onError: () => toast.error('Connection test failed'),
  })

  if (isLoading) return <Skeleton variant="card" />

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-[var(--text-primary)]">AI Model Configuration</h2>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Configure the AI provider, model, and parameters. Swappable without code deployments.
        </p>
      </div>

      {/* Provider selection */}
      <Card>
        <CardHeader title="AI Provider" />
        <div className="space-y-3">
          {AI_PROVIDERS.map((p) => {
            const status = keyStatus[p.id]
            return (
              <label
                key={p.id}
                className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-colors cursor-pointer ${
                  provider === p.id
                    ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)]/5'
                    : 'border-[var(--border-default)] hover:border-[var(--border-strong)]'
                }`}
              >
                <input
                  type="radio"
                  name="ai-provider"
                  value={p.id}
                  checked={provider === p.id}
                  onChange={() => {
                    setProvider(p.id)
                    // reset to the provider's first model
                    setModelId((MODELS_BY_PROVIDER[p.id] ?? [])[0]?.value ?? '')
                  }}
                  className="text-[var(--brand-primary)]"
                />
                <span className="text-sm font-medium text-[var(--text-primary)] flex-1">{p.label}</span>
                {p.needsKey && status?.configured && (
                  <Badge variant="success" size="sm">Key set ••••{status.last4}</Badge>
                )}
                {p.needsKey && !status?.configured && (
                  <Badge variant="warning" size="sm">Key needed</Badge>
                )}
                {p.badge && <Badge variant="neutral" size="sm">{p.badge}</Badge>}
              </label>
            )
          })}
          <p className="text-xs text-[var(--text-tertiary)] px-1 pt-1">
            Tesseract runs locally (free, no key). Gemini/OpenAI/Anthropic need an API key below.
            Changing provider affects OCR extraction and other AI features.
          </p>
        </div>
      </Card>

      {/* Model configuration */}
      <Card>
        <CardHeader title="Model Configuration" />
        <div className="space-y-5">
          <div>
            <label className="text-sm font-medium text-[var(--text-primary)] block mb-1.5">Model Name</label>
            <select
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              className="w-full h-11 rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)] text-base px-3 text-[var(--text-primary)] focus:border-[var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)]/20 outline-none"
              aria-label="Select model"
            >
              {models.map((m) => (
                <option key={m.value} value={m.value}>{m.value} — {m.hint}</option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-[var(--text-primary)]">
                Confidence Threshold: <span className="font-mono text-[var(--brand-primary)]">{confidenceThreshold.toFixed(2)}</span>
              </label>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={confidenceThreshold}
              onChange={(e) => setConfidenceThreshold(Number(e.target.value))}
              className="w-full h-2 rounded-full bg-[var(--surface-sunken)] accent-[var(--brand-primary)]"
              aria-label="Confidence threshold"
            />
            <div className="flex justify-between text-xs text-[var(--text-tertiary)] mt-1">
              <span>0.0 — Accept all</span>
              <span>1.0 — Very strict</span>
            </div>
          </div>
        </div>
      </Card>

      {/* API key (write-only) — only for providers that need one */}
      {selectedProvider?.needsKey && (
        <Card>
          <CardHeader
            title={`${selectedProvider.label} API Key`}
            subtitle="Stored encrypted (AES-256). The saved key is never shown again — enter a new value to replace it."
          />
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-[var(--text-secondary)]">Status:</span>
              {keyStatus[provider]?.configured ? (
                <Badge variant="success" size="sm">Configured ••••{keyStatus[provider]?.last4}</Badge>
              ) : (
                <Badge variant="warning" size="sm">Not configured</Badge>
              )}
            </div>
            <input
              ref={keyInputRef}
              type="password"
              value={keyInputs[provider] ?? ''}
              onChange={(e) => setKeyInputs((prev) => ({ ...prev, [provider]: e.target.value }))}
              placeholder={keyStatus[provider]?.configured ? 'Enter a new key to replace the existing one' : `Paste your ${selectedProvider.label} API key`}
              autoComplete="off"
              className="w-full h-11 rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)] text-base px-3 font-mono text-[var(--text-primary)] focus:border-[var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)]/20 outline-none"
              aria-label={`${selectedProvider.label} API key`}
            />
            <p className="text-xs text-[var(--text-tertiary)]">
              The key is sent over HTTPS, encrypted at rest, and used server-side only — it is never returned to the browser.
            </p>
          </div>
        </Card>
      )}

      {/* OCR + auto-classify */}
      <Card>
        <CardHeader title="Document AI Features" subtitle="Google Document AI (OCR) and auto-classification settings" />
        <div className="space-y-4">
          <Toggle
            checked={ocrEnabled}
            onChange={setOcrEnabled}
            label="Enable OCR (Google Document AI)"
            description="Automatically extract text and data from uploaded documents"
          />
          <Toggle
            checked={autoClassifyEnabled}
            onChange={setAutoClassifyEnabled}
            label="Enable Auto-Classification"
            description="Automatically classify documents by type (invoice, bank statement, etc.)"
          />
        </div>
      </Card>

      {/* Sarvam AI (display-only, languages managed via LanguageSettings) */}
      <Card>
        <CardHeader title="Sarvam AI — Indian Language Support" subtitle="Manage which languages use Sarvam AI for processing" />
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-[var(--text-primary)] block mb-2">Processing languages</label>
            <div className="flex flex-wrap gap-3">
              {SARVAM_LANGUAGES.map((lang) => (
                <label key={lang} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enabledLanguages.includes(lang)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setEnabledLanguages((p) => [...p, lang])
                      } else {
                        setEnabledLanguages((p) => p.filter((l) => l !== lang))
                      }
                    }}
                    className="h-4 w-4 rounded border-[var(--border-default)] text-[var(--brand-primary)] focus:ring-[var(--brand-primary)]"
                    aria-label={lang}
                  />
                  <span className="text-sm text-[var(--text-primary)]">{lang}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Advanced per-feature overrides */}
      <Card>
        <button
          className="flex items-center justify-between w-full"
          onClick={() => setShowAdvanced((p) => !p)}
          aria-expanded={showAdvanced}
        >
          <span className="text-base font-semibold text-[var(--text-primary)]">Advanced: Per-Feature Model Settings</span>
          <span className="text-xs text-[var(--brand-primary)]">{showAdvanced ? 'Collapse ↑' : 'Expand ↓'}</span>
        </button>
        {showAdvanced && (
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-3 gap-2 text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wide px-2">
              <span>Feature</span>
              <span>Model</span>
              <span>Temperature</span>
            </div>
            {FEATURE_MODELS.map((feature) => (
              <div key={feature} className="grid grid-cols-3 gap-2 items-center py-2 border-b border-[var(--border-default)] last:border-0">
                <span className="text-sm text-[var(--text-primary)] px-2">{feature}</span>
                <select className="h-9 rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)] text-xs px-2 text-[var(--text-primary)] focus:border-[var(--brand-primary)] outline-none" aria-label={`Model for ${feature}`}>
                  {models.map((m) => <option key={m.value} value={m.value}>{m.value}</option>)}
                </select>
                <input type="number" defaultValue="0.3" step="0.1" min="0" max="1" className="h-9 w-20 rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)] text-xs px-2 font-mono text-[var(--text-primary)] focus:border-[var(--brand-primary)] outline-none" aria-label={`Temperature for ${feature}`} />
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Usage metrics — real, metered from auth.ai_usage_log (current month) */}
      <div className="grid grid-cols-3 gap-4">
        <MetricCard
          title="AI API Calls This Month"
          value={(usage?.callsThisMonth ?? 0).toLocaleString()}
          icon={<Brain />}
          color="brand"
        />
        <MetricCard
          title="Estimated Cost (USD)"
          value={`$${(usage?.estimatedCostUsd ?? 0).toFixed(2)}`}
          icon={<Zap />}
          color="warning"
        />
        <MetricCard
          title="Avg Response Time"
          value={usage ? `${(usage.avgResponseMs / 1000).toFixed(1)}s` : '—'}
          icon={<Clock />}
          color="success"
        />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button variant="secondary" size="sm" onClick={() => testMutation.mutate()} loading={testMutation.isPending}>
          Test Connection
        </Button>
        <Button variant="ghost" onClick={() => queryClient.invalidateQueries({ queryKey: ['ai-config'] })}>
          Cancel
        </Button>
        <Button variant="primary" onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>
          <Save className="h-4 w-4 mr-1" />
          Save AI Configuration
        </Button>
      </div>
    </div>
  )
}
