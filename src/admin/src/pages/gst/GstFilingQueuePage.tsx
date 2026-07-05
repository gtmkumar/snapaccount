import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { type ColumnDef } from '@tanstack/react-table'
import { toast } from 'sonner'
import { Search, ChevronDown } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { FilterBar } from '@/components/layout/FilterBar'
import { DataTable } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { NativeSelect } from '@/components/ui/NativeSelect'
import { AlertBanner } from '@/components/shared/AlertBanner'
import { formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import { getAdminTeamMembers, type TeamMember } from '@/lib/dashboardApi'
import { getFilingQueue, type FilingQueueItem } from '@/lib/gstApi'
import { NoticesDueWidget } from '@/components/widgets/NoticesDueWidget'

function DueDateChip({ dueDate }: { dueDate: string | null }) {
  if (!dueDate) return <span className="text-sm text-neutral-400">{t('common.na')}</span>
  const now = new Date()
  const due = new Date(dueDate)
  const diffDays = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)

  if (diffDays < 0) {
    return <Badge variant="error" dot>{t('gstQueue.overdue', { days: Math.abs(Math.floor(diffDays)) })}</Badge>
  }
  if (diffDays < 3) {
    return <Badge variant="warning" dot>{t('gstQueue.daysLeft', { days: Math.floor(diffDays) })}</Badge>
  }
  if (diffDays < 7) {
    return <Badge variant="info" dot>{t('gstQueue.daysLeft', { days: Math.floor(diffDays) })}</Badge>
  }
  return <Badge variant="success" dot>{formatDate(dueDate)}</Badge>
}

function AssignCell({
  row,
  assigningRowId,
  setAssigningRowId,
  caList,
}: {
  row: FilingQueueItem
  assigningRowId: string | null
  setAssigningRowId: (id: string | null) => void
  caList: TeamMember[]
}) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const isOpen = assigningRowId === row.id
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null)
  const [caSearch, setCaSearch] = useState('')

  const filteredCAs = useMemo(
    () => caList.filter(ca => ca.name.toLowerCase().includes(caSearch.toLowerCase())),
    [caList, caSearch]
  )

  useEffect(() => {
    if (!isOpen) {
      setCaSearch('')
      return
    }
    // Auto-focus search when dropdown opens
    setTimeout(() => searchRef.current?.focus(), 50)
    function handleOutsideClick(e: MouseEvent) {
      if (buttonRef.current && buttonRef.current.contains(e.target as Node)) return
      if (dropdownRef.current && dropdownRef.current.contains(e.target as Node)) return
      setAssigningRowId(null)
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [isOpen, setAssigningRowId])

  function handleButtonClick(e: React.MouseEvent) {
    e.stopPropagation()
    e.nativeEvent.stopImmediatePropagation()
    if (isOpen) {
      setAssigningRowId(null)
      setDropdownPos(null)
    } else {
      const rect = buttonRef.current?.getBoundingClientRect()
      if (rect) {
        setDropdownPos({ top: rect.bottom + 4, left: rect.right - 288 })
      }
      setAssigningRowId(row.id)
    }
  }

  function handleClose() {
    setAssigningRowId(null)
    setDropdownPos(null)
    setCaSearch('')
  }

  return (
    <>
      <Button
        ref={buttonRef}
        variant="ghost"
        size="sm"
        onClick={handleButtonClick}
      >
        {row.assignedCaUserId ? t('gstQueue.reassign') : t('gstQueue.assign')} <ChevronDown size={14} className="inline ml-1" />
      </Button>
      {isOpen && dropdownPos && (
        <div
          ref={dropdownRef}
          className="z-50 bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-xl shadow-[var(--shadow-lg)] w-72"
          style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left }}
          onMouseDown={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation() }}
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-[var(--border-default)]">
            <p className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">{t('gstQueue.assignToCA')}</p>
          </div>
          {/* Search */}
          <div className="px-3 py-2 border-b border-[var(--border-default)]">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
              <input
                ref={searchRef}
                type="text"
                value={caSearch}
                onChange={e => setCaSearch(e.target.value)}
                placeholder={t('gstQueue.searchCA')}
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-primary)] rounded-md focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                onClick={e => e.stopPropagation()}
                onMouseDown={e => e.stopPropagation()}
              />
            </div>
          </div>
          {/* CA List */}
          <div className="max-h-48 overflow-y-auto">
            {filteredCAs.length === 0 ? (
              <div className="px-4 py-3 text-sm text-[var(--text-tertiary)] text-center">{t('gstQueue.noCAsFound')}</div>
            ) : (
              filteredCAs.map(ca => (
                <button
                  key={ca.userId}
                  className="w-full text-left px-4 py-2.5 hover:bg-[var(--surface-hover)] flex items-center justify-between transition-colors"
                  onClick={(e) => {
                    e.stopPropagation()
                    e.nativeEvent.stopImmediatePropagation()
                    toast.success(t('gstQueue.assignedTo', { name: ca.name }))
                    handleClose()
                  }}
                >
                  <span className="text-sm font-medium text-[var(--text-primary)]">{ca.name}</span>
                  <span className="text-xs text-[var(--text-tertiary)] ml-3 shrink-0">{ca.role}</span>
                </button>
              ))
            )}
          </div>
          {/* Footer */}
          <div className="border-t border-[var(--border-default)] px-3 py-2">
            <button
              className="w-full text-center px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)] rounded-md transition-colors"
              onClick={(e) => {
                e.stopPropagation()
                e.nativeEvent.stopImmediatePropagation()
                handleClose()
              }}
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}
    </>
  )
}

const STATUS_VARIANT: Record<string, 'neutral' | 'warning' | 'info' | 'success' | 'error'> = {
  DRAFT: 'neutral',
  PENDING_APPROVAL: 'warning',
  APPROVED: 'info',
  FILED: 'success',
  REVISION_NEEDED: 'error',
}

function buildGstColumns(
  navigate: ReturnType<typeof useNavigate>,
  assigningRowId: string | null,
  setAssigningRowId: (id: string | null) => void,
  caList: TeamMember[],
): ColumnDef<FilingQueueItem>[] {
  return [
    {
      accessorKey: 'businessName',
      header: t('gstQueue.col.business'),
      cell: ({ row }) => (
        <div>
          <p className="text-sm font-medium text-neutral-800">
            {row.original.businessName ?? <span className="text-neutral-400">{t('common.unknown')}</span>}
          </p>
          <p className="font-mono text-xs text-neutral-400">{row.original.orgId}</p>
        </div>
      ),
    },
    {
      accessorKey: 'returnType',
      header: t('gstQueue.col.returnType'),
      cell: ({ row }) => (
        <Badge variant="gst">{row.original.returnType}</Badge>
      ),
    },
    {
      accessorKey: 'status',
      header: t('gstQueue.col.status'),
      cell: ({ row }) => (
        <Badge variant={STATUS_VARIANT[row.original.status] ?? 'neutral'}>
          {row.original.status}
        </Badge>
      ),
    },
    {
      accessorKey: 'filingDeadline',
      header: t('gstQueue.col.dueDate'),
      cell: ({ row }) => <DueDateChip dueDate={row.original.filingDeadline} />,
    },
    {
      accessorKey: 'assignedCaUserId',
      header: t('gstQueue.col.assignedCA'),
      cell: ({ row }) => {
        const ca = caList.find(c => c.userId === row.original.assignedCaUserId)
        return (
          <span className={cn('text-sm', ca ? 'text-neutral-600' : 'text-warning-600 font-medium')}>
            {ca ? ca.name : t('gstQueue.unassigned')}
          </span>
        )
      },
    },
    {
      id: 'actions',
      header: t('gstQueue.col.actions'),
      cell: ({ row }) => (
        <div className="flex gap-2 items-center" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="primary"
            size="sm"
            onClick={() => void navigate(`/gst/${row.original.id}`)}
          >
            {t('gstQueue.review')}
          </Button>
          {row.original.status === 'APPROVED' && (
            <Button
              variant="success"
              size="sm"
              className="whitespace-nowrap"
              onClick={() => toast.success(t('gstQueue.filingInitiated'))}
            >
              {t('gstQueue.fileNow')}
            </Button>
          )}
          <AssignCell
            row={row.original}
            assigningRowId={assigningRowId}
            setAssigningRowId={setAssigningRowId}
            caList={caList}
          />
        </div>
      ),
    },
  ]
}

export default function GstFilingQueuePage() {
  const navigate = useNavigate()
  const [globalFilter, setGlobalFilter] = useState('')
  const [returnTypeFilter, setReturnTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [caFilter, setCaFilter] = useState('')
  const [assigningRowId, setAssigningRowId] = useState<string | null>(null)

  // Live CA roster — loaded once, shared with all AssignCell dropdowns
  const { data: caList = [] } = useQuery<TeamMember[]>({
    queryKey: ['admin-team-members', 'CA'],
    queryFn: () => getAdminTeamMembers('CA'),
    staleTime: 5 * 60_000,
  })

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['gst', 'filing-queue', { status: statusFilter || undefined }],
    queryFn: () => getFilingQueue({ status: statusFilter || undefined }),
  })

  const columns = useMemo(
    () => buildGstColumns(navigate, assigningRowId, setAssigningRowId, caList),
    [navigate, assigningRowId, caList],
  )

  const filteredData = useMemo(() => {
    return (data ?? []).filter(d => {
      if (returnTypeFilter && d.returnType !== returnTypeFilter) return false
      if (caFilter === 'Unassigned' && d.assignedCaUserId !== null) return false
      if (caFilter && caFilter !== 'Unassigned' && caFilter !== 'All CAs' && d.assignedCaUserId !== caFilter) return false
      return true
    })
  }, [data, returnTypeFilter, caFilter])

  const overdueCount = (data ?? []).filter(d => d.filingDeadline && new Date(d.filingDeadline) < new Date()).length
  const dueTodayCount = (data ?? []).filter(d => {
    if (!d.filingDeadline) return false
    const diff = (new Date(d.filingDeadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    return diff >= 0 && diff < 1
  }).length

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('gstQueue.title')}
        subtitle={`${overdueCount > 0 ? `${overdueCount} ${t('gstQueue.overdueSuffix')} · ` : ''}${dueTodayCount} ${t('gstQueue.dueTodaySuffix')} · ${(data ?? []).length} ${t('gstQueue.totalSuffix')}`}
      />

      {/* GST notices due summary (P-38 — 2nd spec'd mount, alongside the dashboard) */}
      <NoticesDueWidget />

      {/* Load error banner */}
      {isError && (
        <AlertBanner
          type="error"
          title={t('admin.gstQueue.loadError')}
          actions={
            <button type="button" onClick={() => void refetch()} className="text-xs underline">
              {t('common.retry')}
            </button>
          }
        />
      )}

      {/* Urgency alerts */}
      {!isError && overdueCount > 0 && (
        <AlertBanner
          type="error"
          title={t('gstQueue.overdueTitle')}
          description={t('gstQueue.overdueDesc', { count: overdueCount })}
        />
      )}
      {!isError && dueTodayCount > 0 && overdueCount === 0 && (
        <AlertBanner
          type="warning"
          title={t('gstQueue.dueTodayTitle')}
          description={t('gstQueue.dueTodayDesc', { count: dueTodayCount })}
        />
      )}

      {/* Filters */}
      <FilterBar>
        <div className="w-64">
          <Input
            placeholder={t('gstQueue.searchPlaceholder')}
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            prefix={<Search className="h-4 w-4" />}
            size="sm"
          />
        </div>

        <NativeSelect
          label={t('gstQueue.filterReturnType')}
          value={returnTypeFilter}
          onChange={(e) => setReturnTypeFilter(e.target.value)}
          aria-label={t('gstQueue.filterReturnType')}
          className="min-w-[10rem]"
        >
          <option value="">{t('gstQueue.allTypes')}</option>
          <option value="GSTR-1">GSTR-1</option>
          <option value="GSTR-3B">GSTR-3B</option>
          <option value="GSTR-9">GSTR-9</option>
        </NativeSelect>

        <NativeSelect
          label={t('gstQueue.filterStatus')}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label={t('gstQueue.filterStatus')}
          className="min-w-[10rem]"
        >
          <option value="">{t('gstQueue.allStatuses')}</option>
          <option value="DRAFT">{t('gstQueue.statusDraft')}</option>
          <option value="PENDING_APPROVAL">{t('gstQueue.statusPendingApproval')}</option>
          <option value="APPROVED">{t('gstQueue.statusApproved')}</option>
          <option value="FILED">{t('gstQueue.statusFiled')}</option>
          <option value="REVISION_NEEDED">{t('gstQueue.statusRevisionNeeded')}</option>
        </NativeSelect>

        <NativeSelect
          label={t('gstQueue.filterCA')}
          value={caFilter}
          onChange={(e) => setCaFilter(e.target.value)}
          aria-label={t('gstQueue.filterCA')}
          className="min-w-[10rem]"
        >
          <option value="">{t('gstQueue.allCAs')}</option>
          <option value="Unassigned">{t('gstQueue.unassigned')}</option>
          {caList.map(ca => (
            <option key={ca.userId} value={ca.userId}>{ca.name}</option>
          ))}
        </NativeSelect>
      </FilterBar>

      <DataTable
        data={filteredData}
        columns={columns}
        loading={isLoading}
        globalFilter={globalFilter}
        onRowClick={(row) => void navigate(`/gst/${row.id}`)}
      />
    </div>
  )
}
