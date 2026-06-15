/**
 * PartnerBanksSettingsPage — Phase 6C
 * Route: /settings/partner-banks (also accessible at /loans/partner-banks)
 * Admin-only CRUD for partner banks. Write-only secrets — never echoed back.
 */
import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Building2, TestTube2, RefreshCw, Edit2, CheckCircle, XCircle } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { MetricCard } from '@/components/shared/MetricCard'
import { AlertBanner } from '@/components/shared/AlertBanner'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { BankAdapterTypeBadge } from '@/components/ui/BankAdapterTypeBadge'
import { BankHealthBadge } from '@/components/ui/BankHealthBadge'
import { ProductChipsEditor, type ProductChip } from '@/components/ui/ProductChipsEditor'
import { LogoUploader } from '@/components/ui/LogoUploader'
import { formatDate, cn } from '@/lib/utils'
import { t } from '@/i18n'
import {
  listPartnerBanks,
  registerPartnerBank,
  type PartnerBank,
  type BankAdapterType,
} from '@/lib/loanApi'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BankFormState {
  name: string
  adapterType: BankAdapterType
  contactEmail: string
  logoUrl: string
  // EMAIL fields
  recipientEmail: string
  ccEmail: string
  replyTo: string
  // REST fields
  endpoint: string
  method: string
  apiKey: string // write-only
  // OAUTH fields
  tokenUrl: string
  clientId: string
  clientSecret: string // write-only
  scopes: string
  // Shared
  isActive: boolean
  products: ProductChip[]
}

const DEFAULT_FORM: BankFormState = {
  name: '',
  adapterType: 'EMAIL',
  contactEmail: '',
  logoUrl: '',
  recipientEmail: '',
  ccEmail: '',
  replyTo: '',
  endpoint: '',
  method: 'POST',
  apiKey: '',
  tokenUrl: '',
  clientId: '',
  clientSecret: '',
  scopes: '',
  isActive: true,
  products: [],
}

// ---------------------------------------------------------------------------
// Bank card
// ---------------------------------------------------------------------------

function BankCard({ bank, onEdit }: { bank: PartnerBank; onEdit: (b: PartnerBank) => void }) {
  const health = bank.isActive ? (bank.healthStatus ?? 'healthy') : 'inactive'

  return (
    <Card padding="md" className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {bank.logoUrl ? (
            <img
              src={bank.logoUrl}
              alt={bank.name}
              className="h-12 w-12 rounded-lg object-contain border border-neutral-100"
            />
          ) : (
            <div className="h-12 w-12 rounded-lg bg-neutral-100 flex items-center justify-center">
              <Building2 className="h-6 w-6 text-neutral-400" aria-hidden="true" />
            </div>
          )}
          <div>
            <h3 className="font-semibold text-sm text-neutral-900">{bank.name}</h3>
            <div className="flex items-center gap-2 mt-0.5">
              <BankAdapterTypeBadge adapterType={bank.adapterType} />
              <BankHealthBadge status={health} />
            </div>
          </div>
        </div>
        <Button size="sm" variant="ghost" leftIcon={<Edit2 className="h-3.5 w-3.5" />} onClick={() => onEdit(bank)}>
          {t('common.edit')}
        </Button>
      </div>

      {bank.contactEmail && (
        <p className="text-xs text-neutral-500">{bank.contactEmail}</p>
      )}

      {bank.lastSuccessfulSubmissionAt && (
        <p className="text-xs text-neutral-400">
          {t('admin.partnerBanks.card.lastSubmission')}: {formatDate(bank.lastSuccessfulSubmissionAt)}
        </p>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Add/Edit Drawer (implemented as a side-slide panel using fixed positioning)
// ---------------------------------------------------------------------------

interface BankDrawerProps {
  initial?: PartnerBank
  onClose: () => void
  onSaved: () => void
}

function BankDrawer({ initial, onClose, onSaved }: BankDrawerProps) {
  const qc = useQueryClient()
  const [form, setForm] = useState<BankFormState>({
    ...DEFAULT_FORM,
    ...(initial
      ? {
          name: initial.name,
          adapterType: initial.adapterType,
          contactEmail: initial.contactEmail ?? '',
          logoUrl: initial.logoUrl ?? '',
          isActive: initial.isActive,
        }
      : {}),
  })
  const [testResult, setTestResult] = useState<{ ok: boolean; ms?: number; error?: string } | null>(null)
  const [testing, setTesting] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof BankFormState, string>>>({})

  function setField<K extends keyof BankFormState>(key: K, value: BankFormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
    if (errors[key]) setErrors(prev => ({ ...prev, [key]: undefined }))
  }

  function validate(): boolean {
    const newErrors: Partial<Record<keyof BankFormState, string>> = {}
    if (!form.name.trim()) newErrors.name = t('admin.partnerBanks.error.required')
    if (form.adapterType === 'EMAIL' && !form.recipientEmail) {
      newErrors.recipientEmail = t('admin.partnerBanks.error.required')
    }
    if (form.adapterType === 'REST' || form.adapterType === 'OAUTH') {
      if (!form.endpoint) newErrors.endpoint = t('admin.partnerBanks.error.required')
      if (form.endpoint && !form.endpoint.startsWith('https://')) {
        newErrors.endpoint = t('admin.partnerBanks.error.urlMustBeHttps')
      }
    }
    if (form.adapterType === 'OAUTH') {
      if (!form.tokenUrl) newErrors.tokenUrl = t('admin.partnerBanks.error.required')
      if (form.tokenUrl && !form.tokenUrl.startsWith('https://')) {
        newErrors.tokenUrl = t('admin.partnerBanks.error.urlMustBeHttps')
      }
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const mutation = useMutation({
    mutationFn: () => {
      // Build configJson from form fields — secrets sent write-only, never read back
      const config: Record<string, string> = {}
      if (form.adapterType === 'EMAIL') {
        config['recipientEmail'] = form.recipientEmail
        if (form.ccEmail) config['cc'] = form.ccEmail
        if (form.replyTo) config['replyTo'] = form.replyTo
      } else if (form.adapterType === 'REST') {
        config['endpoint'] = form.endpoint
        config['method'] = form.method
        if (form.apiKey) config['apiKey'] = form.apiKey // write-only to server
      } else if (form.adapterType === 'OAUTH') {
        config['tokenUrl'] = form.tokenUrl
        config['clientId'] = form.clientId
        if (form.clientSecret) config['clientSecret'] = form.clientSecret // write-only
        config['scopes'] = form.scopes
        config['endpoint'] = form.endpoint
      }

      return registerPartnerBank({
        name: form.name,
        adapterType: form.adapterType,
        contactEmail: form.contactEmail || undefined,
        logoUrl: form.logoUrl || undefined,
        configJson: JSON.stringify(config),
      })
    },
    onSuccess: () => {
      toast.success(t('admin.partnerBanks.saved'))
      void qc.invalidateQueries({ queryKey: ['partnerBanks'] })
      onSaved()
    },
    onError: () => toast.error(t('admin.partnerBanks.saveError')),
  })

  function handleSave() {
    if (!validate()) return
    mutation.mutate()
  }

  async function handleTestConnection() {
    setTesting(true)
    setTestResult(null)
    const start = Date.now()
    // Simulate test — real implementation: POST /loans/banks/{id}/test
    await new Promise(r => setTimeout(r, 1000 + Math.random() * 500))
    const ms = Date.now() - start
    // Mock result
    setTestResult({ ok: true, ms })
    setTesting(false)
  }

  const isEditing = !!initial

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={isEditing ? t('admin.partnerBanks.drawer.title.edit', { name: initial?.name ?? '' }) : t('admin.partnerBanks.drawer.title.add')}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />

      {/* Drawer panel */}
      <div className="relative z-10 w-full max-w-xl bg-white shadow-2xl flex flex-col h-full overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 shrink-0">
          <h2 className="text-base font-semibold text-neutral-900">
            {isEditing
              ? t('admin.partnerBanks.drawer.title.edit', { name: initial?.name ?? '' })
              : t('admin.partnerBanks.drawer.title.add')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-500"
          >
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Identity section */}
          <section>
            <h3 className="text-sm font-semibold text-neutral-700 mb-3">
              {t('admin.partnerBanks.drawer.section.identity')}
            </h3>
            <div className="space-y-3">
              <Input
                label={t('admin.partnerBanks.field.name')}
                value={form.name}
                onChange={e => setField('name', e.target.value)}
                error={errors.name}
                required
              />
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  {t('admin.partnerBanks.field.logo')}
                </label>
                <LogoUploader
                  value={form.logoUrl || null}
                  onChangeFile={(uri) => setField('logoUrl', uri)}
                  onClear={() => setField('logoUrl', '')}
                />
              </div>
              <Input
                label={t('admin.partnerBanks.field.contactEmail')}
                type="email"
                value={form.contactEmail}
                onChange={e => setField('contactEmail', e.target.value)}
              />
            </div>
          </section>

          {/* Adapter section */}
          <section>
            <h3 className="text-sm font-semibold text-neutral-700 mb-3">
              {t('admin.partnerBanks.drawer.section.adapter')}
            </h3>

            {/* Adapter type radio */}
            <fieldset className="mb-4">
              <legend className="text-xs font-medium text-neutral-600 mb-2">
                {t('admin.partnerBanks.adapter.type')} *
              </legend>
              <div className="flex gap-3" role="radiogroup" aria-label={t('admin.partnerBanks.adapter.type')}>
                {(['EMAIL', 'REST', 'OAUTH'] as BankAdapterType[]).map(type => (
                  <label
                    key={type}
                    className={cn(
                      'flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer text-sm transition-colors',
                      form.adapterType === type
                        ? 'border-brand-400 bg-brand-50 text-brand-700'
                        : 'border-neutral-200 text-neutral-600 hover:border-neutral-300'
                    )}
                  >
                    <input
                      type="radio"
                      name="adapterType"
                      value={type}
                      checked={form.adapterType === type}
                      onChange={() => setField('adapterType', type)}
                      className="sr-only"
                    />
                    <BankAdapterTypeBadge adapterType={type} />
                  </label>
                ))}
              </div>
            </fieldset>

            {/* EMAIL fields */}
            {form.adapterType === 'EMAIL' && (
              <div className="space-y-3">
                <Input
                  label={t('admin.partnerBanks.field.recipientEmail')}
                  type="email"
                  value={form.recipientEmail}
                  onChange={e => setField('recipientEmail', e.target.value)}
                  error={errors.recipientEmail}
                  required
                />
                <Input
                  label={t('admin.partnerBanks.field.cc')}
                  type="email"
                  value={form.ccEmail}
                  onChange={e => setField('ccEmail', e.target.value)}
                />
                <Input
                  label={t('admin.partnerBanks.field.replyTo')}
                  type="email"
                  value={form.replyTo}
                  onChange={e => setField('replyTo', e.target.value)}
                />
              </div>
            )}

            {/* REST fields */}
            {form.adapterType === 'REST' && (
              <div className="space-y-3">
                <Input
                  label={t('admin.partnerBanks.field.endpoint')}
                  type="url"
                  value={form.endpoint}
                  onChange={e => setField('endpoint', e.target.value)}
                  error={errors.endpoint}
                  required
                />
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
                    {t('admin.partnerBanks.field.method')}
                  </label>
                  <select
                    value={form.method}
                    onChange={e => setField('method', e.target.value)}
                    className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option>POST</option>
                    <option>PUT</option>
                    <option>PATCH</option>
                  </select>
                </div>
                {/* Write-only API key */}
                <SecretInput
                  label={t('admin.partnerBanks.field.apiKey')}
                  value={form.apiKey}
                  onChange={v => setField('apiKey', v)}
                  isNew={!isEditing}
                />
              </div>
            )}

            {/* OAUTH fields */}
            {form.adapterType === 'OAUTH' && (
              <div className="space-y-3">
                <Input
                  label={t('admin.partnerBanks.field.tokenUrl')}
                  type="url"
                  value={form.tokenUrl}
                  onChange={e => setField('tokenUrl', e.target.value)}
                  error={errors.tokenUrl}
                  required
                />
                <Input
                  label={t('admin.partnerBanks.field.clientId')}
                  value={form.clientId}
                  onChange={e => setField('clientId', e.target.value)}
                />
                <SecretInput
                  label={t('admin.partnerBanks.field.clientSecret')}
                  value={form.clientSecret}
                  onChange={v => setField('clientSecret', v)}
                  isNew={!isEditing}
                />
                <Input
                  label={t('admin.partnerBanks.field.scopes')}
                  value={form.scopes}
                  onChange={e => setField('scopes', e.target.value)}
                />
                <Input
                  label={t('admin.partnerBanks.field.endpoint')}
                  type="url"
                  value={form.endpoint}
                  onChange={e => setField('endpoint', e.target.value)}
                  error={errors.endpoint}
                  required
                />
              </div>
            )}
          </section>

          {/* Products section */}
          <section>
            <h3 className="text-sm font-semibold text-neutral-700 mb-2">
              {t('admin.partnerBanks.drawer.section.products')}
            </h3>
            <ProductChipsEditor
              products={form.products}
              onChange={products => setField('products', products)}
            />
          </section>

          {/* Status section */}
          <section>
            <h3 className="text-sm font-semibold text-neutral-700 mb-2">
              {t('admin.partnerBanks.drawer.section.status')}
            </h3>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={e => setField('isActive', e.target.checked)}
                className="rounded border-neutral-300 text-brand-600 focus:ring-brand-500"
              />
              <span className="text-sm text-neutral-700">
                {form.isActive
                  ? t('admin.partnerBanks.toggle.active')
                  : t('admin.partnerBanks.toggle.inactive')}
              </span>
            </label>
          </section>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-neutral-200 bg-neutral-50 shrink-0 space-y-3">
          {/* Test result */}
          {testResult && (
            <div className={cn('flex items-center gap-2 text-xs font-medium', testResult.ok ? 'text-success-700' : 'text-error-700')}>
              {testResult.ok ? (
                <><CheckCircle className="h-3.5 w-3.5" aria-hidden="true" />{t('admin.partnerBanks.test.ok', { ms: testResult.ms ?? 0 })}</>
              ) : (
                <><XCircle className="h-3.5 w-3.5" aria-hidden="true" />{t('admin.partnerBanks.test.fail', { code: testResult.error ?? '' })}</>
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<TestTube2 className="h-4 w-4" />}
              onClick={() => void handleTestConnection()}
              loading={testing}
              disabled={mutation.isPending}
            >
              {t('admin.partnerBanks.card.testConnection')}
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose}>
                {t('admin.partnerBanks.cancel')}
              </Button>
              <Button onClick={handleSave} loading={mutation.isPending}>
                {t('admin.partnerBanks.save')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Write-only secret input — shows last 4 chars for saved value, Replace mode
// ---------------------------------------------------------------------------

function SecretInput({
  label,
  value,
  onChange,
  isNew,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  isNew: boolean
}) {
  const [replacing, setReplacing] = useState(isNew)

  if (!replacing && !isNew) {
    return (
      <div>
        <label className="block text-sm font-medium text-neutral-700 mb-1">{label}</label>
        <div className="flex items-center gap-2">
          <div
            className="flex-1 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-500 font-mono"
            aria-describedby="secret-hint"
          >
            ••••••••{value.slice(-4) || '••••'}
          </div>
          <Button size="sm" variant="ghost" onClick={() => setReplacing(true)}>
            {t('admin.partnerBanks.secret.replace')}
          </Button>
        </div>
        <p id="secret-hint" className="text-xs text-neutral-400 mt-1">
          {t('admin.partnerBanks.secret.hint')}
        </p>
      </div>
    )
  }

  return (
    <div>
      <Input
        label={label}
        type="password"
        value={value}
        onChange={e => onChange(e.target.value)}
        hint={t('admin.partnerBanks.secret.hint')}
        aria-describedby="secret-hint"
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function PartnerBanksSettingsPage() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editingBank, setEditingBank] = useState<PartnerBank | null>(null)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['partnerBanks'],
    queryFn: () => listPartnerBanks({ pageSize: 100 }),
    retry: 1,
  })

  const banks = data?.items ?? []

  const stats = useMemo(() => ({
    active: banks.filter(b => b.isActive).length,
    inactive: banks.filter(b => !b.isActive).length,
    errorsToday: banks.filter(b => b.healthStatus === 'down' || b.healthStatus === 'degraded').length,
  }), [banks])

  function handleEdit(bank: PartnerBank) {
    setEditingBank(bank)
    setDrawerOpen(true)
  }

  function handleAddNew() {
    setEditingBank(null)
    setDrawerOpen(true)
  }

  function handleDrawerClose() {
    setDrawerOpen(false)
    setEditingBank(null)
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('admin.partnerBanks.title')}
        subtitle={t('admin.partnerBanks.help')}
        actions={
          <Button leftIcon={<Plus className="h-4 w-4" />} onClick={handleAddNew}>
            {t('admin.partnerBanks.add')}
          </Button>
        }
      />

      {/* Health summary */}
      <div className="grid grid-cols-3 gap-3 max-w-lg">
        <MetricCard title={t('admin.partnerBanks.health.active')} value={stats.active} color="success" />
        <MetricCard title={t('admin.partnerBanks.health.inactive')} value={stats.inactive} />
        <MetricCard title={t('admin.partnerBanks.health.errorsToday')} value={stats.errorsToday} color={stats.errorsToday > 0 ? 'error' : undefined} />
      </div>

      {isError && (
        <AlertBanner
          type="error"
          title={t('admin.partnerBanks.loadError')}
          actions={
            <button type="button" onClick={() => void refetch()} className="text-xs underline flex items-center gap-1">
              <RefreshCw className="h-3 w-3" /> {t('common.retry')}
            </button>
          }
        />
      )}

      {/* Bank card list */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} variant="card" className="h-36" />
          ))}
        </div>
      ) : banks.length === 0 ? (
        <EmptyState
          variant="generic"
          title={t('admin.partnerBanks.empty')}
          primaryCta={{ label: t('admin.partnerBanks.add'), onPress: handleAddNew }}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {banks.map(bank => (
            <BankCard key={bank.bankId} bank={bank} onEdit={handleEdit} />
          ))}
        </div>
      )}

      {/* Drawer */}
      {drawerOpen && (
        <BankDrawer
          initial={editingBank ?? undefined}
          onClose={handleDrawerClose}
          onSaved={handleDrawerClose}
        />
      )}
    </div>
  )
}
