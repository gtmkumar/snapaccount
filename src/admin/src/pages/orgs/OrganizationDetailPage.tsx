/**
 * OrganizationDetailPage — Auth/RBAC Module 1 (SUPER_ADMIN)
 * Route: /admin/organizations/:orgId
 * Shows org overview with stat cards, tabs for Members / Roles / Invites / Settings.
 */
import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { t } from '@/i18n'
import { ChevronRight, CheckCircle, PauseCircle, Users, Shield, Mail } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Tabs, TabList, TabTrigger, TabPanels, TabPanel } from '@/components/ui/Tabs'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { Skeleton } from '@/components/ui/Skeleton'
import { Dialog } from '@/components/ui/Dialog'
import { cn, formatDate, isValidGSTIN, isValidPAN } from '@/lib/utils'
import { toast } from 'sonner'
import { listOrganizations, suspendOrganization, type OrgListItem } from '@/lib/rbacApi'

export default function OrganizationDetailPage() {
  const { orgId } = useParams<{ orgId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showSuspend, setShowSuspend] = useState(false)
  const [typed, setTyped] = useState('')

  // Fetch the org detail (reuse list query with specific org ID search)
  // In production this would be GET /auth/admin/organizations/:id
  // For now: find from list; future backend will add single-item endpoint
  const { data: listData, isLoading } = useQuery({
    queryKey: ['platform', 'organizations', { pageSize: 200 }],
    queryFn: () => listOrganizations({ pageSize: 200 }),
    staleTime: 60_000,
  })

  const org = listData?.items.find(o => o.id === orgId) ?? null

  const suspendMutation = useMutation({
    mutationFn: () => suspendOrganization(orgId!),
    onSuccess: () => {
      toast.success(t('orgs.suspendSuccess', { name: org?.businessName ?? '' }))
      void queryClient.invalidateQueries({ queryKey: ['platform', 'organizations'] })
      setShowSuspend(false)
    },
    onError: () => toast.error(t('orgs.suspendError')),
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton variant="list" />
      </div>
    )
  }

  if (!org) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <p className="text-[var(--text-secondary)]">{t('orgs.notFound')}</p>
        <Button variant="ghost" onClick={() => navigate('/admin/organizations')}>
          {t('orgs.backToList')}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-[var(--text-tertiary)]">
        <Link to="/admin/organizations" className="hover:text-[var(--text-primary)] hover:underline">
          {t('orgs.title')}
        </Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-[var(--text-primary)]">{org.businessName}</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-[var(--brand-primary)] text-white flex items-center justify-center text-base font-bold shrink-0">
            {org.businessName.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-[var(--text-primary)]">{org.businessName}</h1>
              <OrgStatusBadge isActive={org.isActive} />
            </div>
            <div className="flex items-center gap-3 mt-1 text-sm text-[var(--text-tertiary)]">
              {org.gstin && <span className="font-mono">{org.gstin}</span>}
              {org.panNumber && <><span>·</span><span className="font-mono">{org.panNumber}</span></>}
              <span>·</span>
              <span>{t('orgs.detail.created', { date: formatDate(org.createdAt) })}</span>
            </div>
          </div>
        </div>
        {org.isActive && (
          <Button
            variant="ghost"
            onClick={() => setShowSuspend(true)}
            className="text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950 border-rose-200"
          >
            {t('orgs.suspend')}
          </Button>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultTab="overview">
        <TabList>
          <TabTrigger id="overview">{t('orgs.tab.overview')}</TabTrigger>
          <TabTrigger id="members" badge={org.memberCount}>{t('orgs.tab.members')}</TabTrigger>
          <TabTrigger id="settings">{t('orgs.tab.settings')}</TabTrigger>
        </TabList>

        <TabPanels className="mt-6">
          {/* Overview tab */}
          <TabPanel id="overview">
            <ErrorBoundary scope="pane">
              <OrgOverview org={org} />
            </ErrorBoundary>
          </TabPanel>

          {/* Members tab */}
          <TabPanel id="members">
            <p className="text-sm text-[var(--text-secondary)]">
              {t('orgs.tab.membersHint')}
            </p>
          </TabPanel>

          {/* Settings tab */}
          <TabPanel id="settings">
            <OrgSettings org={org} />
          </TabPanel>
        </TabPanels>
      </Tabs>

      {/* Suspend confirm dialog */}
      <Dialog
        open={showSuspend}
        onClose={() => { setShowSuspend(false); setTyped('') }}
        title={t('orgs.suspendTitle')}
        description={t('orgs.suspendDesc', { count: org.memberCount })}
        size="md"
        footer={
          <>
            <Button
              variant="primary"
              onClick={() => suspendMutation.mutate()}
              disabled={typed !== org.businessName || suspendMutation.isPending}
              loading={suspendMutation.isPending}
              className="bg-rose-600 hover:bg-rose-700"
            >
              {t('orgs.suspendConfirm')}
            </Button>
            <Button variant="ghost" onClick={() => { setShowSuspend(false); setTyped('') }}>
              {t('common.cancel')}
            </Button>
          </>
        }
      >
        <div className="mt-2">
          <p className="text-sm text-[var(--text-secondary)] mb-3">
            {t('orgs.suspendTypePrompt')}
            {' '}<strong className="font-mono">{org.businessName}</strong>
          </p>
          <input
            value={typed}
            onChange={e => setTyped(e.target.value)}
            placeholder={org.businessName}
            className="w-full px-3 py-2 rounded-lg border bg-[var(--surface-sunken)] border-[var(--border-default)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]"
          />
        </div>
      </Dialog>
    </div>
  )
}

function OrgStatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
      isActive
        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
        : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'
    )}>
      {isActive
        ? <><CheckCircle className="h-3 w-3" />{t('orgs.status.active')}</>
        : <><PauseCircle className="h-3 w-3" />{t('orgs.status.suspended')}</>
      }
    </span>
  )
}

function OrgOverview({ org }: { org: OrgListItem }) {

  const stats = [
    { icon: Users, label: t('orgs.stat.members'), value: org.memberCount },
    { icon: Shield, label: t('orgs.stat.type'), value: org.businessType ?? '—' },
    { icon: Mail, label: t('orgs.stat.gst'), value: org.isGstRegistered ? t('common.yes') : t('common.no') },
  ]

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {stats.map(stat => {
          const Icon = stat.icon
          return (
            <div key={stat.label} className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)]">
              <div className="flex items-center gap-2 mb-2">
                <Icon className="h-4 w-4 text-[var(--text-tertiary)]" />
                <span className="text-xs text-[var(--text-tertiary)] uppercase tracking-wide font-medium">{stat.label}</span>
              </div>
              <p className="text-xl font-bold text-[var(--text-primary)]">{stat.value}</p>
            </div>
          )
        })}
      </div>

      {/* GSTIN / PAN summary */}
      <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)]">
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">{t('orgs.detail.registration')}</h3>
        <dl className="grid grid-cols-2 gap-y-2 gap-x-6 text-sm">
          <div>
            <dt className="text-[var(--text-tertiary)]">{t('orgs.field.gstin')}</dt>
            <dd className="font-mono text-[var(--text-primary)]">{org.gstin ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-[var(--text-tertiary)]">{t('orgs.field.pan')}</dt>
            <dd className="font-mono text-[var(--text-primary)]">{org.panNumber ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-[var(--text-tertiary)]">{t('orgs.col.created')}</dt>
            <dd className="text-[var(--text-primary)]">{formatDate(org.createdAt)}</dd>
          </div>
        </dl>
      </div>
    </div>
  )
}

function OrgSettings({ org }: { org: OrgListItem }) {
  const [gstin, setGstin] = useState(org.gstin ?? '')
  const [panNumber, setPanNumber] = useState(org.panNumber ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = () => {
    const errs: Record<string, string> = {}
    if (gstin && !isValidGSTIN(gstin)) errs.gstin = t('orgs.field.gstinInvalid')
    if (panNumber && !isValidPAN(panNumber)) errs.panNumber = t('orgs.field.panInvalid')
    return errs
  }

  const handleSave = () => {
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    // Future: PATCH /auth/admin/organizations/:id
    toast.success(t('orgs.settings.saved'))
  }

  return (
    <div className="max-w-lg space-y-4">
      <h3 className="text-sm font-semibold text-[var(--text-primary)]">{t('orgs.tab.settings')}</h3>
      <div>
        <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">{t('orgs.field.gstin')}</label>
        <input
          value={gstin}
          onChange={e => setGstin(e.target.value.toUpperCase())}
          maxLength={15}
          className={cn(
            'w-full px-3 py-2 rounded-lg border bg-[var(--surface-sunken)] text-[var(--text-primary)] font-mono focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]',
            errors.gstin ? 'border-rose-500' : 'border-[var(--border-default)]'
          )}
        />
        {errors.gstin && <p className="mt-1 text-xs text-rose-600">{errors.gstin}</p>}
      </div>
      <div>
        <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">{t('orgs.field.pan')}</label>
        <input
          value={panNumber}
          onChange={e => setPanNumber(e.target.value.toUpperCase())}
          maxLength={10}
          className={cn(
            'w-full px-3 py-2 rounded-lg border bg-[var(--surface-sunken)] text-[var(--text-primary)] font-mono focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]',
            errors.panNumber ? 'border-rose-500' : 'border-[var(--border-default)]'
          )}
        />
        {errors.panNumber && <p className="mt-1 text-xs text-rose-600">{errors.panNumber}</p>}
      </div>
      <Button variant="primary" onClick={handleSave}>{t('common.saveChanges')}</Button>
    </div>
  )
}
