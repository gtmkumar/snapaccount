/**
 * SubscriptionsPage — Phase 6F Track F3 + GAP-035 admin upgrade CTA
 * Plans CRUD (admin), MRR dashboard, active subs DataGrid, upgrade/downgrade flow.
 * Role: ADMIN only (gated at route level).
 */
import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { t } from '@/i18n'
import {
  Plus, TrendingUp, Users, AlertCircle, XCircle,
  Edit, Trash2, Activity, RefreshCw, ArrowUpCircle, Receipt,
  CreditCard, ChevronRight,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Tabs, TabList, TabTrigger, TabPanels, TabPanel } from '@/components/ui/Tabs'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { Dialog } from '@/components/ui/Dialog'
import { DataTable } from '@/components/ui/DataTable'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { AlertBanner } from '@/components/shared/AlertBanner'
import {
  getMrrDashboard, listPlans, createPlan, updatePlan,
  getMySubscription, upgradeSubscription,
  type Plan, type PlanTier, type SubscriptionStatus,
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

const SUB_STATUS_COLORS: Record<SubscriptionStatus, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  TRIALING: 'bg-sky-100 text-sky-700',
  PAST_DUE: 'bg-amber-100 text-amber-700',
  CANCELLED: 'bg-neutral-100 text-neutral-500',
  PAUSED: 'bg-violet-100 text-violet-700',
}

// ---------------------------------------------------------------------------
// Current Plan + Upgrade CTA (GAP-035 admin equivalent of mobile BillingScreen)
// ---------------------------------------------------------------------------
function CurrentPlanCard({ plans }: { plans: Plan[] | undefined }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [showUpgrade, setShowUpgrade] = useState(false)

  const { data: sub, isLoading: subLoading } = useQuery({
    queryKey: ['subscriptions', 'me'],
    queryFn: getMySubscription,
    staleTime: 60_000,
    retry: false,
  })

  const currentPlan = plans?.find(p => p.planId === sub?.subscriptionId) ??
    plans?.find(p => p.isActive && p.tier === 'Free')

  const nextTierPlans = plans?.filter(p => {
    if (!currentPlan) return p.tier !== 'Free'
    const currentIdx = TIER_ORDER.indexOf(currentPlan.tier)
    return TIER_ORDER.indexOf(p.tier) > currentIdx && p.isActive
  }) ?? []

  const upgradeMutation = useMutation({
    mutationFn: (newPlanId: string) => upgradeSubscription(newPlanId),
    onSuccess: () => {
      toast.success(t('subscriptions.upgrade.success'))
      setShowUpgrade(false)
      void queryClient.invalidateQueries({ queryKey: ['subscriptions'] })
    },
    onError: () => toast.error(t('subscriptions.upgrade.error')),
  })

  if (subLoading) return <Skeleton variant="card" />

  const status = sub?.status ?? 'TRIALING'
  const isPastDue = status === 'PAST_DUE'

  return (
    <Card>
      <CardHeader
        title={t('subscriptions.currentPlan.title')}
        actions={
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<Receipt className="h-4 w-4" />}
            onClick={() => void navigate('/subscriptions/invoices')}
          >
            {t('subscriptions.currentPlan.viewInvoices')}
          </Button>
        }
      />

      {isPastDue && (
        <div className="mb-4">
          <AlertBanner
            type="error"
            title={t('subscriptions.upgrade.pastDue.title')}
            description={t('subscriptions.upgrade.pastDue.body')}
          />
        </div>
      )}

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-xl bg-[var(--color-brand-100)] text-[var(--color-brand-600)] dark:bg-[var(--color-brand-950)] dark:text-[var(--color-brand-400)]">
            <CreditCard className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-lg font-bold text-[var(--text-primary)]">
              {currentPlan?.name ?? t('subscriptions.currentPlan.unknown')}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              {currentPlan && (
                <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', TIER_COLORS[currentPlan.tier] ?? '')}>
                  {currentPlan.tier}
                </span>
              )}
              <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', SUB_STATUS_COLORS[status as SubscriptionStatus] ?? '')}>
                {t(`subscriptions.status.${status.toLowerCase()}`)}
              </span>
              {currentPlan && (
                <span className="text-sm text-[var(--text-secondary)] tabular-nums">
                  ₹{formatIndianAmount(currentPlan.priceInr)}/{t('subscriptions.perMonth')}
                </span>
              )}
            </div>
            {sub?.currentPeriodEnd && (
              <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                {t('subscriptions.currentPlan.renewsOn', {
                  date: new Date(sub.currentPeriodEnd).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })
                })}
              </p>
            )}
          </div>
        </div>

        {nextTierPlans.length > 0 && status !== 'CANCELLED' && (
          <Button
            variant="primary"
            size="sm"
            leftIcon={<ArrowUpCircle className="h-4 w-4" />}
            onClick={() => setShowUpgrade(true)}
          >
            {t('subscriptions.upgrade.cta')}
          </Button>
        )}
      </div>

      {/* Upgrade plan dialog */}
      <Dialog
        open={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        title={t('subscriptions.upgrade.title')}
        size="lg"
        footer={
          <Button variant="ghost" onClick={() => setShowUpgrade(false)}>
            {t('common.cancel')}
          </Button>
        }
      >
        <div className="space-y-3 py-2">
          <p className="text-sm text-[var(--text-secondary)]">{t('subscriptions.upgrade.body')}</p>
          {nextTierPlans.map(plan => (
            <div key={plan.planId} className="flex items-center justify-between p-4 rounded-xl border border-[var(--border-default)] hover:border-[var(--color-brand-500)] transition-colors">
              <div className="flex items-center gap-3">
                <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', TIER_COLORS[plan.tier] ?? '')}>
                  {plan.tier}
                </span>
                <div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">{plan.name}</p>
                  {plan.description && <p className="text-xs text-[var(--text-tertiary)]">{plan.description}</p>}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold tabular-nums text-[var(--text-primary)]">
                  ₹{formatIndianAmount(plan.priceInr)}/{t('subscriptions.perMonth')}
                </span>
                <Button
                  variant="primary"
                  size="sm"
                  rightIcon={<ChevronRight className="h-3 w-3" />}
                  onClick={() => upgradeMutation.mutate(plan.planId)}
                  loading={upgradeMutation.isPending}
                >
                  {t('subscriptions.upgrade.select')}
                </Button>
              </div>
            </div>
          ))}
          <p className="text-xs text-[var(--text-tertiary)]">{t('subscriptions.upgrade.razorpayNote')}</p>
        </div>
      </Dialog>
    </Card>
  )
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
      toast.success(t('subscriptions.planUpdated'))
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
          title={t('subscriptions.title')}
          subtitle={t('subscriptions.subtitle')}
        />
        <Button variant="primary" onClick={() => setShowCreatePlan(true)}>
          <Plus className="h-4 w-4 mr-1" />
          {t('subscriptions.newPlan')}
        </Button>
      </div>

      <Tabs defaultTab="overview">
        <TabList>
          <TabTrigger id="overview">{t('subscriptions.tab.overview')}</TabTrigger>
          <TabTrigger id="plans">{t('subscriptions.tab.plans')}</TabTrigger>
        </TabList>

        <TabPanels className="mt-6">
          {/* Overview tab */}
          <TabPanel id="overview">
            <div className="space-y-6">
              {/* Current plan + upgrade CTA — GAP-035 admin equivalent */}
              <CurrentPlanCard plans={plans} />

              {mrrLoading ? (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {[1,2,3,4].map(i => <Skeleton key={i} variant="card" />)}
                </div>
              ) : (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <MrrKpiCard
                    label={t('subscriptions.mrr')}
                    value={`₹${formatIndianAmount(mrr?.totalMrr ?? 0)}`}
                    icon={TrendingUp}
                    color="bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
                  />
                  <MrrKpiCard
                    label={t('subscriptions.active')}
                    value={String(mrr?.activeCount ?? 0)}
                    icon={Users}
                    color="bg-sky-100 text-sky-600 dark:bg-sky-950 dark:text-sky-400"
                  />
                  <MrrKpiCard
                    label={t('subscriptions.pastDue')}
                    value={String(mrr?.pastDueCount ?? 0)}
                    icon={AlertCircle}
                    color="bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400"
                  />
                  <MrrKpiCard
                    label={t('subscriptions.cancelled')}
                    value={String(mrr?.cancelledCount ?? 0)}
                    icon={XCircle}
                    color="bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400"
                  />
                </div>
              )}

              <Card>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                    {t('subscriptions.mrrTrend')}
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
                  primaryCta={{ label: t('subscriptions.createFirst'), onPress: () => setShowCreatePlan(true) }}
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
  const [name, setName] = useState(plan?.name ?? '')
  const [tier, setTier] = useState<PlanTier>(plan?.tier ?? 'Starter')
  const [priceInr, setPriceInr] = useState(String(plan?.priceInr ?? ''))
  const [trialDays, setTrialDays] = useState(String(plan?.trialDays ?? '14'))
  const [description, setDescription] = useState(plan?.description ?? '')

  // GAP-055: Reset form state when the dialog is opened with a different plan
  // (previously fields retained stale values from previous edit when re-opened).
  useEffect(() => {
    if (open) {
      setName(plan?.name ?? '')
      setTier(plan?.tier ?? 'Starter')
      setPriceInr(String(plan?.priceInr ?? ''))
      setTrialDays(String(plan?.trialDays ?? '14'))
      setDescription(plan?.description ?? '')
    }
  }, [open, plan?.planId])

  const createMutation = useMutation({
    mutationFn: () => createPlan({ name, tier, billingCycle: 1, priceInr: Number(priceInr), trialDays: Number(trialDays) || undefined, description: description || undefined }),
    onSuccess: () => {
      toast.success(t('subscriptions.planCreated'))
      onSaved()
    },
    onError: () => toast.error(t('subscriptions.planCreateError')),
  })

  const updateMutation = useMutation({
    mutationFn: () => updatePlan(plan!.planId, { name, priceInr: Number(priceInr), description: description || undefined, isActive: plan!.isActive }),
    onSuccess: () => {
      toast.success(t('subscriptions.planUpdated'))
      onSaved()
    },
    onError: () => toast.error(t('subscriptions.planUpdateError')),
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
      title={plan ? t('subscriptions.editPlan') : t('subscriptions.createPlan')}
      size="lg"
      footer={
        <>
          <Button
            variant="primary"
            onClick={handleSave}
            loading={createMutation.isPending || updateMutation.isPending}
            disabled={!name || !priceInr}
          >
            {plan ? t('common.save') : t('subscriptions.createPlan')}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
        </>
      }
    >
      <div className="space-y-4 py-2">
        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
            {t('subscriptions.planName')} *
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
              {t('subscriptions.tier')} *
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
            {t('subscriptions.priceInr')} *
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
              {t('subscriptions.trialDays')}
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
            {t('subscriptions.description')}
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
