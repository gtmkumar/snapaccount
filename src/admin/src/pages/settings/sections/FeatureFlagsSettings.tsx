/**
 * FeatureFlagsSettings — Phase 6F
 * Wired to GET /auth/feature-flags + PATCH /auth/feature-flags/:flag.
 * Replaces local-state-only version.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Toggle } from '@/components/ui/Toggle'
import { Badge } from '@/components/ui/Badge'
import { AlertBanner } from '@/components/shared/AlertBanner'
import { Skeleton } from '@/components/ui/Skeleton'
import { getFeatureFlags, updateFeatureFlag } from '@/lib/settingsApi'
import { toast } from 'sonner'

// Static metadata — keys must match what the API returns
const FLAG_META: Record<string, { label: string; description: string; category: string }> = {
  whatsapp_messaging: { label: 'WhatsApp Messaging', description: 'Enable WhatsApp Business API messaging', category: 'Integrations' },
  tally_export: { label: 'Tally Export', description: 'Enable Tally XML export for users', category: 'Integrations' },
  google_meet_integration: { label: 'Google Meet Integration', description: 'Enable Google Meet for video consultations', category: 'Integrations' },
  razorpay_payments: { label: 'Razorpay Payments', description: 'Enable Razorpay subscription billing', category: 'Integrations' },
  sarvam_ai_languages: { label: 'Sarvam AI Languages', description: 'Enable Sarvam AI for Indian language support', category: 'Integrations' },
  ai_chatbot_first_response: { label: 'AI Chatbot First Response', description: 'AI chatbot responds before routing to CA', category: 'AI Features' },
  ai_tax_regime_recommendation: { label: 'AI Tax Regime Recommendation', description: 'AI recommends Old vs New regime', category: 'AI Features' },
  ai_cash_flow_forecasting: { label: 'AI Cash Flow Forecasting', description: 'AI-powered cash flow predictions', category: 'AI Features' },
  ai_anomaly_detection: { label: 'AI Anomaly Detection', description: 'Flag unusual transactions / filing discrepancies', category: 'Experimental' },
  e_invoicing: { label: 'E-Invoicing', description: 'Enable e-invoicing (IRN generation) for eligible businesses', category: 'Compliance' },
  e_way_bill: { label: 'E-Way Bill', description: 'Enable e-way bill generation', category: 'Compliance' },
  tds_management_module: { label: 'TDS Management Module', description: 'Enable full TDS management (24Q, 26Q, 27Q)', category: 'Compliance' },
  multi_organization_support: { label: 'Multi-Organization Support', description: 'Users can manage multiple businesses', category: 'User Features' },
  loan_comparison: { label: 'Loan Comparison', description: 'Show loan comparison screen', category: 'User Features' },
  voice_assistant: { label: 'Voice Assistant', description: 'Voice input for filing queries', category: 'Experimental' },
}

const CATEGORIES = ['All', 'Integrations', 'AI Features', 'Compliance', 'User Features', 'Admin Features', 'Experimental']

export function FeatureFlagsSettings() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All')

  const { data: flags, isLoading } = useQuery({
    queryKey: ['feature-flags'],
    queryFn: getFeatureFlags,
    staleTime: 30_000,
  })

  const toggleMutation = useMutation({
    mutationFn: ({ flag, enabled }: { flag: string; enabled: boolean }) =>
      updateFeatureFlag(flag, enabled),
    onSuccess: (_data, { flag, enabled }) => {
      toast.success(`Flag "${FLAG_META[flag]?.label ?? flag}" ${enabled ? 'enabled' : 'disabled'}`)
      void queryClient.invalidateQueries({ queryKey: ['feature-flags'] })
    },
    onError: (_err, { flag }) => {
      toast.error(`Failed to update flag "${FLAG_META[flag]?.label ?? flag}"`)
      void queryClient.invalidateQueries({ queryKey: ['feature-flags'] })
    },
  })

  const handleToggle = (key: string, value: boolean) => {
    toggleMutation.mutate({ flag: key, enabled: value })
  }

  if (isLoading) return <Skeleton variant="list" />

  // Build enriched flag list from API data + static metadata
  const flagEntries = Object.entries(flags ?? {}).map(([key, enabled]) => ({
    key,
    enabled: enabled as boolean,
    label: FLAG_META[key]?.label ?? key,
    description: FLAG_META[key]?.description ?? '',
    category: FLAG_META[key]?.category ?? 'Other',
  }))

  const filtered = flagEntries.filter((flag) => {
    const matchesSearch = !search ||
      flag.label.toLowerCase().includes(search.toLowerCase()) ||
      flag.description.toLowerCase().includes(search.toLowerCase())
    const matchesCategory = categoryFilter === 'All' || flag.category === categoryFilter
    return matchesSearch && matchesCategory
  })

  const grouped = filtered.reduce<Record<string, typeof filtered>>((acc, flag) => {
    if (!acc[flag.category]) acc[flag.category] = []
    acc[flag.category]!.push(flag)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-[var(--text-primary)]">Feature Flags</h2>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Master list of all toggleable features — runtime control without deployment.
        </p>
      </div>

      <AlertBanner
        type="warning"
        title="Production Feature Flags"
        description="Feature flag changes take effect immediately for all users. Test in staging before enabling in production."
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="w-64">
          <Input
            placeholder="Search feature flags..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            prefix={<Search className="h-4 w-4" />}
            size="sm"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-[var(--text-secondary)] block mb-1">Category</label>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="h-9 rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)] text-sm px-3 text-[var(--text-primary)] focus:border-[var(--brand-primary)] focus:ring-2 focus:ring-[var(--brand-primary)]/20 outline-none"
            aria-label="Filter by category"
          >
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Flags by category */}
      {Object.entries(grouped).map(([category, categoryFlags]) => (
        <Card key={category} padding="none">
          <div className="px-5 py-3 border-b border-[var(--border-default)] bg-[var(--surface-sunken)]">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--text-secondary)]">{category}</h3>
              <Badge variant="neutral" size="sm">{categoryFlags.length} flags</Badge>
            </div>
          </div>
          <div className="divide-y divide-[var(--border-default)]">
            {categoryFlags.map((flag) => (
              <div key={flag.key} className="px-5 py-4 flex items-center gap-4">
                <Toggle
                  checked={flag.enabled}
                  onChange={(val) => handleToggle(flag.key, val)}
                  disabled={toggleMutation.isPending}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[var(--text-primary)]">{flag.label}</span>
                    <code className="text-xs font-mono text-[var(--text-tertiary)] bg-[var(--surface-sunken)] px-1.5 py-0.5 rounded">
                      {flag.key}
                    </code>
                  </div>
                  {flag.description && (
                    <p className="text-xs text-[var(--text-secondary)] mt-0.5">{flag.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}

      {flagEntries.length === 0 && !isLoading && (
        <Card>
          <p className="text-sm text-[var(--text-secondary)] text-center py-8">
            No feature flags found. Flags are loaded from the API.
          </p>
        </Card>
      )}
    </div>
  )
}
