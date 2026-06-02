import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { type ColumnDef } from '@tanstack/react-table'
import { Search, Filter, Download } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { DataTable } from '@/components/ui/DataTable'
import { Badge, StatusBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'
import { AlertBanner } from '@/components/shared/AlertBanner'
import { Can } from '@/components/shared/Can'
import { formatRelativeTime, getOcrConfidenceBg } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface DocumentQueueItem {
  id: string
  documentId: string
  userName: string
  userEmail: string
  category: string
  uploadedAt: string
  ocrConfidence: number
  status: 'UPLOADED' | 'OCR_COMPLETE' | 'IN_REVIEW'
  slaExpiresAt: string
  assignedTo: string | null
  slaBreached: boolean
}

// Mock data
const mockDocuments: DocumentQueueItem[] = [
  {
    id: '1', documentId: 'D-20260401-0001', userName: 'Rajesh Kumar', userEmail: 'rajesh@example.com',
    category: 'Sales Bill', uploadedAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    ocrConfidence: 92, status: 'OCR_COMPLETE', slaExpiresAt: new Date(Date.now() + 2 * 3600000).toISOString(),
    assignedTo: null, slaBreached: false,
  },
  {
    id: '2', documentId: 'D-20260401-0002', userName: 'Meena Iyer', userEmail: 'meena@example.com',
    category: 'Purchase Bill', uploadedAt: new Date(Date.now() - 5 * 3600000).toISOString(),
    ocrConfidence: 67, status: 'IN_REVIEW', slaExpiresAt: new Date(Date.now() + 30 * 60000).toISOString(),
    assignedTo: 'Anjali Singh', slaBreached: false,
  },
  {
    id: '3', documentId: 'D-20260401-0003', userName: 'Arjun Verma', userEmail: 'arjun@example.com',
    category: 'Bank Statement', uploadedAt: new Date(Date.now() - 8 * 3600000).toISOString(),
    ocrConfidence: 34, status: 'UPLOADED', slaExpiresAt: new Date(Date.now() - 1 * 3600000).toISOString(),
    assignedTo: null, slaBreached: true,
  },
  {
    id: '4', documentId: 'D-20260401-0004', userName: 'Priya Sharma', userEmail: 'priya@example.com',
    category: 'Expense Receipt', uploadedAt: new Date(Date.now() - 1 * 3600000).toISOString(),
    ocrConfidence: 88, status: 'OCR_COMPLETE', slaExpiresAt: new Date(Date.now() + 4 * 3600000).toISOString(),
    assignedTo: 'Suresh Nair', slaBreached: false,
  },
  {
    id: '5', documentId: 'D-20260401-0005', userName: 'Ramesh Gupta', userEmail: 'ramesh@example.com',
    category: 'Salary Slip', uploadedAt: new Date(Date.now() - 3 * 3600000).toISOString(),
    ocrConfidence: 55, status: 'OCR_COMPLETE', slaExpiresAt: new Date(Date.now() + 1.5 * 3600000).toISOString(),
    assignedTo: null, slaBreached: false,
  },
]

function SlaChip({ expiresAt, breached }: { expiresAt: string; breached: boolean }) {
  const now = new Date()
  const expires = new Date(expiresAt)
  const diffMs = expires.getTime() - now.getTime()
  const diffHours = diffMs / (1000 * 60 * 60)
  const diffMins = Math.floor(diffMs / (1000 * 60))

  if (breached || diffMs < 0) {
    return <Badge variant="error" dot>Overdue</Badge>
  }
  if (diffHours < 2) {
    return <Badge variant="warning" dot>{diffMins}m left</Badge>
  }
  return <Badge variant="success" dot>{Math.floor(diffHours)}h left</Badge>
}

function OcrDot({ confidence }: { confidence: number }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={cn('h-2.5 w-2.5 rounded-full', getOcrConfidenceBg(confidence))}
        aria-hidden="true"
      />
      <span className="text-sm tabular-nums">{confidence}%</span>
    </div>
  )
}

function buildColumns(navigate: ReturnType<typeof useNavigate>): ColumnDef<DocumentQueueItem>[] {
  return [
    {
      accessorKey: 'documentId',
      header: 'Document ID',
      cell: ({ row }) => (
        <span className="font-mono text-xs text-brand-600 font-medium">{row.original.documentId}</span>
      ),
    },
    {
      accessorKey: 'userName',
      header: 'User',
      cell: ({ row }) => (
        <div>
          <p className="text-sm font-medium text-neutral-800">{row.original.userName}</p>
          <p className="text-xs text-neutral-400">{row.original.userEmail}</p>
        </div>
      ),
    },
    {
      accessorKey: 'category',
      header: 'Category',
      cell: ({ row }) => <Badge variant="brand">{row.original.category}</Badge>,
    },
    {
      accessorKey: 'uploadedAt',
      header: 'Uploaded',
      cell: ({ row }) => (
        <span className="text-sm text-neutral-500">{formatRelativeTime(row.original.uploadedAt)}</span>
      ),
    },
    {
      accessorKey: 'ocrConfidence',
      header: 'OCR Confidence',
      cell: ({ row }) => <OcrDot confidence={row.original.ocrConfidence} />,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: 'slaExpiresAt',
      header: 'SLA',
      cell: ({ row }) => (
        <SlaChip expiresAt={row.original.slaExpiresAt} breached={row.original.slaBreached} />
      ),
    },
    {
      accessorKey: 'assignedTo',
      header: 'Assigned To',
      cell: ({ row }) => (
        <span className="text-sm text-neutral-500">
          {row.original.assignedTo ?? <span className="text-warning-600 font-medium">Unassigned</span>}
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          {/* Action-level RBAC: Review needs document.read, Assign needs document.update. */}
          <Can permission="document.read">
            <Button
              variant="primary"
              size="sm"
              onClick={() => void navigate(`/documents/${row.original.id}`)}
            >
              Review
            </Button>
          </Can>
          <Can permission="document.update">
            <Button variant="ghost" size="sm">Assign</Button>
          </Can>
        </div>
      ),
    },
  ]
}

export default function DocumentQueuePage() {
  const navigate = useNavigate()
  const [globalFilter, setGlobalFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [ocrFilter, setOcrFilter] = useState('all')

  const columns = useMemo(() => buildColumns(navigate), [navigate])

  const { data, isLoading } = useQuery({
    queryKey: ['document-queue'],
    queryFn: async () => {
      await new Promise(r => setTimeout(r, 300))
      return mockDocuments
    },
  })

  const filteredData = useMemo(() => {
    return (data ?? []).filter(d => {
      if (statusFilter !== 'all' && d.status !== statusFilter) return false
      if (categoryFilter !== 'all') {
        const catMap: Record<string, string> = {
          'sales-bill': 'Sales Bill',
          'purchase-bill': 'Purchase Bill',
          'expense': 'Expense Receipt',
          'bank-statement': 'Bank Statement',
          'salary-slip': 'Salary Slip',
        }
        if (d.category !== catMap[categoryFilter]) return false
      }
      if (ocrFilter === 'high' && d.ocrConfidence <= 80) return false
      if (ocrFilter === 'medium' && (d.ocrConfidence < 50 || d.ocrConfidence > 80)) return false
      if (ocrFilter === 'low' && d.ocrConfidence >= 50) return false
      return true
    })
  }, [data, statusFilter, categoryFilter, ocrFilter])

  const breachedCount = (data ?? []).filter(d => d.slaBreached).length

  return (
    <div className="space-y-5">
      <PageHeader
        title="Document Queue"
        subtitle={`${(data ?? []).length} documents pending review${breachedCount > 0 ? ` · ${breachedCount} SLA breaches` : ''}`}
        actions={
          <Can permission="document.read">
            <Button variant="secondary" size="sm" leftIcon={<Download className="h-4 w-4" />}>
              Export
            </Button>
          </Can>
        }
      />

      {breachedCount > 0 && (
        <AlertBanner
          type="error"
          title="SLA Breaches Detected"
          description={`${breachedCount} document${breachedCount > 1 ? 's have' : ' has'} exceeded SLA. Immediate review required.`}
        />
      )}

      {/* Filters */}
      <Card padding="sm">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="w-64">
            <Input
              placeholder="Search documents..."
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              prefix={<Search className="h-4 w-4" />}
              size="sm"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-neutral-500 block mb-1">Category</label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="h-9 rounded-lg border border-neutral-300 bg-white text-sm px-3 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none"
              aria-label="Filter by category"
            >
              <option value="all">All Categories</option>
              <option value="sales-bill">Sales Bill</option>
              <option value="purchase-bill">Purchase Bill</option>
              <option value="expense">Expense Receipt</option>
              <option value="bank-statement">Bank Statement</option>
              <option value="salary-slip">Salary Slip</option>
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
              <option value="all">All Statuses</option>
              <option value="UPLOADED">Uploaded</option>
              <option value="OCR_COMPLETE">OCR Complete</option>
              <option value="IN_REVIEW">In Review</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-neutral-500 block mb-1">OCR Confidence</label>
            <select
              value={ocrFilter}
              onChange={(e) => setOcrFilter(e.target.value)}
              className="h-9 rounded-lg border border-neutral-300 bg-white text-sm px-3 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none"
              aria-label="Filter by OCR confidence"
            >
              <option value="all">All</option>
              <option value="high">High (&gt;80%)</option>
              <option value="medium">Medium (50-80%)</option>
              <option value="low">Low (&lt;50%)</option>
            </select>
          </div>

          <Button
            variant="ghost"
            size="sm"
            leftIcon={<Filter className="h-4 w-4" />}
            onClick={() => {
              setGlobalFilter('')
              setCategoryFilter('all')
              setStatusFilter('all')
              setOcrFilter('all')
            }}
          >
            Reset Filters
          </Button>
        </div>
      </Card>

      {/* Table */}
      <DataTable
        data={filteredData}
        columns={columns}
        loading={isLoading}
        globalFilter={globalFilter}
        onRowClick={(row) => void navigate(`/documents/${row.id}`)}
        emptyState={
          <div className="py-8 text-center text-neutral-500">
            <p className="font-medium">No documents in queue</p>
            <p className="text-sm mt-1">All documents have been processed</p>
          </div>
        }
      />
    </div>
  )
}
