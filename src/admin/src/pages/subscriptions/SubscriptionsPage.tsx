/**
 * SubscriptionsPage — Phase 6F Track F3
 * Plans CRUD (admin), MRR dashboard, active subs DataGrid, upgrade/downgrade flow.
 * Role: ADMIN only (gated at route level).
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  Plus, TrendingUp, Users, AlertCircle, XCircle,
  Edit, Trash2, Activity, RefreshCw,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Tabs, TabList, TabTrigger, TabPanels, TabPanel } from '@/components/ui/Tabs'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { Dialog } from '@/components/ui/Dialog'
import { DataTable } from '@/components/ui/DataTable'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import {
  getMrrDashboard, listPlans, createPlan, updatePlan,
  type Plan, type PlanTier,
} from '@/lib/subscriptionApi'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { formatIndianAmount } from '@/lib/utils'
import type { ColumnDef } from '@tanstack/react-table'

const TIER_ORDER: PlanTier[] = ['Free', 'Starter', 'Growth', 'Enterprise']
const TIER_COLORS: Record<string, string> = {
  Free: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300',
  Starter: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  Growth: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  Enterprise: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
}

function MrrKpiCard({ label, value, sub, icon: Icon, color }: { label: string; value: string; sub?: string; icon: typeof Activity; color: string }) {
  return (
    <Card className="flex items-center gap-4">
      <div className={cn('p-3 rounded-xl', color)}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <div>
        <p className="text-xs text-[var(--text-secondary)]">{label}</p>
        <p className="text-xl font-bold tabular-nums text-[var(--text-primary)]">{value}</p>
        {sub && <p className="text-xs text-[var(--text-tertiary)]">{sub}</p>}
      </div>
    </Card>
  )
}

export default function SubscriptionsPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [showCreatePlan, setShowCreatePlan] = useState(false)
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null)

  const { data: mrr, isLoading: mrrLoading } = useQuery({
    queryKey: ['subscriptions', 'mrr'],
    queryFn: getMrrDashboard,
    staleTime: 60_000,
  })

  const { data: plans, isLoading: plansLoading } = useQuery({
    queryKey: ['subscriptions', 'plans'],
    queryFn: listPlans,
    staleTime: 60_000,
  })

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive, plan }: { id: string; isActive: boolean; plan: Plan }) =>
      updatePlan(id, { name: plan.name, priceInr: plan.priceInr, isActive }),
    onSuccess: () => {
      toast.success(t('subscriptions.planUpdated', 'Plan updated'))
      void queryClient.invalidateQueries({ queryKey: ['subscriptions', 'plans'] })
    },
  })

  const planColumns: ColumnDef<Plan>[] = [
    {
      accessorKey: 'name',
      header: 'Plan',
      cell: ({ row }) => (
        <div>
          <p className="font-medium text-[var(--text-primary)]">{row.original.name}</p>
          <p className="text-xs text-[var(--text-tertiary)]">{row.original.description ?? ''}</p>
        </div>
      ),
    },
    {
      accessorKey: 'tier',
      header: 'Tier',
      cell: ({ getValue }) => (
        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', TIER_COLORS[getValue() as string] ?? '')}>
          {getValue() as string}
        </span>
      ),
    },
    {
      accessorKey: 'priceInr',
      header: 'Price',
      cell: ({ getValue }) => (
        <span className="tabular-nums text-sm font-medium text-[var(--text-primary)]">
          ₹{formatIndianAmount(getValue() as number)}/mo
        </span>
      ),
    },
    {
      accessorKey: 'billingCycle',
      header: 'Cycle',
      cell: ({ getValue }) => {
        const cycle = getValue() as number
        return <span className="text-sm text-[var(--text-secondary)]">{cycle === 1 ? 'Monthly' : cycle === 3 ? 'Quarterly' : 'Annual'}</span>
      },
    },
    {
      accessorKey: 'isActive',
      header: 'Status',
      cell: ({ row }) => (
        <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', row.original.isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-neutral-100 text-neutral-500')}>
          {row.original.isActive ? 'Active' : 'Archived'}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <div className="flex gap-1.5">
          <Button variant="ghost" size="sm" onClick={() => setEditingPlan(row.original)} aria-label="Edit plan">
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => toggleActiveMutation.mutate({ id: row.original.planId, isActive: !row.original.isActive, plan: row.original })}
            aria-label={row.original.isActive ? 'Archive plan' : 'Activate plan'}
          >
            {row.original.isActive ? <Trash2 className="h-4 w-4 text-rose-500" /> : <RefreshCw className="h-4 w-4 text-emerald-500" />}
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title={t('subscriptions.title', 'Subscriptions')}
          subtitle={t('subscriptions.subtitle', 'Manage plans, monitor MRR, and handle subscription lifecycle.')}
        />
        <Button variant="primary" onClick={() => setShowCreatePlan(true)}>
          <Plus className="h-4 w-4 mr-1" />
          {t('subscriptions.newPlan', 'New Plan')}
        </Button>
      </div>

      <Tabs defaultTab="overview">
        <TabList>
          <TabTrigger id="overview">{t('subscriptions.tab.overview', 'Overview')}</TabTrigger>
          <TabTrigger id="plans">{t('subscriptions.tab.plans', 'Plans')}</TabTrigger>
        </TabList>

        <TabPanels className="mt-6">
          {/* Overview tab */}
          <TabPanel id="overview">
            <div className="space-y-6">
              {mrrLoading ? (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {[1,2,3,4].map(i => <Skeleton key={i} variant="card" />)}
                </div>
              ) : (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <MrrKpiCard
                    label={t('subscriptions.mrr', 'MRR')}
                    value={`₹${formatIndianAmount(mrr?.totalMrr ?? 0)}`}
                    icon={TrendingUp}
                    color="bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
                  />
                  <MrrKpiCard
                    label={t('subscriptions.active', 'Active')}
                    value={String(mrr?.activeCount ?? 0)}
                    icon={Users}
                    color="bg-sky-100 text-sky-600 dark:bg-sky-950 dark:text-sky-400"
                  />
                  <MrrKpiCard
                    label={t('subscriptions.pastDue', 'Past Due')}
                    value={String(mrr?.pastDueCount ?? 0)}
                    icon={AlertCircle}
                    color="bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400"
                  />
                  <MrrKpiCard
                    label={t('subscriptions.cancelled', 'Cancelled')}
                    value={String(mrr?.cancelledCount ?? 0)}
                    icon={XCircle}
                    color="bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400"
                  />
                </div>
              )}

              <Card>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                    {t('subscriptions.mrrTrend', 'MRR Trend')}
                  </h3>
                </div>
                <ErrorBoundary scope="pane">
                  <Skeleton variant="chart" className="h-40" />
                  <p className="text-xs text-center text-[var(--text-tertiary)] mt-2">Chart data available when subscriptions are active</p>
                </ErrorBoundary>
              </Card>
            </div>
          </TabPanel>

          {/* Plans tab */}
          <TabPanel id="plans">
            <ErrorBoundary scope="pane">
              {plansLoading ? (
                <Skeleton variant="dataTableDense" />
              ) : !plans?.length ? (
                <EmptyState
                  variant="subscriptions"
                  size="md"
                  primaryCta={{ label: t('subscriptions.createFirst', 'Create first plan'), onPress: () => setShowCreatePlan(true) }}
                />
              ) : (
                <DataTable
                  data={plans}
                  columns={planColumns}
                  pageSize={25}
                />
              )}
            </ErrorBoundary>
          </TabPanel>
        </TabPanels>
      </Tabs>

      {/* Create / Edit plan dialog */}
      <PlanDialog
        open={showCreatePlan || !!editingPlan}
        plan={editingPlan}
        onClose={() => { setShowCreatePlan(false); setEditingPlan(null) }}
        onSaved={() => {
          void queryClient.invalidateQueries({ queryKey: ['subscriptions', 'plans'] })
          setShowCreatePlan(false)
          setEditingPlan(null)
        }}
      />
    </div>
  )
}

// ── Plan create/edit dialog ───────────────────────────────────────────────────

interface PlanDialogProps {
  open: boolean
  plan?: Plan | null
  onClose: () => void
  onSaved: () => void
}

function PlanDialog({ open, plan, onClose, onSaved }: PlanDialogProps) {
  const { t } = useTranslation()
  const [name, setName] = useState(plan?.name ?? '')
  const [tier, setTier] = useState<PlanTier>(plan?.tier ?? 'Starter')
  const [priceInr, setPriceInr] = useState(String(plan?.priceInr ?? ''))
  const [trialDays, setTrialDays] = useState(String(plan?.trialDays ?? '14'))
  const [description, setDescription] = useState(plan?.description ?? '')

  const createMutation = useMutation({
    mutationFn: () => createPlan({ name, tier, billingCycle: 1, priceInr: Number(priceInr), trialDays: Number(trialDays) || undefined, description: description || undefined }),
    onSuccess: () => {
      toast.success(t('subscriptions.planCreated', 'Plan created'))
      onSaved()
    },
    onError: () => toast.error(t('subscriptions.planCreateError', 'Failed to create plan')),
  })

  const updateMutation = useMutation({
    mutationFn: () => updatePlan(plan!.planId, { name, priceInr: Number(priceInr), description: description || undefined, isActive: plan!.isActive }),
    onSuccess: () => {
      toast.success(t('subscriptions.planUpdated', 'Plan updated'))
      onSaved()
    },
    onError: () => toast.error(t('subscriptions.planUpdateError', 'Failed to update plan')),
  })

  const handleSave = () => {
    if (!name || !priceInr) return
    if (plan) updateMutation.mutate()
    else createMutation.mutate()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={plan ? t('subscriptions.editPlan', 'Edit Plan') : t('subscriptions.createPlan', 'Create Plan')}
      size="lg"
      footer={
        <>
          <Button
            variant="primary"
            onClick={handleSave}
            loading={createMutation.isPending || updateMutation.isPending}
            disabled={!name || !priceInr}
          >
            {plan ? t('common.save', 'Save') : t('subscriptions.createPlan', 'Create Plan')}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel', 'Cancel')}
          </Button>
        </>
      }
    >
      <div className="space-y-4 py-2">
        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
            {t('subscriptions.planName', 'Plan Name')} *
          </label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Starter Plan"
            className="w-full px-3 py-2 rounded-lg border bg-[var(--surface-sunken)] border-[var(--border-default)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]"
          />
        </div>

        {!plan && (
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
              {t('subscriptions.tier', 'Tier')} *
            </label>
            <select
              value={tier}
              onChange={e => setTier(e.target.value as PlanTier)}
              className="w-full px-3 py-2 rounded-lg border bg-[var(--surface-sunken)] border-[var(--border-default)] text-[var(--text-primary)]"
            >
              {TIER_ORDER.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
            {t('subscriptions.priceInr', 'Price (₹/month)')} *
          </label>
          <input
            type="number"
            value={priceInr}
            onChange={e => setPriceInr(e.target.value)}
            min="0"
            placeholder="999"
            className="w-full px-3 py-2 rounded-lg border bg-[var(--surface-sunken)] border-[var(--border-default)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]"
          />
        </div>

        {!plan && (
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
              {t('subscriptions.trialDays', 'Trial Days')}
            </label>
            <input
              type="number"
              value={trialDays}
              onChange={e => setTrialDays(e.target.value)}
              min="0"
              placeholder="14"
              className="w-full px-3 py-2 rounded-lg border bg-[var(--surface-sunken)] border-[var(--border-default)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]"
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
            {t('subscriptions.description', 'Description')}
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
            placeholder="Optional description"
            className="w-full px-3 py-2 rounded-lg border bg-[var(--surface-sunken)] border-[var(--border-default)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)] resize-none"
          />
        </div>
      </div>
    </Dialog>
  )
}
