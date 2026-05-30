/**
 * OrganizationsPage — Auth/RBAC Module 1 (SUPER_ADMIN)
 * Platform-level org list. Route: /admin/organizations
 * Gated: platform.orgs.read
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { t } from '@/i18n'
import { useNavigate } from 'react-router'
import { Plus, Search, MoreHorizontal, CheckCircle, PauseCircle } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { DataTable } from '@/components/ui/DataTable'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { Dialog } from '@/components/ui/Dialog'
import { cn, formatDate, isValidGSTIN, isValidPAN } from '@/lib/utils'
import { toast } from 'sonner'
import {
  listOrganizations, createOrganization, suspendOrganization,
  type OrgListItem,
} from '@/lib/rbacApi'
import type { ColumnDef } from '@tanstack/react-table'

export default function OrganizationsPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all')
  const [showCreate, setShowCreate] = useState(false)

  const isActiveParam = statusFilter === 'all' ? undefined : statusFilter === 'active'

  const { data, isLoading, error } = useQuery({
    queryKey: ['platform', 'organizations', { search, isActive: isActiveParam }],
    queryFn: () => listOrganizations({ search: search || undefined, isActive: isActiveParam, pageSize: 50 }),
    staleTime: 30_000,
  })

  const columns: ColumnDef<OrgListItem>[] = [
    {
      id: 'org',
      header: t('orgs.col.org'),
      cell: ({ row: r }) => (
        <button
          onClick={() => navigate(`/admin/organizations/${r.original.id}`)}
          className="flex items-center gap-3 text-left hover:underline"
        >
          <div className="h-8 w-8 rounded-lg bg-[var(--brand-primary)] text-white flex items-center justify-center text-xs font-bold shrink-0">
            {r.original.businessName.slice(0, 2).toUpperCase()}
          </div>
          <span className="text-sm font-medium text-[var(--text-primary)]">{r.original.businessName}</span>
        </button>
      ),
    },
    {
      accessorKey: 'gstin',
      header: t('orgs.col.gstin'),
      cell: ({ getValue }) => (
        <span className="font-mono text-xs text-[var(--text-secondary)]">
          {(getValue() as string | null) ?? '—'}
        </span>
      ),
    },
    {
      accessorKey: 'memberCount',
      header: t('orgs.col.members'),
      cell: ({ getValue }) => (
        <span className="text-sm text-[var(--text-secondary)]">{getValue() as number}</span>
      ),
    },
    {
      accessorKey: 'isActive',
      header: t('orgs.col.status'),
      cell: ({ getValue }) => {
        const active = getValue() as boolean
        return (
          <span className={cn(
            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
            active
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
              : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'
          )}>
            {active
              ? <><CheckCircle className="h-3 w-3" />{t('orgs.status.active')}</>
              : <><PauseCircle className="h-3 w-3" />{t('orgs.status.suspended')}</>
            }
          </span>
        )
      },
    },
    {
      accessorKey: 'createdAt',
      header: t('orgs.col.created'),
      cell: ({ getValue }) => (
        <span className="text-sm text-[var(--text-secondary)]">
          {formatDate(getValue() as string)}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row: r }) => (
        <OrgRowMenu org={r.original} />
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title={t('orgs.title')}
          subtitle={t('orgs.subtitle')}
        />
        <Button variant="primary" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1" />
          {t('orgs.create')}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('orgs.search')}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border bg-[var(--surface-sunken)] border-[var(--border-default)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as 'all' | 'active' | 'suspended')}
          className="px-3 py-2 text-sm rounded-lg border bg-[var(--surface-sunken)] border-[var(--border-default)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]"
        >
          <option value="all">{t('orgs.status.all')}</option>
          <option value="active">{t('orgs.status.active')}</option>
          <option value="suspended">{t('orgs.status.suspended')}</option>
        </select>
      </div>

      <ErrorBoundary scope="route">
        {isLoading ? (
          <Skeleton variant="dataTableDense" />
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-sm text-[var(--text-secondary)]">{t('common.loadError')}</p>
          </div>
        ) : !data?.items.length ? (
          <EmptyState
            variant="team"
            title={t('orgs.empty')}
            primaryCta={{ label: t('orgs.create'), onPress: () => setShowCreate(true) }}
          />
        ) : (
          <DataTable
            data={data.items}
            columns={columns}
            pageSize={25}
            onRowClick={row => navigate(`/admin/organizations/${row.id}`)}
          />
        )}
      </ErrorBoundary>

      <CreateOrgDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={orgId => {
          setShowCreate(false)
          navigate(`/admin/organizations/${orgId}`)
        }}
      />
    </div>
  )
}

// ── Row menu ───────────────────────────────────────────────────────────────────

function OrgRowMenu({ org }: { org: OrgListItem }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [showSuspendConfirm, setShowSuspendConfirm] = useState(false)
  const [typed, setTyped] = useState('')

  const suspendMutation = useMutation({
    mutationFn: () => suspendOrganization(org.id),
    onSuccess: () => {
      toast.success(t('orgs.suspendSuccess', { name: org.businessName }))
      void queryClient.invalidateQueries({ queryKey: ['platform', 'organizations'] })
      setShowSuspendConfirm(false)
    },
    onError: () => toast.error(t('orgs.suspendError')),
  })

  return (
    <div className="relative" onClick={e => e.stopPropagation()}>
      <Button variant="ghost" size="sm" onClick={() => setOpen(o => !o)} aria-label={t('common.moreActions')}>
        <MoreHorizontal className="h-4 w-4" />
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 w-44 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-[var(--shadow-md)] overflow-hidden">
            <button
              onClick={() => { setOpen(false); navigate(`/admin/organizations/${org.id}`) }}
              className="w-full text-left px-3 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
            >
              {t('common.view')}
            </button>
            {org.isActive && (
              <button
                onClick={() => { setOpen(false); setShowSuspendConfirm(true) }}
                className="w-full text-left px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950"
              >
                {t('orgs.suspend')}
              </button>
            )}
          </div>
        </>
      )}

      {/* Suspend confirm */}
      <Dialog
        open={showSuspendConfirm}
        onClose={() => { setShowSuspendConfirm(false); setTyped('') }}
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
            <Button variant="ghost" onClick={() => { setShowSuspendConfirm(false); setTyped('') }}>
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

// ── Create org dialog ──────────────────────────────────────────────────────────

function CreateOrgDialog({
  open, onClose, onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (orgId: string) => void
}) {
  const queryClient = useQueryClient()
  const [businessName, setBusinessName] = useState('')
  const [gstin, setGstin] = useState('')
  const [panNumber, setPanNumber] = useState('')
  const [businessType, setBusinessType] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!businessName.trim()) errs.businessName = t('orgs.field.nameRequired')
    if (gstin && !isValidGSTIN(gstin)) errs.gstin = t('orgs.field.gstinInvalid')
    if (panNumber && !isValidPAN(panNumber)) errs.panNumber = t('orgs.field.panInvalid')
    return errs
  }

  const mutation = useMutation({
    mutationFn: () => createOrganization({
      businessName: businessName.trim(),
      gstin: gstin || undefined,
      panNumber: panNumber || undefined,
      businessType: businessType || undefined,
    }),
    onSuccess: data => {
      toast.success(t('orgs.createSuccess', { name: businessName }))
      void queryClient.invalidateQueries({ queryKey: ['platform', 'organizations'] })
      setBusinessName(''); setGstin(''); setPanNumber(''); setBusinessType('')
      setErrors({})
      onCreated(data.organizationId)
    },
    onError: () => toast.error(t('orgs.createError')),
  })

  const handleSubmit = () => {
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    mutation.mutate()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('orgs.createTitle')}
      description={t('orgs.createDesc')}
      size="lg"
      footer={
        <>
          <Button
            variant="primary"
            onClick={handleSubmit}
            loading={mutation.isPending}
            disabled={!businessName.trim()}
          >
            {t('orgs.createSubmit')}
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
            {t('orgs.field.businessName')} <span className="text-rose-500">*</span>
          </label>
          <input
            value={businessName}
            onChange={e => setBusinessName(e.target.value)}
            placeholder="Acme Traders Pvt. Ltd."
            className={cn(
              'w-full px-3 py-2 rounded-lg border bg-[var(--surface-sunken)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]',
              errors.businessName ? 'border-rose-500' : 'border-[var(--border-default)]'
            )}
          />
          {errors.businessName && <p className="mt-1 text-xs text-rose-600">{errors.businessName}</p>}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
              {t('orgs.field.gstin')}
              <span className="ml-1 text-xs text-[var(--text-tertiary)] font-normal">{t('common.optional')}</span>
            </label>
            <input
              value={gstin}
              onChange={e => setGstin(e.target.value.toUpperCase())}
              placeholder="27AABCU9603R1ZX"
              maxLength={15}
              className={cn(
                'w-full px-3 py-2 rounded-lg border bg-[var(--surface-sunken)] text-[var(--text-primary)] font-mono focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]',
                errors.gstin ? 'border-rose-500' : 'border-[var(--border-default)]'
              )}
            />
            {errors.gstin && <p className="mt-1 text-xs text-rose-600">{errors.gstin}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
              {t('orgs.field.pan')}
              <span className="ml-1 text-xs text-[var(--text-tertiary)] font-normal">{t('common.optional')}</span>
            </label>
            <input
              value={panNumber}
              onChange={e => setPanNumber(e.target.value.toUpperCase())}
              placeholder="AABCU9603R"
              maxLength={10}
              className={cn(
                'w-full px-3 py-2 rounded-lg border bg-[var(--surface-sunken)] text-[var(--text-primary)] font-mono focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]',
                errors.panNumber ? 'border-rose-500' : 'border-[var(--border-default)]'
              )}
            />
            {errors.panNumber && <p className="mt-1 text-xs text-rose-600">{errors.panNumber}</p>}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
            {t('orgs.field.businessType')}
            <span className="ml-1 text-xs text-[var(--text-tertiary)] font-normal">{t('common.optional')}</span>
          </label>
          <select
            value={businessType}
            onChange={e => setBusinessType(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border bg-[var(--surface-sunken)] border-[var(--border-default)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]"
          >
            <option value="">{t('orgs.businessType.select')}</option>
            <option value="PROPRIETORSHIP">{t('orgs.businessType.proprietorship')}</option>
            <option value="PARTNERSHIP">{t('orgs.businessType.partnership')}</option>
            <option value="PRIVATE_LIMITED">{t('orgs.businessType.privateLimited')}</option>
            <option value="PUBLIC_LIMITED">{t('orgs.businessType.publicLimited')}</option>
            <option value="LLP">{t('orgs.businessType.llp')}</option>
            <option value="HUF">{t('orgs.businessType.huf')}</option>
            <option value="TRUST">{t('orgs.businessType.trust')}</option>
            <option value="OTHER">{t('orgs.businessType.other')}</option>
          </select>
        </div>
      </div>
    </Dialog>
  )
}
