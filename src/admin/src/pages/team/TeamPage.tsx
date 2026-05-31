/**
 * TeamPage — Phase 6F Track F3
 * Invite, role assignment (RoleChip), workload view.
 * Role: ADMIN + OPERATIONS_MANAGER.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  UserPlus, Search, Mail,
  Ban, CheckCircle, Trash2, Shield,
  Users2, LayoutGrid, BarChart3,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Tabs, TabList, TabTrigger, TabPanels, TabPanel } from '@/components/ui/Tabs'
import { DataTable } from '@/components/ui/DataTable'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { Dialog } from '@/components/ui/Dialog'
import { RoleChip } from '@/components/ui/RoleChip'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import {
  listTeamMembers, inviteTeamMember, suspendTeamMember,
  reactivateTeamMember, removeTeamMember, listPendingInvites,
  resendInvite, revokeInvite,
  type TeamMember, type PendingInvite,
} from '@/lib/teamApi'
import type { AdminRole } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { format, formatDistanceToNow } from 'date-fns'
import type { ColumnDef } from '@tanstack/react-table'
import { getInitials } from '@/lib/utils'
import { StaffTab } from './StaffTab'
import { WorkloadTab } from './WorkloadTab'
import { KpiTab } from './KpiTab'

const ROLE_OPTIONS: AdminRole[] = ['SUPER_ADMIN', 'OPERATIONS_MANAGER', 'CA', 'SUPPORT_EXECUTIVE', 'DATA_ENTRY_OPERATOR', 'PARTNER_BANK_REP']
const MODULE_OPTIONS = ['GST', 'ITR', 'Loans', 'Reports', 'Documents']

export default function TeamPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [showInvite, setShowInvite] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const { data: membersData, isLoading: membersLoading } = useQuery({
    queryKey: ['team', 'members'],
    queryFn: () => listTeamMembers({ pageSize: 100 }),
    staleTime: 60_000,
  })

  const { data: invites, isLoading: invitesLoading } = useQuery({
    queryKey: ['team', 'invites'],
    queryFn: listPendingInvites,
    staleTime: 60_000,
  })

  const suspendMutation = useMutation({
    mutationFn: suspendTeamMember,
    onSuccess: () => {
      toast.success(t('team.memberSuspended', 'Member suspended'))
      void queryClient.invalidateQueries({ queryKey: ['team', 'members'] })
    },
  })

  const reactivateMutation = useMutation({
    mutationFn: reactivateTeamMember,
    onSuccess: () => {
      toast.success(t('team.memberReactivated', 'Member reactivated'))
      void queryClient.invalidateQueries({ queryKey: ['team', 'members'] })
    },
  })

  const removeMutation = useMutation({
    mutationFn: removeTeamMember,
    onSuccess: () => {
      toast.success(t('team.memberRemoved', 'Member removed'))
      void queryClient.invalidateQueries({ queryKey: ['team', 'members'] })
    },
    onError: () => toast.error(t('team.removeError', 'Failed to remove member')),
  })

  const members = membersData?.items ?? []
  const filtered = members.filter(m => {
    if (!searchQuery) return true
    return (
      m.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.displayName?.toLowerCase() ?? '').includes(searchQuery.toLowerCase())
    )
  })

  const memberColumns: ColumnDef<TeamMember>[] = [
    {
      id: 'member',
      header: 'Member',
      cell: ({ row: r }) => (
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-[var(--brand-primary)] text-white flex items-center justify-center text-sm font-bold shrink-0">
            {getInitials(r.original.displayName ?? r.original.email)}
          </div>
          <div>
            <p className="text-sm font-medium text-[var(--text-primary)]">{r.original.displayName ?? r.original.email}</p>
            <p className="text-xs text-[var(--text-tertiary)]">{r.original.email}</p>
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'role',
      header: 'Role',
      cell: ({ getValue }) => <RoleChip role={getValue() as AdminRole} />,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ getValue }) => {
        const status = getValue() as string
        return (
          <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium',
            status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' :
            status === 'suspended' ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300' :
            'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
          )}>
            {status}
          </span>
        )
      },
    },
    {
      accessorKey: 'joinedAt',
      header: 'Joined',
      cell: ({ getValue }) => (
        <span className="text-sm text-[var(--text-secondary)]">
          {getValue() ? format(new Date(getValue() as string), 'dd/MM/yyyy') : '—'}
        </span>
      ),
    },
    {
      accessorKey: 'lastActiveAt',
      header: 'Last active',
      cell: ({ getValue }) => (
        <span className="text-sm text-[var(--text-secondary)]">
          {getValue() ? formatDistanceToNow(new Date(getValue() as string), { addSuffix: true }) : '—'}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row: r }) => (
        <div className="flex gap-1.5">
          {r.original.status === 'active' ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => suspendMutation.mutate(r.original.userId)}
              aria-label={t('team.suspend', 'Suspend')}
            >
              <Ban className="h-4 w-4 text-amber-500" />
            </Button>
          ) : r.original.status === 'suspended' ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => reactivateMutation.mutate(r.original.userId)}
              aria-label={t('team.reactivate', 'Reactivate')}
            >
              <CheckCircle className="h-4 w-4 text-emerald-500" />
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => removeMutation.mutate(r.original.userId)}
            aria-label={t('team.remove', 'Remove')}
          >
            <Trash2 className="h-4 w-4 text-rose-500" />
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title={t('team.title', 'Team')}
          subtitle={t('team.subtitle', 'Manage team members, roles, and workload distribution.')}
        />
        <Button variant="primary" onClick={() => setShowInvite(true)}>
          <UserPlus className="h-4 w-4 mr-1" />
          {t('team.invite', 'Invite Teammate')}
        </Button>
      </div>

      <Tabs defaultTab="members">
        <TabList>
          <TabTrigger id="members" badge={members.length}>
            {t('team.tab.members', 'Members')}
          </TabTrigger>
          <TabTrigger id="invites" badge={invites?.filter(i => i.status === 'pending').length}>
            {t('team.tab.invites', 'Invites')}
          </TabTrigger>
          <TabTrigger id="roles">
            {t('team.tab.roles', 'Roles')}
          </TabTrigger>
          <TabTrigger id="staff">
            <Users2 className="h-4 w-4 mr-1 inline-block align-text-bottom" aria-hidden="true" />
            {t('team.tab.staff', 'Staff')}
          </TabTrigger>
          <TabTrigger id="workload">
            <LayoutGrid className="h-4 w-4 mr-1 inline-block align-text-bottom" aria-hidden="true" />
            {t('team.tab.workload', 'Workload')}
          </TabTrigger>
          <TabTrigger id="kpis">
            <BarChart3 className="h-4 w-4 mr-1 inline-block align-text-bottom" aria-hidden="true" />
            {t('team.tab.kpis', 'KPIs')}
          </TabTrigger>
        </TabList>

        <TabPanels className="mt-6">
          {/* Members tab */}
          <TabPanel id="members">
            <div className="mb-4">
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder={t('team.search', 'Search by name or email…')}
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border bg-[var(--surface-sunken)] border-[var(--border-default)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]"
                />
              </div>
            </div>

            <ErrorBoundary scope="pane">
              {membersLoading ? (
                <Skeleton variant="list" />
              ) : filtered.length === 0 ? (
                <EmptyState
                  variant="team"
                  primaryCta={{ label: t('team.inviteFirst', 'Invite your first teammate'), onPress: () => setShowInvite(true) }}
                />
              ) : (
                <DataTable
                  data={filtered}
                  columns={memberColumns}
                  pageSize={25}
                />
              )}
            </ErrorBoundary>
          </TabPanel>

          {/* Invites tab */}
          <TabPanel id="invites">
            <ErrorBoundary scope="pane">
              {invitesLoading ? (
                <Skeleton variant="dataTableDense" />
              ) : !invites?.length ? (
                <EmptyState
                  variant="team"
                  title={t('team.noInvites', 'No pending invites')}
                  primaryCta={{ label: t('team.invite', 'Invite Teammate'), onPress: () => setShowInvite(true) }}
                />
              ) : (
                <InvitesTable invites={invites} onRefresh={() => queryClient.invalidateQueries({ queryKey: ['team', 'invites'] })} />
              )}
            </ErrorBoundary>
          </TabPanel>

          {/* Roles tab */}
          <TabPanel id="roles">
            <div className="space-y-4">
              {ROLE_OPTIONS.map(role => (
                <div key={role} className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)]">
                  <div className="flex items-center gap-3 mb-2">
                    <Shield className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden="true" />
                    <RoleChip role={role} size="md" />
                  </div>
                  <p className="text-sm text-[var(--text-secondary)]">
                    {ROLE_DESCRIPTIONS[role]}
                  </p>
                </div>
              ))}
            </div>
          </TabPanel>

          {/* Staff tab — design Screen 87 */}
          <TabPanel id="staff">
            <StaffTab onInvite={() => setShowInvite(true)} />
          </TabPanel>

          {/* Workload tab — design Screen 89 */}
          <TabPanel id="workload">
            <WorkloadTab />
          </TabPanel>

          {/* KPI tab — design Screen 90 */}
          <TabPanel id="kpis">
            <KpiTab />
          </TabPanel>
        </TabPanels>
      </Tabs>

      {/* Invite dialog */}
      <InviteDialog
        open={showInvite}
        onClose={() => setShowInvite(false)}
        onSent={() => {
          void queryClient.invalidateQueries({ queryKey: ['team', 'invites'] })
          setShowInvite(false)
        }}
      />
    </div>
  )
}

// ── Role descriptions ─────────────────────────────────────────────────────────
const ROLE_DESCRIPTIONS: Record<AdminRole, string> = {
  SUPER_ADMIN: 'Full access to all modules, settings, team management, and subscriptions.',
  OPERATIONS_MANAGER: 'Access to all operations: callbacks, chat, reports, and team management.',
  CA: 'Chartered Accountant — access to ITR review, GST notices, chat, and reports.',
  SUPPORT_EXECUTIVE: 'Support access — callbacks, chat, documents, and user management.',
  DATA_ENTRY_OPERATOR: 'Data entry access — documents and basic operations.',
  PARTNER_BANK_REP: 'Partner bank access — view loan applications and bank communications.',
}

// ── Invites table ─────────────────────────────────────────────────────────────
function InvitesTable({ invites, onRefresh }: { invites: PendingInvite[]; onRefresh: () => void }) {
  const { t } = useTranslation()

  const resendMutation = useMutation({
    mutationFn: resendInvite,
    onSuccess: () => toast.success(t('team.inviteResent', 'Invitation resent')),
  })

  const revokeMutation = useMutation({
    mutationFn: revokeInvite,
    onSuccess: () => { toast.success(t('team.inviteRevoked', 'Invitation revoked')); onRefresh() },
  })

  return (
    <div className="space-y-2">
      {invites.map(invite => (
        <div
          key={invite.inviteId}
          className="flex items-center gap-4 px-4 py-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)]"
        >
          <Mail className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[var(--text-primary)] truncate">{invite.email}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <RoleChip role={invite.role as AdminRole} size="sm" />
              <span className="text-xs text-[var(--text-tertiary)]">
                Expires {formatDistanceToNow(new Date(invite.expiresAt), { addSuffix: true })}
              </span>
            </div>
          </div>
          <div className="flex gap-1.5 shrink-0">
            {invite.status === 'pending' && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => resendMutation.mutate(invite.inviteId)}
                  loading={resendMutation.isPending}
                >
                  {t('team.resend', 'Resend')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => revokeMutation.mutate(invite.inviteId)}
                  loading={revokeMutation.isPending}
                >
                  <Trash2 className="h-4 w-4 text-rose-500" />
                </Button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Invite dialog ─────────────────────────────────────────────────────────────
interface InviteDialogProps {
  open: boolean
  onClose: () => void
  onSent: () => void
}

function InviteDialog({ open, onClose, onSent }: InviteDialogProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<AdminRole>('CA')
  const [modules, setModules] = useState<string[]>([])

  const inviteMutation = useMutation({
    mutationFn: () => inviteTeamMember({ name, email, role, modules }),
    onSuccess: () => {
      toast.success(t('team.inviteSent', 'Invitation sent!'))
      onSent()
    },
    onError: () => toast.error(t('team.inviteError', 'Failed to send invitation')),
  })

  const toggleModule = (mod: string) => {
    setModules(prev => prev.includes(mod) ? prev.filter(m => m !== mod) : [...prev, mod])
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('team.inviteTitle', 'Invite Teammate')}
      description={t('team.inviteDesc', 'Send an invitation with a 72-hour magic link.')}
      size="lg"
      footer={
        <>
          <Button
            variant="primary"
            onClick={() => inviteMutation.mutate()}
            loading={inviteMutation.isPending}
            disabled={!name || !email}
          >
            {t('team.sendInvite', 'Send invitation')}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel', 'Cancel')}
          </Button>
        </>
      }
    >
      <div className="space-y-4 py-2">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
              {t('team.name', 'Name')} *
            </label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Riya Sharma"
              className="w-full px-3 py-2 rounded-lg border bg-[var(--surface-sunken)] border-[var(--border-default)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
              {t('team.email', 'Email')} *
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="riya@firm.com"
              className="w-full px-3 py-2 rounded-lg border bg-[var(--surface-sunken)] border-[var(--border-default)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
            {t('team.role', 'Role')} *
          </label>
          <div className="grid grid-cols-2 gap-2">
            {ROLE_OPTIONS.slice(1).map(r => (
              <label
                key={r}
                className={cn(
                  'flex items-start gap-2 p-3 rounded-lg border cursor-pointer transition-colors',
                  role === r
                    ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)]/5'
                    : 'border-[var(--border-default)] hover:border-[var(--border-strong)]'
                )}
              >
                <input
                  type="radio"
                  name="role"
                  value={r}
                  checked={role === r}
                  onChange={() => setRole(r)}
                  className="mt-0.5"
                />
                <div>
                  <RoleChip role={r} size="sm" />
                  <p className="text-xs text-[var(--text-tertiary)] mt-1">{ROLE_DESCRIPTIONS[r].slice(0, 60)}…</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {(role === 'CA' || role === 'SUPPORT_EXECUTIVE') && (
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
              {t('team.modules', 'Module Access')}
            </label>
            <div className="flex flex-wrap gap-2">
              {MODULE_OPTIONS.map(mod => (
                <button
                  key={mod}
                  type="button"
                  onClick={() => toggleModule(mod)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
                    modules.includes(mod)
                      ? 'bg-[var(--brand-primary)] text-white'
                      : 'bg-[var(--surface-sunken)] text-[var(--text-secondary)] border border-[var(--border-default)]'
                  )}
                >
                  {mod}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  )
}
