/**
 * StaffTab — design Screen 87 (Staff List).
 * SnapAccount internal-staff roster with live queue load + activity, plus row
 * actions: View profile (→ /team/staff/:id), Edit role (reuses EditUserDialog), and
 * Deactivate / Reactivate (reversible access lock). Mutating actions are gated by
 * platform.admins.invite; View is always available.
 * Shares the workload-grid query with WorkloadTab (TanStack cache).
 */
import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import { t } from '@/i18n'
import { Search, UserPlus, Eye, Pencil, Ban, CheckCircle } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { DataTable } from '@/components/ui/DataTable'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { Dialog } from '@/components/ui/Dialog'
import { RoleChip } from '@/components/ui/RoleChip'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { EditUserDialog } from '@/components/shared/EditUserDialog'
import { getStaffWorkloadGrid, loadLevel, type StaffWorkloadRow } from '@/lib/staffApi'
import { setAdminUserActive, type AdminUserApiErrorCode } from '@/lib/userAdminApi'
import { usePermission } from '@/hooks/usePermission'
import type { AdminRole } from '@/hooks/useAuth'
import { cn, getInitials } from '@/lib/utils'
import { LOAD_BADGE } from './workloadColors'

interface StaffTabProps {
  onInvite: () => void
}

/** Target of a pending deactivate/reactivate confirmation. */
interface ActiveTarget {
  userId: string
  name: string
  /** The state we are transitioning TO. */
  nextActive: boolean
}

export function StaffTab({ onInvite }: StaffTabProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { hasServerPermission } = usePermission()
  const [search, setSearch] = useState('')
  const [editUserId, setEditUserId] = useState<string | null>(null)
  const [activeTarget, setActiveTarget] = useState<ActiveTarget | null>(null)

  const canManage = hasServerPermission('platform.admins.invite')

  const { data, isLoading } = useQuery({
    queryKey: ['staff', 'workload-grid'],
    queryFn: getStaffWorkloadGrid,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  const setActiveMutation = useMutation({
    mutationFn: ({ userId, nextActive }: ActiveTarget) => setAdminUserActive(userId, nextActive),
    onSuccess: (_, target) => {
      toast.success(target.nextActive
        ? t('team.staff.reactivated', { name: target.name })
        : t('team.staff.deactivated', { name: target.name }))
      setActiveTarget(null)
      void queryClient.invalidateQueries({ queryKey: ['staff', 'workload-grid'] })
    },
    onError: (err: unknown) => {
      const code = (err as { response?: { data?: { code?: string } } })?.response?.data?.code as AdminUserApiErrorCode | undefined
      if (code === 'User.SelfDelete') toast.error(t('team.staff.err.self'))
      else if (code === 'User.LastAdmin') toast.error(t('team.staff.err.lastAdmin'))
      else toast.error(t('team.staff.err.generic'))
      setActiveTarget(null)
    },
  })

  const rows = data?.rows ?? []
  const filtered = useMemo(() => {
    if (!search) return rows
    const q = search.toLowerCase()
    return rows.filter(r =>
      r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q))
  }, [rows, search])

  const columns: ColumnDef<StaffWorkloadRow>[] = [
    {
      id: 'member',
      header: t('team.staff.col.member'),
      cell: ({ row: r }) => (
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-[var(--brand-primary)] text-white flex items-center justify-center text-sm font-bold shrink-0">
            {getInitials(r.original.name || r.original.email)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--text-primary)] truncate">{r.original.name}</p>
            <p className="text-xs text-[var(--text-tertiary)] truncate">{r.original.email}</p>
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'role',
      header: t('team.staff.col.role'),
      cell: ({ getValue }) => <RoleChip role={getValue() as AdminRole} />,
    },
    {
      accessorKey: 'status',
      header: t('team.staff.col.status'),
      cell: ({ getValue }) => {
        const status = getValue() as string
        return (
          <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium',
            status === 'active'
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
              : 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
          )}>
            {status === 'active'
              ? t('team.staff.status.active')
              : t('team.staff.status.suspended')}
          </span>
        )
      },
    },
    {
      id: 'queue',
      header: t('team.staff.col.queue'),
      cell: ({ row: r }) => {
        const level = loadLevel(r.original.totalAssigned)
        const badge = LOAD_BADGE[level]
        return (
          <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums', badge.className)}>
            <span className={cn('h-1.5 w-1.5 rounded-full', badge.dot)} aria-hidden="true" />
            {r.original.totalAssigned}
          </span>
        )
      },
    },
    {
      id: 'completed',
      header: t('team.staff.col.completed'),
      cell: ({ row: r }) => (
        <span className="text-sm text-[var(--text-secondary)] tabular-nums">{r.original.totalCompleted}</span>
      ),
    },
    {
      id: 'lastActive',
      header: t('team.staff.col.lastActive'),
      cell: ({ row: r }) => (
        <span className="text-sm text-[var(--text-secondary)]">
          {r.original.lastActiveAt
            ? formatDistanceToNow(new Date(r.original.lastActiveAt), { addSuffix: true })
            : t('team.staff.never')}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row: r }) => {
        const isActive = r.original.status === 'active'
        return (
          <div className="flex gap-1.5 justify-end" onClick={e => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void navigate(`/team/staff/${r.original.userId}`)}
              aria-label={t('team.staff.action.view')}
              title={t('team.staff.action.view')}
            >
              <Eye className="h-4 w-4 text-[var(--text-tertiary)]" />
            </Button>
            {canManage && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditUserId(r.original.userId)}
                  aria-label={t('team.staff.action.editRole')}
                  title={t('team.staff.action.editRole')}
                >
                  <Pencil className="h-4 w-4 text-[var(--text-tertiary)]" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveTarget({ userId: r.original.userId, name: r.original.name, nextActive: !isActive })}
                  aria-label={isActive ? t('team.staff.action.deactivate') : t('team.staff.action.reactivate')}
                  title={isActive ? t('team.staff.action.deactivate') : t('team.staff.action.reactivate')}
                >
                  {isActive
                    ? <Ban className="h-4 w-4 text-amber-500" />
                    : <CheckCircle className="h-4 w-4 text-emerald-500" />}
                </Button>
              </>
            )}
          </div>
        )
      },
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('team.staff.search')}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border bg-[var(--surface-sunken)] border-[var(--border-default)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]"
          />
        </div>
        <Button variant="primary" size="sm" onClick={onInvite}>
          <UserPlus className="h-4 w-4 mr-1" />
          {t('team.staff.invite')}
        </Button>
      </div>

      <ErrorBoundary scope="pane">
        {isLoading ? (
          <Skeleton variant="list" />
        ) : filtered.length === 0 ? (
          <EmptyState
            variant="team"
            title={t('team.staff.empty')}
            primaryCta={{ label: t('team.staff.invite'), onPress: onInvite }}
          />
        ) : (
          <DataTable data={filtered} columns={columns} pageSize={25} />
        )}
      </ErrorBoundary>

      {/* Edit role / permissions — reuses the shared admin user editor */}
      <EditUserDialog
        open={editUserId !== null}
        userId={editUserId}
        onClose={() => {
          setEditUserId(null)
          void queryClient.invalidateQueries({ queryKey: ['staff', 'workload-grid'] })
        }}
      />

      {/* Deactivate / reactivate confirmation */}
      <Dialog
        open={activeTarget !== null}
        onClose={() => setActiveTarget(null)}
        title={activeTarget?.nextActive
          ? t('team.staff.reactivate.title')
          : t('team.staff.deactivate.title')}
        description={activeTarget?.nextActive
          ? t('team.staff.reactivate.desc')
          : t('team.staff.deactivate.desc')}
        footer={
          <>
            <Button
              variant={activeTarget?.nextActive ? 'primary' : 'danger'}
              onClick={() => activeTarget && setActiveMutation.mutate(activeTarget)}
              loading={setActiveMutation.isPending}
            >
              {activeTarget?.nextActive
                ? t('team.staff.action.reactivate')
                : t('team.staff.action.deactivate')}
            </Button>
            <Button variant="ghost" onClick={() => setActiveTarget(null)}>
              {t('common.cancel')}
            </Button>
          </>
        }
      >
        {activeTarget && (
          <p className="text-sm text-[var(--text-secondary)] py-1">
            <strong className="text-[var(--text-primary)]">{activeTarget.name}</strong>
          </p>
        )}
      </Dialog>
    </div>
  )
}
