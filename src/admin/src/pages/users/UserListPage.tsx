import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { type ColumnDef } from '@tanstack/react-table'
import { toast } from 'sonner'
import { Search, Download, UserPlus } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { DataTable } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'
import { getInitials, getAvatarColor } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface UserListItem {
  id: string
  name: string
  phone: string
  email: string
  userType: 'Business Owner' | 'Employee'
  plan: 'Free' | 'Basic' | 'Pro' | 'Enterprise'
  gstin: string | null
  state: string
  joinedAt: string
  lastActive: string
  status: 'Active' | 'Inactive' | 'Suspended'
}

const mockUsers: UserListItem[] = [
  { id: '1', name: 'Rajesh Kumar', phone: '+91 98765 43210', email: 'rajesh@rktrade.in', userType: 'Business Owner', plan: 'Pro', gstin: '27AABCS1429B1ZB', state: 'Maharashtra', joinedAt: '2025-06-15', lastActive: new Date(Date.now() - 2 * 3600000).toISOString(), status: 'Active' },
  { id: '2', name: 'Meena Iyer', phone: '+91 87654 32109', email: 'meena@example.com', userType: 'Employee', plan: 'Basic', gstin: null, state: 'Karnataka', joinedAt: '2025-08-22', lastActive: new Date(Date.now() - 24 * 3600000).toISOString(), status: 'Active' },
  { id: '3', name: 'Arjun Verma', phone: '+91 76543 21098', email: 'arjun@vermatextiles.com', userType: 'Business Owner', plan: 'Enterprise', gstin: '24AAPCP2345B1Z2', state: 'Gujarat', joinedAt: '2025-04-01', lastActive: new Date(Date.now() - 5 * 60000).toISOString(), status: 'Active' },
  { id: '4', name: 'Priya Sharma', phone: '+91 65432 10987', email: 'priya@example.com', userType: 'Employee', plan: 'Free', gstin: null, state: 'Delhi', joinedAt: '2025-11-10', lastActive: new Date(Date.now() - 7 * 86400000).toISOString(), status: 'Inactive' },
  { id: '5', name: 'Ramesh Gupta', phone: '+91 54321 09876', email: 'ramesh@guptaelec.in', userType: 'Business Owner', plan: 'Basic', gstin: '07AACPG4567B1Z3', state: 'Delhi', joinedAt: '2025-09-18', lastActive: new Date(Date.now() - 3 * 86400000).toISOString(), status: 'Suspended' },
]

const planColors: Record<string, string> = {
  Free: 'bg-neutral-100 text-neutral-500',
  Basic: 'bg-brand-100 text-brand-700',
  Pro: 'bg-purple-100 text-purple-700',
  Enterprise: 'bg-amber-100 text-amber-700',
}

const statusColors: Record<string, string> = {
  Active: 'text-success-600',
  Inactive: 'text-neutral-400',
  Suspended: 'text-error-600',
}

function buildUserColumns(
  navigate: ReturnType<typeof useNavigate>,
  onSuspendRequest: (user: UserListItem) => void,
): ColumnDef<UserListItem>[] {
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
              <p className="text-xs text-neutral-400">{row.original.email}</p>
            </div>
          </div>
        )
      },
    },
    {
      accessorKey: 'phone',
      header: 'Phone',
      cell: ({ row }) => (
        <a href={`tel:${row.original.phone}`} className="text-sm text-brand-600 hover:underline font-mono">
          {row.original.phone}
        </a>
      ),
    },
    {
      accessorKey: 'userType',
      header: 'Type',
      cell: ({ row }) => (
        <Badge variant={row.original.userType === 'Business Owner' ? 'brand' : 'info'} size="sm">
          {row.original.userType}
        </Badge>
      ),
    },
    {
      accessorKey: 'plan',
      header: 'Plan',
      cell: ({ row }) => (
        <span className={cn('text-xs font-semibold px-2 py-0.5 rounded', planColors[row.original.plan])}>
          {row.original.plan}
        </span>
      ),
    },
    {
      accessorKey: 'state',
      header: 'State',
      cell: ({ row }) => <span className="text-sm text-neutral-600">{row.original.state}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <span className={cn('text-sm font-medium', statusColors[row.original.status])}>
          {row.original.status}
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void navigate(`/users/${row.original.id}`)}
          >
            View
          </Button>
          {row.original.status === 'Active' && (
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
  const [globalFilter, setGlobalFilter] = useState('')
  const [userTypeFilter, setUserTypeFilter] = useState('')
  const [planFilter, setPlanFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [stateFilter, setStateFilter] = useState('')
  const [suspendTarget, setSuspendTarget] = useState<UserListItem | null>(null)

  const columns = useMemo(
    () => buildUserColumns(navigate, (user) => setSuspendTarget(user)),
    [navigate],
  )

  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => { await new Promise(r => setTimeout(r, 300)); return mockUsers },
  })

  const filteredData = useMemo(() => {
    return (data ?? []).filter(d => {
      if (userTypeFilter && d.userType !== userTypeFilter) return false
      if (planFilter && d.plan !== planFilter) return false
      if (statusFilter && d.status !== statusFilter) return false
      if (stateFilter && d.state !== stateFilter) return false
      return true
    })
  }, [data, userTypeFilter, planFilter, statusFilter, stateFilter])

  return (
    <div className="space-y-5">
      <PageHeader
        title="Users"
        subtitle={`${(data ?? []).length} total users`}
        actions={
          <>
            <Button variant="secondary" size="sm" leftIcon={<Download className="h-4 w-4" />}>
              Export
            </Button>
            <Button variant="primary" size="sm" leftIcon={<UserPlus className="h-4 w-4" />}>
              Add User
            </Button>
          </>
        }
      />

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
              placeholder="Search by name, phone, PAN, GSTIN..."
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              prefix={<Search className="h-4 w-4" />}
              size="sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-500 block mb-1">User Type</label>
            <select
              value={userTypeFilter}
              onChange={(e) => setUserTypeFilter(e.target.value)}
              className="h-9 rounded-lg border border-neutral-300 bg-white text-sm px-3 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none"
              aria-label="Filter by User Type"
            >
              <option value="">All Types</option>
              <option value="Business Owner">Business Owner</option>
              <option value="Employee">Employee</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-500 block mb-1">Plan</label>
            <select
              value={planFilter}
              onChange={(e) => setPlanFilter(e.target.value)}
              className="h-9 rounded-lg border border-neutral-300 bg-white text-sm px-3 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none"
              aria-label="Filter by Plan"
            >
              <option value="">All Plans</option>
              <option value="Free">Free</option>
              <option value="Basic">Basic</option>
              <option value="Pro">Pro</option>
              <option value="Enterprise">Enterprise</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-500 block mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 rounded-lg border border-neutral-300 bg-white text-sm px-3 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none"
              aria-label="Filter by Status"
            >
              <option value="">All Statuses</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="Suspended">Suspended</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-500 block mb-1">State</label>
            <select
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              className="h-9 rounded-lg border border-neutral-300 bg-white text-sm px-3 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none"
              aria-label="Filter by State"
            >
              <option value="">All States</option>
              <option value="Maharashtra">Maharashtra</option>
              <option value="Karnataka">Karnataka</option>
              <option value="Gujarat">Gujarat</option>
              <option value="Delhi">Delhi</option>
              <option value="Tamil Nadu">Tamil Nadu</option>
            </select>
          </div>
        </div>
      </Card>

      <DataTable
        data={filteredData}
        columns={columns}
        loading={isLoading}
        globalFilter={globalFilter}
        onRowClick={(row) => void navigate(`/users/${row.id}`)}
      />
    </div>
  )
}
