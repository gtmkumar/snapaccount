import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { type ColumnDef } from '@tanstack/react-table'
import { toast } from 'sonner'
import { Search, Download, UserPlus, Pencil, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { DataTable } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'
import { getInitials, getAvatarColor } from '@/lib/utils'
import { cn } from '@/lib/utils'
import {
  listAdminUsers, deleteAdminUser,
  type AdminUserListItem, type AdminUserApiErrorCode,
} from '@/lib/userAdminApi'
import { AddUserDialog } from '@/components/shared/AddUserDialog'
import { EditUserDialog } from '@/components/shared/EditUserDialog'
import { AccessDeniedState } from '@/components/shared/AccessDeniedState'
import { isForbiddenError } from '@/lib/apiError'
import { usePermission } from '@/hooks/usePermission'
import { t } from '@/i18n'

// Customer user-type display labels (staff/org-member types never appear on this
// list — the backend now lists only real customers: business owners + employees).
function formatUserType(code?: string | null): string {
  switch (code) {
    case 'BUSINESS_OWNER': return 'Business Owner'
    case 'EMPLOYEE': return 'Employee'
    default: return '—'
  }
}

// A listed customer either owns a business (→ Business Owner) or carries an explicit
// customer type. When the explicit type is missing but they own an organisation, show
// "Business Owner" rather than a bare "—".
function displayUserType(user: AdminUserListItem): string {
  if (user.userType) return formatUserType(user.userType)
  if (user.organizationId || user.businessName) return 'Business Owner'
  return '—'
}

function buildUserColumns(
  navigate: ReturnType<typeof useNavigate>,
  onSuspendRequest: (user: AdminUserListItem) => void,
  onEdit: (user: AdminUserListItem) => void,
  onDelete: (user: AdminUserListItem) => void,
  canManage: boolean,
): ColumnDef<AdminUserListItem>[] {
  return [
    {
      accessorKey: 'name',
      header: 'User',
      cell: ({ row }) => {
        const initials = getInitials(row.original.name)
        const bgColor = getAvatarColor(row.original.name)
        return (
          <div className="flex items-center gap-3">
            <div className={cn('h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0', bgColor)}>
              {initials}
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-800">{row.original.name}</p>
              <p className="text-xs text-neutral-400">{row.original.email ?? '—'}</p>
            </div>
          </div>
        )
      },
    },
    {
      accessorKey: 'phone',
      header: 'Phone',
      cell: ({ row }) => row.original.phone ? (
        <a href={`tel:${row.original.phone}`} className="text-sm text-brand-600 hover:underline font-mono">
          {row.original.phone}
        </a>
      ) : <span className="text-sm text-neutral-400">—</span>,
    },
    {
      accessorKey: 'userType',
      header: 'User Type',
      cell: ({ row }) => <span className="text-sm text-neutral-600">{displayUserType(row.original)}</span>,
    },
    {
      accessorKey: 'businessName',
      header: 'Business',
      cell: ({ row }) => (
        <div>
          <p className="text-sm text-neutral-700">{row.original.businessName ?? '—'}</p>
          {row.original.gstin && (
            <p className="text-xs text-neutral-400 font-mono">{row.original.gstin}</p>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'state',
      header: 'State',
      cell: ({ row }) => <span className="text-sm text-neutral-600">{row.original.state ?? '—'}</span>,
    },
    {
      accessorKey: 'isActive',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? 'success' : 'error'} size="sm" dot>
          {row.original.isActive ? 'Active' : 'Suspended'}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void navigate(`/users/${row.original.id}`)}
          >
            View
          </Button>
          {canManage && (
            <>
              <Button
                variant="ghost"
                size="sm"
                aria-label={t('users.editUser.cta')}
                title={t('users.editUser.cta')}
                onClick={() => onEdit(row.original)}
                leftIcon={<Pencil className="h-4 w-4" />}
              />
              <Button
                variant="ghost"
                size="sm"
                className="text-error-600 hover:bg-error-50"
                aria-label={t('users.deleteUser.cta')}
                title={t('users.deleteUser.cta')}
                onClick={() => onDelete(row.original)}
                leftIcon={<Trash2 className="h-4 w-4" />}
              />
            </>
          )}
          {!canManage && row.original.isActive && (
            <Button
              variant="ghost"
              size="sm"
              className="text-warning-600 hover:bg-warning-50"
              onClick={() => onSuspendRequest(row.original)}
            >
              Suspend
            </Button>
          )}
        </div>
      ),
    },
  ]
}

export default function UserListPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { hasServerPermission } = usePermission()
  const [globalFilter, setGlobalFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'' | 'active' | 'suspended'>('')
  const [userTypeFilter, setUserTypeFilter] = useState<'' | 'BUSINESS_OWNER' | 'EMPLOYEE'>('')
  const [suspendTarget, setSuspendTarget] = useState<AdminUserListItem | null>(null)
  const [editTarget, setEditTarget] = useState<AdminUserListItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AdminUserListItem | null>(null)
  const [showAddUser, setShowAddUser] = useState(false)
  const [page, setPage] = useState(1)
  const pageSize = 20

  // Gate the Add User button by platform.admins.invite OR org.members.invite
  const canAddUser = hasServerPermission('platform.admins.invite') || hasServerPermission('org.members.invite')
  const canInvitePlatform = hasServerPermission('platform.admins.invite')
  // Edit/Delete require platform.admins.invite (server-enforced on PUT/DELETE)
  const canManageUsers = hasServerPermission('platform.admins.invite')

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAdminUser(id),
    onSuccess: (_, id) => {
      toast.success(t('users.deleteUser.success', { name: deleteTarget?.name ?? '' }))
      setDeleteTarget(null)
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      void queryClient.invalidateQueries({ queryKey: ['admin-user-detail', id] })
    },
    onError: (err: unknown) => {
      const code = (err as { response?: { data?: { code?: string } } })?.response?.data?.code as AdminUserApiErrorCode | undefined
      if (code === 'User.SelfDelete') toast.error(t('users.deleteUser.err.self'))
      else if (code === 'User.LastAdmin') toast.error(t('users.deleteUser.err.lastAdmin'))
      else toast.error(t('users.deleteUser.err.generic'))
      setDeleteTarget(null)
    },
  })

  const columns = useMemo(
    () => buildUserColumns(
      navigate,
      (user) => setSuspendTarget(user),
      (user) => setEditTarget(user),
      (user) => setDeleteTarget(user),
      canManageUsers,
    ),
    [navigate, canManageUsers],
  )

  // Server-side search + status filter; debounce omitted for simplicity (fires on every keystroke,
  // 5-min staleTime + keepPreviousData masks the latency).
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-users', { page, pageSize, search: globalFilter, statusFilter, userTypeFilter }],
    queryFn: () => listAdminUsers({
      page,
      pageSize,
      search: globalFilter || undefined,
      isActive: statusFilter === 'active' ? true : statusFilter === 'suspended' ? false : undefined,
      userType: userTypeFilter || undefined,
    }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })

  const forbidden = isForbiddenError(error)
  const items = data?.items ?? []
  const totalCount = data?.totalCount ?? 0

  return (
    <div className="space-y-5">
      <PageHeader
        title="Users"
        subtitle={`${totalCount} customer${totalCount === 1 ? '' : 's'} (SME owners & employees) — internal staff live under Team`}
        actions={
          <>
            <Button variant="secondary" size="sm" leftIcon={<Download className="h-4 w-4" />}>
              Export
            </Button>
            {canAddUser && (
              <Button
                variant="primary"
                size="sm"
                leftIcon={<UserPlus className="h-4 w-4" />}
                onClick={() => setShowAddUser(true)}
              >
                {t('users.addUser.cta')}
              </Button>
            )}
          </>
        }
      />

      {/* Inline delete confirmation banner */}
      {deleteTarget && (
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 flex items-center justify-between">
          <span className="text-rose-800 font-medium text-sm">
            {t('users.deleteUser.confirm', { name: deleteTarget.name })}
          </span>
          <div className="flex gap-2 ml-4">
            <Button variant="secondary" size="sm" onClick={() => setDeleteTarget(null)} disabled={deleteMutation.isPending}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="bg-rose-600 text-white hover:bg-rose-700"
              loading={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate(deleteTarget.id)}
            >
              {t('users.deleteUser.confirmCta')}
            </Button>
          </div>
        </div>
      )}

      {/* Inline suspension confirmation banner */}
      {suspendTarget && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center justify-between">
          <span className="text-amber-800 font-medium text-sm">
            Suspend <strong>{suspendTarget.name}</strong>? They will lose access to the platform immediately.
          </span>
          <div className="flex gap-2 ml-4">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setSuspendTarget(null)}
            >
              Cancel
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="bg-amber-600 text-white hover:bg-amber-700"
              onClick={() => {
                toast.warning(`${suspendTarget.name} has been suspended`)
                setSuspendTarget(null)
              }}
            >
              Confirm Suspend
            </Button>
          </div>
        </div>
      )}

      <Card padding="sm">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="w-72">
            <Input
              placeholder="Search by name, phone, email, business, GSTIN…"
              value={globalFilter}
              onChange={(e) => { setGlobalFilter(e.target.value); setPage(1) }}
              prefix={<Search className="h-4 w-4" />}
              size="sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-500 block mb-1">User Type</label>
            <select
              value={userTypeFilter}
              onChange={(e) => {
                setUserTypeFilter(e.target.value as '' | 'BUSINESS_OWNER' | 'EMPLOYEE')
                setPage(1)
              }}
              className="h-9 rounded-lg border border-neutral-300 bg-white text-sm px-3 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none"
              aria-label="Filter by User Type"
            >
              <option value="">All Types</option>
              <option value="BUSINESS_OWNER">Business Owner</option>
              <option value="EMPLOYEE">Employee</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-500 block mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as '' | 'active' | 'suspended')
                setPage(1)
              }}
              className="h-9 rounded-lg border border-neutral-300 bg-white text-sm px-3 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none"
              aria-label="Filter by Status"
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>
        </div>
      </Card>

      {forbidden ? (
        <AccessDeniedState description={t('users.list.forbidden')} />
      ) : (
        <DataTable
          data={items}
          columns={columns}
          loading={isLoading}
          onRowClick={(row) => void navigate(`/users/${row.id}`)}
        />
      )}

      {/* Pagination */}
      {!forbidden && data && data.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-neutral-500">
            Page {data.page} of {data.totalPages} · {totalCount} users
          </span>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={!data.hasPreviousPage}
              onClick={() => setPage(p => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={!data.hasNextPage}
              onClick={() => setPage(p => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
      {/* Add User dialog — gated by platform.admins.invite / org.members.invite */}
      <AddUserDialog
        open={showAddUser}
        onClose={() => setShowAddUser(false)}
        canInvitePlatform={canInvitePlatform}
      />

      {/* Edit User dialog */}
      <EditUserDialog
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        userId={editTarget?.id ?? null}
      />
    </div>
  )
}
