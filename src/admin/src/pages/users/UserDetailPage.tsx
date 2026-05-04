import { useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import { ArrowLeft, Bell, MessageSquare, AlertTriangle, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card, CardHeader } from '@/components/ui/Card'
import { AmountDisplay } from '@/components/ui/AmountDisplay'
import { formatDate, formatRelativeTime, getInitials, getAvatarColor } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { usePermission } from '@/hooks/usePermission'

const tabs = ['Profile', 'Documents', 'GST Returns', 'ITR History', 'Loans', 'Subscription', 'Audit Log'] as const
type Tab = typeof tabs[number]

// STATIC-DATA-DEBT-7: full mock — needs real API endpoints + TanStack Query.
//   GET /admin/users/{id}                    → mockUser (incl. business profile)
//   GET /admin/users/{id}/documents          → mockDocuments
//   GET /admin/users/{id}/gst-returns        → mockGstReturns
//   GET /admin/users/{id}/audit-log?limit=N  → mockAuditLog
// All four endpoints need new CQRS slices in respective services.
const mockUser = {
  id: '1', name: 'Rajesh Kumar', phone: '+91 98765 43210', email: 'rajesh@rktrade.in',
  plan: 'Pro', status: 'Active', joinedAt: '2025-06-15', lastActive: new Date(Date.now() - 2 * 3600000).toISOString(),
  businessName: 'RK Trading Co.', gstin: '27AABCS1429B1ZB', state: 'Maharashtra',
  pan: 'ABCDE1234F', language: 'English', turnover: 12500000,
}

const mockDocuments = [
  { id: 'D-001', category: 'Sales Bill', date: '01/04/2026', status: 'Processed', confidence: 92 },
  { id: 'D-002', category: 'Purchase Bill', date: '31/03/2026', status: 'In Review', confidence: 67 },
  { id: 'D-003', category: 'Bank Statement', date: '30/03/2026', status: 'Processed', confidence: 88 },
]

const mockGstReturns = [
  { id: 'G-001', type: 'GSTR-3B', period: 'March 2026', status: 'Pending Approval', netTax: 48500, arn: null },
  { id: 'G-002', type: 'GSTR-3B', period: 'February 2026', status: 'Filed', netTax: 42300, arn: 'ARN-26022026' },
  { id: 'G-003', type: 'GSTR-1', period: 'March 2026', status: 'Draft', netTax: 0, arn: null },
]

const mockAuditLog = [
  { id: 'A-001', action: 'Logged in from Chrome/Windows', by: 'User', ip: '103.21.x.x', timestamp: new Date(Date.now() - 2 * 3600000) },
  { id: 'A-002', action: 'Uploaded document D-20260401-0003', by: 'User', ip: '103.21.x.x', timestamp: new Date(Date.now() - 3 * 3600000) },
  { id: 'A-003', action: 'GST return submitted for review', by: 'System', ip: 'N/A', timestamp: new Date(Date.now() - 25 * 3600000) },
  { id: 'A-004', action: 'Account suspended', by: 'Admin: Priya Sharma', ip: 'Admin', timestamp: new Date(Date.now() - 30 * 86400000) },
]

export default function UserDetailPage() {
  const { id: _id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<Tab>('Profile')
  const { hasPermission } = usePermission()

  const user = mockUser
  const initials = getInitials(user.name)
  const bgColor = getAvatarColor(user.name)

  return (
    <div className="space-y-5">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => void navigate('/users')}
        leftIcon={<ArrowLeft className="h-4 w-4" />}
      >
        Users
      </Button>

      {/* User header card */}
      <Card className="bg-gradient-to-r from-brand-50 to-white">
        <div className="flex items-start justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className={cn('h-20 w-20 rounded-2xl flex items-center justify-center text-white text-2xl font-bold shadow-md shrink-0', bgColor)}>
              {initials}
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-neutral-900">{user.name}</h1>
                <Badge variant={user.status === 'Active' ? 'success' : user.status === 'Suspended' ? 'error' : 'neutral'} dot>
                  {user.status}
                </Badge>
                <Badge variant="brand">{user.plan}</Badge>
              </div>
              <div className="flex items-center gap-4 mt-2 text-sm text-neutral-500">
                <span>{user.phone}</span>
                <span>·</span>
                <span>{user.email}</span>
                <span>·</span>
                <span>Joined {formatDate(user.joinedAt)}</span>
                <span>·</span>
                <span>Active {formatRelativeTime(user.lastActive)}</span>
              </div>
              <div className="flex items-center gap-4 mt-1 text-sm text-neutral-500">
                <span className="font-medium text-neutral-700">{user.businessName}</span>
                <span>·</span>
                <span className="font-mono text-xs">{user.gstin}</span>
                <span>·</span>
                <span>{user.state}</span>
              </div>
            </div>
          </div>

          <div className="flex gap-2 shrink-0">
            <Button variant="secondary" size="sm" leftIcon={<Bell className="h-4 w-4" />}>
              Notify
            </Button>
            <Button variant="secondary" size="sm" leftIcon={<MessageSquare className="h-4 w-4" />}>
              Chat
            </Button>
            <Button variant="ghost" size="sm" className="text-warning-600 hover:bg-warning-50" leftIcon={<AlertTriangle className="h-4 w-4" />}>
              Suspend
            </Button>
            {hasPermission('users.delete') && (
              <Button variant="ghost" size="sm" className="text-error-600 hover:bg-error-50" leftIcon={<Trash2 className="h-4 w-4" />}>
                Delete
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Tab navigation */}
      <div className="flex border-b border-neutral-200 overflow-x-auto" role="tablist">
        {tabs.filter(tab => tab !== 'Audit Log' || hasPermission('audit.view')).map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors',
              activeTab === tab
                ? 'border-brand-500 text-brand-700'
                : 'border-transparent text-neutral-500 hover:text-neutral-700'
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'Profile' && (
        <div className="grid grid-cols-2 gap-5">
          <Card>
            <CardHeader title="Business Details" />
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-neutral-500">Business Name</dt>
                <dd className="font-medium">{user.businessName}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500">GSTIN</dt>
                <dd className="font-mono text-xs">{user.gstin}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500">State</dt>
                <dd>{user.state}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500">PAN</dt>
                <dd className="font-mono text-xs">{user.pan.slice(0, 5)}****{user.pan.slice(-1)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500">Annual Turnover</dt>
                <dd><AmountDisplay amount={user.turnover} size="sm" /></dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500">Language Preference</dt>
                <dd>{user.language}</dd>
              </div>
            </dl>
          </Card>

          <Card>
            <CardHeader title="Account Info" />
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-neutral-500">User ID</dt>
                <dd className="font-mono text-xs">{user.id}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500">Plan</dt>
                <dd><Badge variant="brand">{user.plan}</Badge></dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500">Joined</dt>
                <dd>{formatDate(user.joinedAt)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500">Last Active</dt>
                <dd>{formatRelativeTime(user.lastActive)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500">Devices</dt>
                <dd>2 / 2 active</dd>
              </div>
            </dl>
          </Card>
        </div>
      )}

      {activeTab === 'Documents' && (
        <Card>
          <CardHeader title="Documents" subtitle={`${mockDocuments.length} documents`} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="User documents">
              <thead>
                <tr className="border-b border-neutral-200">
                  <th scope="col" className="px-4 py-2 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide">ID</th>
                  <th scope="col" className="px-4 py-2 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide">Category</th>
                  <th scope="col" className="px-4 py-2 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide">Date</th>
                  <th scope="col" className="px-4 py-2 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide">Status</th>
                  <th scope="col" className="px-4 py-2 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide">Confidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {mockDocuments.map((doc) => (
                  <tr key={doc.id} className="hover:bg-neutral-50">
                    <td className="px-4 py-3 font-mono text-xs text-brand-600">{doc.id}</td>
                    <td className="px-4 py-3"><Badge variant="brand" size="sm">{doc.category}</Badge></td>
                    <td className="px-4 py-3 text-neutral-600">{doc.date}</td>
                    <td className="px-4 py-3"><Badge variant={doc.status === 'Processed' ? 'success' : 'warning'} size="sm" dot>{doc.status}</Badge></td>
                    <td className="px-4 py-3">
                      <span className={cn('text-sm font-mono', doc.confidence >= 80 ? 'text-success-600' : 'text-warning-600')}>
                        {doc.confidence}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {activeTab === 'GST Returns' && (
        <Card>
          <CardHeader title="GST Returns" />
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="GST returns">
              <thead>
                <tr className="border-b border-neutral-200">
                  {['ID', 'Type', 'Period', 'Status', 'Net Tax', 'ARN'].map(h => (
                    <th key={h} scope="col" className="px-4 py-2 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {mockGstReturns.map((r) => (
                  <tr key={r.id} className="hover:bg-neutral-50">
                    <td className="px-4 py-3 font-mono text-xs text-brand-600">{r.id}</td>
                    <td className="px-4 py-3"><Badge variant="gst" size="sm">{r.type}</Badge></td>
                    <td className="px-4 py-3 text-neutral-600">{r.period}</td>
                    <td className="px-4 py-3"><Badge variant={r.status === 'Filed' ? 'success' : r.status === 'Pending Approval' ? 'warning' : 'neutral'} size="sm" dot>{r.status}</Badge></td>
                    <td className="px-4 py-3"><AmountDisplay amount={r.netTax} size="sm" colorCode /></td>
                    <td className="px-4 py-3 font-mono text-xs text-neutral-500">{r.arn ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {activeTab === 'Audit Log' && (
        <Card>
          <CardHeader title="Audit Log" subtitle="All actions by and on this user" />
          <div className="space-y-0 divide-y divide-neutral-100">
            {mockAuditLog.map((event) => (
              <div key={event.id} className="flex items-center gap-4 px-1 py-3">
                <div className="flex-1">
                  <p className="text-sm text-neutral-700">{event.action}</p>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    By: {event.by} · IP: {event.ip} · {formatRelativeTime(event.timestamp)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Placeholder for other tabs */}
      {(activeTab === 'ITR History' || activeTab === 'Loans' || activeTab === 'Subscription') && (
        <Card>
          <div className="py-12 flex flex-col items-center text-neutral-400">
            <p className="text-lg font-medium">{activeTab}</p>
            <p className="text-sm mt-1">Coming soon — API integration pending</p>
          </div>
        </Card>
      )}
    </div>
  )
}
