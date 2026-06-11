/**
 * OrganizationDetailPage — Auth/RBAC Module 1 (SUPER_ADMIN)
 * Route: /admin/organizations/:orgId
 * Shows org overview with stat cards, tabs for Overview / Members / Settings.
 */
import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { t } from '@/i18n'
import {
  ChevronRight, CheckCircle, PauseCircle, Users, Shield, Mail,
  UserCheck, Clock, AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Tabs, TabList, TabTrigger, TabPanels, TabPanel } from '@/components/ui/Tabs'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { Skeleton } from '@/components/ui/Skeleton'
import { Dialog } from '@/components/ui/Dialog'
import { cn, formatDate, isValidGSTIN, isValidPAN } from '@/lib/utils'
import { toast } from 'sonner'
import {
  listOrganizations, suspendOrganization, updateOrgSettings,
  listOrgMembers, listOrgInvites,
  type OrgListItem, type OrgMember, type OrgInvite,
} from '@/lib/rbacApi'
import { Toggle } from '@/components/ui/Toggle'
import { usePermission } from '@/hooks/usePermission'

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

          {/* Members tab — live data */}
          <TabPanel id="members">
            <ErrorBoundary scope="pane">
              <OrgMembersTab orgId={orgId!} />
            </ErrorBoundary>
          </TabPanel>

          {/* Settings tab — pending invites + editable metadata */}
          <TabPanel id="settings">
            <ErrorBoundary scope="pane">
              <OrgSettingsTab orgId={orgId!} org={org} />
            </ErrorBoundary>
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

// ── Members tab ───────────────────────────────────────────────────────────────

function OrgMembersTab({ orgId }: { orgId: string }) {
  const [page, setPage] = useState(1)
  const pageSize = 20

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['platform', 'organizations', orgId, 'members', { page, pageSize }],
    queryFn: () => listOrgMembers(orgId, { page, pageSize }),
    staleTime: 30_000,
  })

  if (isLoading) return <Skeleton variant="list" />

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-12">
        <AlertCircle className="h-8 w-8 text-[var(--text-tertiary)]" />
        <p className="text-sm text-[var(--text-secondary)]">{t('orgs.members.error')}</p>
        <Button variant="ghost" onClick={() => void refetch()}>{t('common.retry')}</Button>
      </div>
    )
  }

  const items = data?.items ?? []
  const totalCount = data?.totalCount ?? 0
  const totalPages = Math.ceil(totalCount / pageSize)

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16">
        <Users className="h-10 w-10 text-[var(--text-tertiary)]" />
        <p className="text-sm text-[var(--text-secondary)]">{t('orgs.members.empty')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--text-tertiary)]">
        {t('orgs.members.total', { count: totalCount })}
      </p>

      <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
        <table className="w-full text-sm" aria-label={t('orgs.members.tableLabel')}>
          <thead>
            <tr className="bg-[var(--surface-raised)] border-b border-[var(--border-subtle)]">
              <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">
                {t('orgs.members.col.member')}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">
                {t('orgs.members.col.role')}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">
                {t('orgs.members.col.status')}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">
                {t('orgs.members.col.joined')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {items.map(member => (
              <MemberRow key={member.userId} member={member} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
          >
            {t('common.prev')}
          </Button>
          <span className="text-sm text-[var(--text-tertiary)]">
            {t('common.pageOf', { page, total: totalPages })}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
          >
            {t('common.next')}
          </Button>
        </div>
      )}
    </div>
  )
}

function MemberRow({ member }: { member: OrgMember }) {
  const initials = (member.displayName ?? member.email)
    .split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <tr className="bg-[var(--surface-default)] hover:bg-[var(--surface-raised)] transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-[var(--brand-primary)] text-white flex items-center justify-center text-xs font-bold shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--text-primary)] truncate">
              {member.displayName ?? member.email}
            </p>
            {member.displayName && (
              <p className="text-xs text-[var(--text-tertiary)] truncate">{member.email}</p>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
          {member.role}
        </span>
      </td>
      <td className="px-4 py-3">
        {member.status === 'active' ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            <UserCheck className="h-3 w-3" />
            {t('orgs.members.status.active')}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
            <PauseCircle className="h-3 w-3" />
            {t('orgs.members.status.inactive')}
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-[var(--text-secondary)]">
        {member.joinedAt ? formatDate(member.joinedAt) : '—'}
      </td>
    </tr>
  )
}

// ── Settings tab ───────────────────────────────────────────────────────────────

function OrgSettingsTab({ orgId, org }: { orgId: string; org: OrgListItem }) {
  return (
    <div className="space-y-8">
      {/* Government Verification */}
      <section>
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">
          {t('orgs.settings.govVerification.title')}
        </h3>
        <GovVerificationSection orgId={orgId} org={org} />
      </section>

      {/* Pending invites */}
      <section>
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">
          {t('orgs.settings.pendingInvites')}
        </h3>
        <OrgInvitesPanel orgId={orgId} />
      </section>

      {/* Editable org metadata */}
      <section>
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">
          {t('orgs.settings.registration')}
        </h3>
        <OrgMetadataForm org={org} />
      </section>
    </div>
  )
}

// ── Government Verification section ──────────────────────────────────────────

function GovVerificationSection({ orgId, org }: { orgId: string; org: OrgListItem }) {
  const queryClient = useQueryClient()
  const { hasServerPermission } = usePermission()
  const canWrite = hasServerPermission('org.settings.update')

  const [optimisticValue, setOptimisticValue] = useState<boolean | null>(null)
  // Use optimistic local state when available; fall back to server value.
  const currentValue = optimisticValue ?? (org.governmentVerificationEnabled ?? false)

  const mutation = useMutation({
    mutationFn: (enabled: boolean) =>
      updateOrgSettings(orgId, { governmentVerificationEnabled: enabled }),
    onMutate: (enabled) => {
      // Optimistic update: reflect the new value immediately in the UI.
      setOptimisticValue(enabled)
    },
    onSuccess: () => {
      // Clear optimistic override and let the cache provide truth.
      setOptimisticValue(null)
      void queryClient.invalidateQueries({ queryKey: ['platform', 'organizations'] })
      toast.success(t('orgs.settings.govVerification.saved'))
    },
    onError: () => {
      // Roll back optimistic value on failure.
      setOptimisticValue(null)
      toast.error(t('orgs.settings.govVerification.saveError'))
    },
  })

  const helperKey = currentValue
    ? 'orgs.settings.govVerification.helperOn'
    : 'orgs.settings.govVerification.helperOff'

  return (
    <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] max-w-xl">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[var(--text-primary)]">
            {t('orgs.settings.govVerification.label')}
          </p>
          <p className="mt-1 text-xs text-[var(--text-secondary)] leading-relaxed">
            {t(helperKey)}
          </p>
        </div>
        <Toggle
          checked={currentValue}
          onChange={(enabled) => mutation.mutate(enabled)}
          disabled={!canWrite || mutation.isPending}
          loading={mutation.isPending}
          size="md"
        />
      </div>
      {!canWrite && (
        <p className="mt-3 text-xs text-[var(--text-tertiary)] flex items-center gap-1.5">
          <Shield className="h-3.5 w-3.5 shrink-0" />
          {t('orgs.settings.govVerification.readOnly')}
        </p>
      )}
    </div>
  )
}

function OrgInvitesPanel({ orgId }: { orgId: string }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['platform', 'organizations', orgId, 'invites'],
    queryFn: () => listOrgInvites(orgId),
    staleTime: 30_000,
  })

  if (isLoading) return <Skeleton variant="list" />

  if (error) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
        <AlertCircle className="h-4 w-4 text-rose-500" />
        {t('orgs.settings.invites.error')}
        <button
          onClick={() => void refetch()}
          className="underline text-[var(--text-primary)]"
        >
          {t('common.retry')}
        </button>
      </div>
    )
  }

  const invites = data ?? []

  if (invites.length === 0) {
    return (
      <p className="text-sm text-[var(--text-secondary)]">{t('orgs.settings.invites.empty')}</p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border-subtle)]">
      <table className="w-full text-sm" aria-label={t('orgs.settings.invites.tableLabel')}>
        <thead>
          <tr className="bg-[var(--surface-raised)] border-b border-[var(--border-subtle)]">
            <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">
              {t('orgs.settings.invites.col.recipient')}
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">
              {t('orgs.settings.invites.col.role')}
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">
              {t('orgs.settings.invites.col.status')}
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">
              {t('orgs.settings.invites.col.expires')}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-subtle)]">
          {invites.map(invite => (
            <InviteRow key={invite.inviteId} invite={invite} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

const INVITE_STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  ACCEPTED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  REVOKED: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
  EXPIRED: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300',
}

function InviteRow({ invite }: { invite: OrgInvite }) {
  const recipient = invite.email ?? '—'
  // Backend sends lowercase status ("pending" | "expired" | …); normalise for styling/labels.
  const status = invite.status.toUpperCase()
  const statusStyle =
    INVITE_STATUS_STYLES[status] ??
    'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'
  const now = Date.now()
  const expiresMs = new Date(invite.expiresAt).getTime()
  const isExpiringSoon = status === 'PENDING' && expiresMs - now < 24 * 60 * 60 * 1000

  return (
    <tr className="bg-[var(--surface-default)] hover:bg-[var(--surface-raised)] transition-colors">
      <td className="px-4 py-3 text-[var(--text-primary)]">{recipient}</td>
      <td className="px-4 py-3">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
          {invite.role}
        </span>
      </td>
      <td className="px-4 py-3">
        <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', statusStyle)}>
          {status}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5 text-sm">
          {isExpiringSoon && (
            <Clock className="h-3.5 w-3.5 text-amber-500 shrink-0" />
          )}
          <span className={cn(
            isExpiringSoon ? 'text-amber-600 dark:text-amber-400' : 'text-[var(--text-secondary)]'
          )}>
            {formatDate(invite.expiresAt)}
          </span>
        </div>
      </td>
    </tr>
  )
}

function OrgMetadataForm({ org }: { org: OrgListItem }) {
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

      {/* Read-only metadata summary */}
      <div className="pt-2 border-t border-[var(--border-subtle)]">
        <dl className="grid grid-cols-2 gap-y-2 gap-x-6 text-sm">
          <div>
            <dt className="text-[var(--text-tertiary)]">{t('orgs.col.created')}</dt>
            <dd className="text-[var(--text-primary)]">{formatDate(org.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-[var(--text-tertiary)]">{t('orgs.stat.type')}</dt>
            <dd className="text-[var(--text-primary)]">{org.businessType ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-[var(--text-tertiary)]">{t('orgs.stat.gst')}</dt>
            <dd className="text-[var(--text-primary)]">{org.isGstRegistered ? t('common.yes') : t('common.no')}</dd>
          </div>
        </dl>
      </div>

      <Button variant="primary" onClick={handleSave}>{t('common.saveChanges')}</Button>
    </div>
  )
}
