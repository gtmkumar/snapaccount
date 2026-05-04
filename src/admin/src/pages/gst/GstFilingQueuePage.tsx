import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { type ColumnDef } from '@tanstack/react-table'
import { toast } from 'sonner'
import { Search, ChevronDown } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { DataTable } from '@/components/ui/DataTable'
import { Badge, StatusBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'
import { AlertBanner } from '@/components/shared/AlertBanner'
import { AmountDisplay } from '@/components/ui/AmountDisplay'
import { formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { getAdminTeamMembers, type TeamMember } from '@/lib/dashboardApi'

interface GstQueueItem {
  id: string
  businessName: string
  gstin: string
  returnType: 'GSTR-1' | 'GSTR-3B' | 'GSTR-9'
  period: string
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'FILED' | 'REVISION_NEEDED'
  dueDate: string
  taxPayable: number
  assignedCa: string | null
  slaExpiresAt: string
}

const mockGstQueue: GstQueueItem[] = [
  {
    id: '1', businessName: 'Sharma Trading Co.', gstin: '27AABCS1429B1ZB',
    returnType: 'GSTR-3B', period: 'March 2026', status: 'PENDING_APPROVAL',
    dueDate: new Date(Date.now() - 2 * 86400000).toISOString(), taxPayable: 48500,
    assignedCa: 'CA Ravi Kumar', slaExpiresAt: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: '2', businessName: 'Nair Enterprises', gstin: '32BBBCN5678A1ZC',
    returnType: 'GSTR-1', period: 'March 2026', status: 'DRAFT',
    dueDate: new Date(Date.now() + 2 * 86400000).toISOString(), taxPayable: 0,
    assignedCa: null, slaExpiresAt: new Date(Date.now() + 86400000).toISOString(),
  },
  {
    id: '3', businessName: 'Patel Textiles Pvt Ltd', gstin: '24AAPCP2345B1Z2',
    returnType: 'GSTR-3B', period: 'March 2026', status: 'APPROVED',
    dueDate: new Date(Date.now() + 1 * 86400000).toISOString(), taxPayable: 125000,
    assignedCa: 'CA Priya Sharma', slaExpiresAt: new Date(Date.now() + 3 * 3600000).toISOString(),
  },
  {
    id: '4', businessName: 'Gupta Electrics', gstin: '07AACPG4567B1Z3',
    returnType: 'GSTR-3B', period: 'February 2026', status: 'REVISION_NEEDED',
    dueDate: new Date(Date.now() + 5 * 86400000).toISOString(), taxPayable: 67200,
    assignedCa: 'CA Ravi Kumar', slaExpiresAt: new Date(Date.now() + 2 * 86400000).toISOString(),
  },
]

function DueDateChip({ dueDate }: { dueDate: string }) {
  const now = new Date()
  const due = new Date(dueDate)
  const diffDays = (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)

  if (diffDays < 0) {
    return <Badge variant="error" dot>Overdue {Math.abs(Math.floor(diffDays))}d</Badge>
  }
  if (diffDays < 3) {
    return <Badge variant="warning" dot>{Math.floor(diffDays)}d left</Badge>
  }
  if (diffDays < 7) {
    return <Badge variant="info" dot>{Math.floor(diffDays)}d left</Badge>
  }
  return <Badge variant="success" dot>{formatDate(dueDate)}</Badge>
}

function AssignCell({
  row,
  assigningRowId,
  setAssigningRowId,
}: {
  row: GstQueueItem
  assigningRowId: string | null
  setAssigningRowId: (id: string | null) => void
}) {
  const buttonRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const isOpen = assigningRowId === row.id
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number } | null>(null)
  const [caSearch, setCaSearch] = useState('')

  // Live CA list — fetched only when the dropdown is open (per-row mount).
  const { data: availableCAs = [] } = useQuery<TeamMember[]>({
    queryKey: ['admin-team-members', 'CA'],
    queryFn: () => getAdminTeamMembers('CA'),
    enabled: isOpen,
    staleTime: 5 * 60_000, // CA roster doesn't change often
  })

  const filteredCAs = useMemo(
    () => availableCAs.filter(ca => ca.name.toLowerCase().includes(caSearch.toLowerCase())),
    [availableCAs, caSearch]
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
        {row.assignedCa ? 'Reassign' : 'Assign'} <ChevronDown size={14} className="inline ml-1" />
      </Button>
      {isOpen && dropdownPos && (
        <div
          ref={dropdownRef}
          className="z-50 bg-white border border-gray-200 rounded-xl shadow-xl w-72"
          style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left }}
          onMouseDown={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation() }}
        >
          {/* Header */}
          <div className="px-4 py-3 border-b">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Assign to CA</p>
          </div>
          {/* Search */}
          <div className="px-3 py-2 border-b">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                ref={searchRef}
                type="text"
                value={caSearch}
                onChange={e => setCaSearch(e.target.value)}
                placeholder="Search CA..."
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                onClick={e => e.stopPropagation()}
                onMouseDown={e => e.stopPropagation()}
              />
            </div>
          </div>
          {/* CA List */}
          <div className="max-h-48 overflow-y-auto">
            {filteredCAs.length === 0 ? (
              <div className="px-4 py-3 text-sm text-gray-400 text-center">No CAs found</div>
            ) : (
              filteredCAs.map(ca => (
                <button
                  key={ca.userId}
                  className="w-full text-left px-4 py-2.5 hover:bg-blue-50 flex items-center justify-between transition-colors"
                  onClick={(e) => {
                    e.stopPropagation()
                    e.nativeEvent.stopImmediatePropagation()
                    toast.success(`Assigned to ${ca.name}`)
                    handleClose()
                  }}
                >
                  <span className="text-sm font-medium text-gray-800">{ca.name}</span>
                  <span className="text-xs text-gray-400 ml-3 shrink-0">{ca.role}</span>
                </button>
              ))
            )}
          </div>
          {/* Footer */}
          <div className="border-t px-3 py-2">
            <button
              className="w-full text-center px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-md transition-colors"
              onClick={(e) => {
                e.stopPropagation()
                e.nativeEvent.stopImmediatePropagation()
                handleClose()
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  )
}

function buildGstColumns(
  navigate: ReturnType<typeof useNavigate>,
  assigningRowId: string | null,
  setAssigningRowId: (id: string | null) => void,
): ColumnDef<GstQueueItem>[] {
  return [
    {
      accessorKey: 'businessName',
      header: 'Business',
      cell: ({ row }) => (
        <div>
          <p className="text-sm font-medium text-neutral-800">{row.original.businessName}</p>
          <p className="font-mono text-xs text-neutral-400">{row.original.gstin}</p>
        </div>
      ),
    },
    {
      accessorKey: 'returnType',
      header: 'Return Type',
      cell: ({ row }) => (
        <Badge variant="gst">{row.original.returnType}</Badge>
      ),
    },
    {
      accessorKey: 'period',
      header: 'Period',
      cell: ({ row }) => <span className="text-sm text-neutral-600">{row.original.period}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: 'dueDate',
      header: 'Due Date',
      cell: ({ row }) => <DueDateChip dueDate={row.original.dueDate} />,
    },
    {
      accessorKey: 'taxPayable',
      header: 'Tax Payable',
      cell: ({ row }) => (
        <AmountDisplay
          amount={row.original.taxPayable}
          colorCode
          size="sm"
        />
      ),
    },
    {
      accessorKey: 'assignedCa',
      header: 'Assigned CA',
      cell: ({ row }) => (
        <span className={cn('text-sm', row.original.assignedCa ? 'text-neutral-600' : 'text-warning-600 font-medium')}>
          {row.original.assignedCa ?? 'Unassigned'}
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex gap-2 items-center" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="primary"
            size="sm"
            onClick={() => void navigate(`/gst/${row.original.id}`)}
          >
            Review
          </Button>
          {row.original.status === 'APPROVED' && (
            <Button
              variant="success"
              size="sm"
              className="whitespace-nowrap"
              onClick={() => toast.success(`Filing initiated for ${row.original.gstin}`)}
            >
              File Now
            </Button>
          )}
          <AssignCell
            row={row.original}
            assigningRowId={assigningRowId}
            setAssigningRowId={setAssigningRowId}
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

  const columns = useMemo(
    () => buildGstColumns(navigate, assigningRowId, setAssigningRowId),
    [navigate, assigningRowId],
  )

  const { data, isLoading } = useQuery({
    queryKey: ['gst-queue'],
    queryFn: async () => {
      await new Promise(r => setTimeout(r, 300))
      return mockGstQueue
    },
  })

  const filteredData = useMemo(() => {
    return (data ?? []).filter(d => {
      if (returnTypeFilter && d.returnType !== returnTypeFilter) return false
      if (statusFilter && d.status !== statusFilter) return false
      if (caFilter === 'Unassigned' && d.assignedCa !== null) return false
      if (caFilter && caFilter !== 'Unassigned' && caFilter !== 'All CAs' && d.assignedCa !== caFilter) return false
      return true
    })
  }, [data, returnTypeFilter, statusFilter, caFilter])

  const overdueCount = (data ?? []).filter(d => new Date(d.dueDate) < new Date()).length
  const dueTodayCount = (data ?? []).filter(d => {
    const diff = (new Date(d.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    return diff >= 0 && diff < 1
  }).length

  return (
    <div className="space-y-5">
      <PageHeader
        title="GST Filing Queue"
        subtitle={`${overdueCount > 0 ? `${overdueCount} overdue · ` : ''}${dueTodayCount} due today · ${(data ?? []).length} total`}
      />

      {/* Urgency alerts */}
      {overdueCount > 0 && (
        <AlertBanner
          type="error"
          title="Overdue GST Returns"
          description={`GSTR-3B for ${overdueCount} business${overdueCount > 1 ? 'es' : ''} is overdue. Late fees are accruing.`}
        />
      )}
      {dueTodayCount > 0 && !overdueCount && (
        <AlertBanner
          type="warning"
          title="GST Returns Due Today"
          description={`GSTR-1 deadline in 2 days for ${dueTodayCount} businesses.`}
        />
      )}

      {/* Filters */}
      <Card padding="sm">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="w-64">
            <Input
              placeholder="Search business or GSTIN..."
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              prefix={<Search className="h-4 w-4" />}
              size="sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-500 block mb-1">Return Type</label>
            <select
              value={returnTypeFilter}
              onChange={(e) => setReturnTypeFilter(e.target.value)}
              className="h-9 rounded-lg border border-neutral-300 bg-white text-sm px-3 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none"
              aria-label="Filter by return type"
            >
              <option value="">All Types</option>
              <option value="GSTR-1">GSTR-1</option>
              <option value="GSTR-3B">GSTR-3B</option>
              <option value="GSTR-9">GSTR-9</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-500 block mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 rounded-lg border border-neutral-300 bg-white text-sm px-3 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none"
              aria-label="Filter by status"
            >
              <option value="">All Statuses</option>
              <option value="DRAFT">Draft</option>
              <option value="PENDING_APPROVAL">Pending Approval</option>
              <option value="APPROVED">Approved</option>
              <option value="FILED">Filed</option>
              <option value="REVISION_NEEDED">Revision Needed</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-500 block mb-1">Assigned CA</label>
            <select
              value={caFilter}
              onChange={(e) => setCaFilter(e.target.value)}
              className="h-9 rounded-lg border border-neutral-300 bg-white text-sm px-3 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none"
              aria-label="Filter by CA"
            >
              <option value="">All CAs</option>
              <option value="Unassigned">Unassigned</option>
              <option value="CA Ravi Kumar">CA Ravi Kumar</option>
              <option value="CA Priya Sharma">CA Priya Sharma</option>
            </select>
          </div>
        </div>
      </Card>

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
