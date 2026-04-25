/**
 * AiModelSettings — Phase 6F
 * Wired to GET/PATCH /auth/config/ai.
 * Replaces local-state-only version.
 */
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save, Brain, Zap, Clock } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Toggle } from '@/components/ui/Toggle'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { MetricCard } from '@/components/shared/MetricCard'
import { Skeleton } from '@/components/ui/Skeleton'
import { getAiConfig, updateAiConfig } from '@/lib/settingsApi'
import { toast } from 'sonner'

const AI_PROVIDERS = [
  { id: 'vertex', label: 'Google Vertex AI / Gemini', badge: 'Default', recommended: true },
  { id: 'openai', label: 'OpenAI', badge: 'Future', recommended: false },
  { id: 'azure-openai', label: 'Azure OpenAI', badge: 'Future', recommended: false },
  { id: 'anthropic', label: 'Anthropic Claude', badge: 'Future', recommended: false },
]

const GEMINI_MODELS = [
  { value: 'gemini-1.5-pro', label: 'gemini-1.5-pro', hint: 'Most capable, higher cost' },
  { value: 'gemini-1.5-flash', label: 'gemini-1.5-flash', hint: 'Fast, cost-efficient' },
  { value: 'gemini-2.0-flash', label: 'gemini-2.0-flash', hint: 'Latest flash model' },
  { value: 'gemini-2.0-pro', label: 'gemini-2.0-pro', hint: 'Latest pro model — recommended' },
]

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
  const [provider, setProvider] = useState('vertex')
  const [modelId, setModelId] = useState('gemini-2.0-flash')
  const [ocrEnabled, setOcrEnabled] = useState(true)
  const [autoClassifyEnabled, setAutoClassifyEnabled] = useState(true)
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.75)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [enabledLanguages, setEnabledLanguages] = useState<string[]>(['Hindi', 'Bengali'])

  const { data, isLoading } = useQuery({
    queryKey: ['ai-config'],
    queryFn: getAiConfig,
    staleTime: 60_000,
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

  const saveMutation = useMutation({
    mutationFn: () => updateAiConfig({
      provider,
      modelId,
      ocrEnabled,
      autoClassifyEnabled,
      confidenceThreshold,
    }),
    onSuccess: () => {
      toast.success('AI configuration saved')
      void queryClient.invalidateQueries({ queryKey: ['ai-config'] })
    },
    onError: () => toast.error('Failed to save AI configuration'),
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
          {AI_PROVIDERS.map((p) => (
            <label
              key={p.id}
              className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-colors ${
                provider === p.id
                  ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)]/5'
                  : 'border-[var(--border-default)] hover:border-[var(--border-strong)]'
              } ${p.recommended ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
            >
              <input
                type="radio"
                name="ai-provider"
                value={p.id}
                checked={provider === p.id}
                onChange={() => { if (p.recommended) setProvider(p.id) }}
                disabled={!p.recommended}
                className="text-[var(--brand-primary)]"
              />
              <span className="text-sm font-medium text-[var(--text-primary)] flex-1">{p.label}</span>
              {p.badge && (
                <Badge variant={p.recommended ? 'brand' : 'neutral'} size="sm">{p.badge}</Badge>
              )}
              {p.recommended && (
                <Badge variant="success" size="sm">Recommended</Badge>
              )}
            </label>
          ))}
          <p className="text-xs text-[var(--text-tertiary)] px-1 pt-1">
            Changing provider affects all AI features: chatbot, tax recommendations, cash flow forecasting.
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
              {GEMINI_MODELS.map((m) => (
                <option key={m.value} value={m.value}>{m.label} — {m.hint}</option>
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
                  {GEMINI_MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <input type="number" defaultValue="0.3" step="0.1" min="0" max="1" className="h-9 w-20 rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)] text-xs px-2 font-mono text-[var(--text-primary)] focus:border-[var(--brand-primary)] outline-none" aria-label={`Temperature for ${feature}`} />
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Usage metrics */}
      <div className="grid grid-cols-3 gap-4">
        <MetricCard title="AI API Calls This Month" value="12,847" icon={<Brain />} color="brand" />
        <MetricCard title="Estimated Cost (USD)" value="$48.20" icon={<Zap />} color="warning" />
        <MetricCard title="Avg Response Time" value="1.2s" icon={<Clock />} color="success" />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button variant="secondary" size="sm">Test with Sample Query</Button>
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
