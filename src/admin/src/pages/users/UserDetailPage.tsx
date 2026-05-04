import { useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Bell, MessageSquare, AlertTriangle, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card, CardHeader } from '@/components/ui/Card'
import { AmountDisplay } from '@/components/ui/AmountDisplay'
import { formatDate, formatRelativeTime, getInitials, getAvatarColor } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { usePermission } from '@/hooks/usePermission'
import {
  getAdminOrgGstReturns,
  getAdminUserDetail,
  getAdminUserDocuments,
} from '@/lib/userAdminApi'
import { getAdminAuditEvents } from '@/lib/dashboardApi'

const tabs = ['Profile', 'Documents', 'GST Returns', 'ITR History', 'Loans', 'Subscription', 'Audit Log'] as const
type Tab = typeof tabs[number]

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<Tab>('Profile')
  const { hasPermission } = usePermission()

  // Live user detail (profile + business)
  const { data: user, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-user-detail', id],
    queryFn: () => getAdminUserDetail(id!),
    enabled: !!id,
    staleTime: 30_000,
  })

  // Tab-scoped fetches — only fire when the matching tab is active.
  const { data: documents = [] } = useQuery({
    queryKey: ['admin-user-documents', id],
    queryFn: () => getAdminUserDocuments(id!, 50),
    enabled: !!id && activeTab === 'Documents',
  })

  const { data: gstReturns = [] } = useQuery({
    queryKey: ['admin-user-gst-returns', user?.business?.organizationId],
    queryFn: () => getAdminOrgGstReturns(user!.business!.organizationId, 50),
    enabled: !!user?.business?.organizationId && activeTab === 'GST Returns',
  })

  const { data: auditEvents = [] } = useQuery({
    queryKey: ['admin-user-audit', id],
    queryFn: () => getAdminAuditEvents(50, id!),
    enabled: !!id && activeTab === 'Audit Log',
  })

  if (isLoading) {
    return (
      <Card>
        <p className="text-sm text-neutral-500">Loading user…</p>
      </Card>
    )
  }

  if (isError || !user) {
    return (
      <Card>
        <p className="text-sm text-error-600">Could not load user.</p>
        <Button variant="ghost" size="sm" onClick={() => void refetch()}>Retry</Button>
      </Card>
    )
  }

  const initials = getInitials(user.name)
  const bgColor = getAvatarColor(user.name)
  const status = user.isActive ? 'Active' : 'Suspended'

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
                <Badge variant={user.isActive ? 'success' : 'error'} dot>
                  {status}
                </Badge>
              </div>
              <div className="flex items-center gap-4 mt-2 text-sm text-neutral-500">
                {user.phone && <><span>{user.phone}</span><span>·</span></>}
                {user.email && <><span>{user.email}</span><span>·</span></>}
                <span>Joined {formatDate(user.joinedAt)}</span>
              </div>
              {user.business && (
                <div className="flex items-center gap-4 mt-1 text-sm text-neutral-500">
                  <span className="font-medium text-neutral-700">{user.business.businessName}</span>
                  {user.business.gstin && (
                    <>
                      <span>·</span>
                      <span className="font-mono text-xs">{user.business.gstin}</span>
                    </>
                  )}
                  {user.business.state && (
                    <>
                      <span>·</span>
                      <span>{user.business.state}</span>
                    </>
                  )}
                </div>
              )}
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

      {/* Profile tab */}
      {activeTab === 'Profile' && (
        <div className="grid grid-cols-2 gap-5">
          <Card>
            <CardHeader title="Business Details" />
            <dl className="space-y-3 text-sm">
              {user.business ? (
                <>
                  <div className="flex justify-between">
                    <dt className="text-neutral-500">Business Name</dt>
                    <dd className="font-medium">{user.business.businessName}</dd>
                  </div>
                  {user.business.gstin && (
                    <div className="flex justify-between">
                      <dt className="text-neutral-500">GSTIN</dt>
                      <dd className="font-mono text-xs">{user.business.gstin}</dd>
                    </div>
                  )}
                  {user.business.state && (
                    <div className="flex justify-between">
                      <dt className="text-neutral-500">State</dt>
                      <dd>{user.business.state}</dd>
                    </div>
                  )}
                  {user.business.panNumber && (
                    <div className="flex justify-between">
                      <dt className="text-neutral-500">PAN</dt>
                      <dd className="font-mono text-xs">
                        {user.business.panNumber.slice(0, 5)}****{user.business.panNumber.slice(-1)}
                      </dd>
                    </div>
                  )}
                  {user.business.annualTurnoverInr != null && (
                    <div className="flex justify-between">
                      <dt className="text-neutral-500">Annual Turnover</dt>
                      <dd><AmountDisplay amount={user.business.annualTurnoverInr} size="sm" /></dd>
                    </div>
                  )}
                  {user.business.industryType && (
                    <div className="flex justify-between">
                      <dt className="text-neutral-500">Industry</dt>
                      <dd>{user.business.industryType}</dd>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-neutral-400 text-sm">No business profile linked.</p>
              )}
              {user.preferredLanguage && (
                <div className="flex justify-between">
                  <dt className="text-neutral-500">Language</dt>
                  <dd>{user.preferredLanguage}</dd>
                </div>
              )}
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
                <dt className="text-neutral-500">Status</dt>
                <dd><Badge variant={user.isActive ? 'success' : 'error'}>{status}</Badge></dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-neutral-500">Joined</dt>
                <dd>{formatDate(user.joinedAt)}</dd>
              </div>
            </dl>
          </Card>
        </div>
      )}

      {/* Documents tab */}
      {activeTab === 'Documents' && (
        <Card>
          <CardHeader title="Documents" subtitle={`${documents.length} document${documents.length === 1 ? '' : 's'}`} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="User documents">
              <thead>
                <tr className="border-b border-neutral-200">
                  <th scope="col" className="px-4 py-2 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide">ID</th>
                  <th scope="col" className="px-4 py-2 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide">File</th>
                  <th scope="col" className="px-4 py-2 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide">Vendor</th>
                  <th scope="col" className="px-4 py-2 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide">Amount</th>
                  <th scope="col" className="px-4 py-2 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide">Status</th>
                  <th scope="col" className="px-4 py-2 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide">Uploaded</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {documents.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-neutral-400">No documents.</td></tr>
                )}
                {documents.map((doc) => (
                  <tr key={doc.id} className="hover:bg-neutral-50">
                    <td className="px-4 py-3 font-mono text-xs text-brand-600">{doc.id.slice(0, 8)}</td>
                    <td className="px-4 py-3 text-neutral-700">{doc.fileName}</td>
                    <td className="px-4 py-3 text-neutral-600">{doc.vendorName ?? '—'}</td>
                    <td className="px-4 py-3">{doc.amount != null ? <AmountDisplay amount={doc.amount} size="sm" /> : '—'}</td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={doc.status === 'PROCESSED' ? 'success' : doc.status === 'REJECTED' ? 'error' : 'warning'}
                        size="sm"
                        dot
                      >
                        {doc.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-500">{formatRelativeTime(new Date(doc.uploadedAt))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* GST Returns tab */}
      {activeTab === 'GST Returns' && (
        <Card>
          <CardHeader title="GST Returns" subtitle={user.business ? user.business.businessName : 'No org linked'} />
          <div className="overflow-x-auto">
            {!user.business ? (
              <p className="px-4 py-6 text-neutral-400">No organisation linked to this user.</p>
            ) : (
              <table className="w-full text-sm" aria-label="GST returns">
                <thead>
                  <tr className="border-b border-neutral-200">
                    {['Type', 'FY', 'Period', 'Status', 'Net Tax', 'ARN', 'Created'].map(h => (
                      <th key={h} scope="col" className="px-4 py-2 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {gstReturns.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-6 text-center text-neutral-400">No GST returns.</td></tr>
                  )}
                  {gstReturns.map((r) => (
                    <tr key={r.id} className="hover:bg-neutral-50">
                      <td className="px-4 py-3"><Badge variant="gst" size="sm">{r.returnType}</Badge></td>
                      <td className="px-4 py-3 text-neutral-600">{r.financialYear}</td>
                      <td className="px-4 py-3 text-neutral-600">{r.periodMonth ?? '—'}</td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={r.status === 'FILED' ? 'success' : r.status === 'PENDING_APPROVAL' ? 'warning' : 'neutral'}
                          size="sm" dot
                        >
                          {r.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3"><AmountDisplay amount={r.netTaxPayable} size="sm" colorCode /></td>
                      <td className="px-4 py-3 font-mono text-xs text-neutral-500">{r.arnNumber ?? '—'}</td>
                      <td className="px-4 py-3 text-xs text-neutral-500">{formatRelativeTime(new Date(r.createdAt))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      )}

      {/* Audit log tab */}
      {activeTab === 'Audit Log' && (
        <Card>
          <CardHeader title="Audit Log" subtitle={`Actions by ${user.name}`} />
          <div className="space-y-0 divide-y divide-neutral-100">
            {auditEvents.length === 0 && (
              <p className="px-1 py-6 text-center text-neutral-400 text-sm">No audit events for this user.</p>
            )}
            {auditEvents.map((event) => (
              <div key={event.id} className="flex items-center gap-4 px-1 py-3">
                <div className="flex-1">
                  <p className="text-sm text-neutral-700">
                    {event.action} · {event.entityType}
                  </p>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    {event.service} · {event.actorType.toLowerCase()} · {formatRelativeTime(new Date(event.eventTime))}
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
            <p className="text-sm mt-1">Coming soon — admin per-user endpoint pending</p>
          </div>
        </Card>
      )}
    </div>
  )
}
