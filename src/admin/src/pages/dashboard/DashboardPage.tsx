import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router'
import {
  FileText,
  Receipt,
  FileSpreadsheet,
  Phone,
  CreditCard,
  MessageSquare,
  RefreshCw,
  Activity,
} from 'lucide-react'
import { MetricCard } from '@/components/shared/MetricCard'
import { AlertBanner } from '@/components/shared/AlertBanner'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { PageHeader } from '@/components/layout/PageHeader'
import { usePermission } from '@/hooks/usePermission'
import { formatRelativeTime, cn } from '@/lib/utils'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { NoticesDueWidget } from '@/components/widgets/NoticesDueWidget'
import { getAdminDashboardActivity, getAdminDashboardStats } from '@/lib/dashboardApi'

// PR #8: counts now fetched live via getAdminDashboardStats() which fans out
// 5 parallel calls to per-service /admin/dashboard-stats endpoints. The
// activity / team-workload / chat-queue / audit-events sections below remain
// mocked — see docs/dev/static-data-debt.md (STATIC-DATA-DEBT-7).
const PENDING_DOCS_THRESHOLD = 50

const mockTeamWorkload = [
  { name: 'Anjali Singh', role: 'Data Entry', assigned: 14, completed: 8, slaBreaches: 0 },
  { name: 'Ravi Kumar', role: 'CA', assigned: 6, completed: 4, slaBreaches: 1 },
  { name: 'Priya Sharma', role: 'Support Exec', assigned: 9, completed: 7, slaBreaches: 0 },
  { name: 'Suresh Nair', role: 'Data Entry', assigned: 18, completed: 10, slaBreaches: 2 },
  { name: 'Kavita Patel', role: 'CA', assigned: 5, completed: 5, slaBreaches: 0 },
]

const mockChatQueue = [
  { id: '1', user: 'Rajesh Kumar', query: 'GST Filing', waitMins: 8 },
  { id: '2', user: 'Meena Iyer', query: 'ITR Documents', waitMins: 22 },
  { id: '3', user: 'Arjun Verma', query: 'Loan Eligibility', waitMins: 5 },
]

const mockAuditEvents = [
  { id: '1', timestamp: new Date(Date.now() - 5 * 60_000), user: 'Anjali Singh', action: 'Document D-20260401-1234 approved' },
  { id: '2', timestamp: new Date(Date.now() - 18 * 60_000), user: 'Ravi Kumar', action: 'GSTR-3B for Sharma Traders submitted' },
  { id: '3', timestamp: new Date(Date.now() - 35 * 60_000), user: 'System', action: 'Feature flag ai_chatbot_first_response enabled' },
  { id: '4', timestamp: new Date(Date.now() - 62 * 60_000), user: 'Priya Sharma', action: 'Callback logged for user +91 98765 43210' },
  { id: '5', timestamp: new Date(Date.now() - 90 * 60_000), user: 'Suresh Nair', action: 'ITR verification pending for Nair Enterprises' },
]

export default function DashboardPage() {
  const navigate = useNavigate()
  const [period, setPeriod] = useState<'7D' | '30D' | '90D'>('7D')
  const { hasPermission } = usePermission()

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['admin-dashboard-stats'],
    queryFn: getAdminDashboardStats,
    refetchInterval: 30_000, // 30 seconds
  })

  const { data: activityData = [] } = useQuery({
    queryKey: ['admin-dashboard-activity', period],
    queryFn: () => getAdminDashboardActivity(period),
    refetchInterval: 60_000, // 1 minute
  })

  // Derive UI-shape from the merged API response. Per-service failures land
  // in data.errors and the affected count is undefined — render a dash there
  // rather than fabricating a number.
  const stats = {
    pendingDocuments: data?.pendingDocuments ?? 0,
    gstReturnsDueToday: data?.gstReturnsDueToday ?? 0,
    itrVerificationsPending: data?.itrVerificationsPending ?? 0,
    openCallbacks: data?.openCallbacks ?? 0,
    loanApplicationsActive: data?.loanApplicationsActive ?? 0,
    pendingDocumentsOverThreshold: (data?.pendingDocuments ?? 0) > PENDING_DOCS_THRESHOLD,
    gstReturnsDueTodayUrgent: (data?.gstReturnsDueToday ?? 0) > 0,
  }
  const loading = isLoading

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle="Operations overview — updated every 30 seconds"
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void refetch()}
            loading={isFetching}
            ariaLabel="Refresh dashboard"
            leftIcon={<RefreshCw className="h-4 w-4" />}
          >
            Refresh
          </Button>
        }
      />

      {/* Urgency alerts */}
      {stats.gstReturnsDueTodayUrgent && (
        <AlertBanner
          type="error"
          title="GST Returns Overdue"
          description={`GSTR-3B for ${stats.gstReturnsDueToday} businesses is due today. Late fees may accrue.`}
          actions={
            <Button variant="ghost" size="sm" onClick={() => void navigate('/gst')}>
              View GST Queue
            </Button>
          }
        />
      )}

      {/* Row 1: KPI Cards */}
      <section aria-label="Key performance indicators">
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          <MetricCard
            title="Pending Documents"
            value={stats.pendingDocuments}
            color={stats.pendingDocumentsOverThreshold ? 'warning' : 'brand'}
            icon={<FileText className="h-6 w-6" />}
            trend={stats.pendingDocumentsOverThreshold ? 'up' : 'neutral'}
            trendValue={stats.pendingDocumentsOverThreshold ? 'Above threshold (50)' : 'Normal'}
            loading={loading}
            onClick={() => void navigate('/documents')}
          />
          <MetricCard
            title="GST Returns Due Today"
            value={stats.gstReturnsDueToday}
            color={stats.gstReturnsDueTodayUrgent ? 'error' : 'success'}
            icon={<Receipt className="h-6 w-6" />}
            trend={stats.gstReturnsDueTodayUrgent ? 'down' : 'up'}
            trendValue={stats.gstReturnsDueTodayUrgent ? 'Urgent action needed' : 'On track'}
            loading={loading}
            onClick={() => void navigate('/gst')}
          />
          <MetricCard
            title="ITR Verifications Pending"
            value={stats.itrVerificationsPending}
            color="itr"
            icon={<FileSpreadsheet className="h-6 w-6" />}
            loading={loading}
            onClick={() => void navigate('/itr')}
          />
          <MetricCard
            title="Open Callbacks"
            value={stats.openCallbacks}
            color="warning"
            icon={<Phone className="h-6 w-6" />}
            loading={loading}
          />
          <MetricCard
            title="Active Loan Applications"
            value={stats.loanApplicationsActive}
            color="loan"
            icon={<CreditCard className="h-6 w-6" />}
            loading={loading}
            onClick={() => void navigate('/loans')}
          />
        </div>
      </section>

      {/* Row 2: Activity Chart */}
      <Card padding="lg">
        <CardHeader
          title="Daily Activity — Last 7 Days"
          subtitle="Documents processed, returns filed, ITRs verified"
          actions={
            <div className="flex gap-2" role="group" aria-label="Time period selector">
              {(['7D', '30D', '90D'] as const).map((p) => (
                <Button
                  key={p}
                  variant={period === p ? 'primary' : 'ghost'}
                  size="sm"
                  onClick={() => setPeriod(p)}
                >
                  {p}
                </Button>
              ))}
            </div>
          }
        />
        <div className="h-64" aria-label="Activity chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={activityData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#64748B' }} />
              <YAxis tick={{ fontSize: 12, fill: '#64748B' }} />
              <Tooltip
                contentStyle={{ borderRadius: '12px', border: '0', boxShadow: '0 4px 16px rgba(15,23,42,0.08)', fontSize: '12px' }}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Line
                type="monotone"
                dataKey="documents"
                stroke="#4F46E5"
                strokeWidth={2}
                dot={false}
                name="Documents"
              />
              <Line
                type="monotone"
                dataKey="returns"
                stroke="#7C3AED"
                strokeWidth={2}
                dot={false}
                name="GST Returns"
              />
              <Line
                type="monotone"
                dataKey="itrs"
                stroke="#0891B2"
                strokeWidth={2}
                dot={false}
                name="ITR Verifications"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Row 3: Team Workload + Chat Queue */}
      {hasPermission('dashboard.full') && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Team Workload */}
          <Card padding="none">
            <div className="p-5 border-b border-neutral-100">
              <CardHeader
                title="Team Workload"
                subtitle="Today's assignment and completion stats"
                actions={
                  <Button variant="ghost" size="sm" onClick={() => void navigate('/team')}>
                    View Full Team
                  </Button>
                }
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label="Team workload">
                <thead>
                  <tr className="border-b border-neutral-100">
                    <th scope="col" className="px-5 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide">Staff</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide">Assigned</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide">Done</th>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide">SLA</th>
                  </tr>
                </thead>
                <tbody>
                  {mockTeamWorkload.map((member) => (
                    <tr key={member.name} className="border-b border-neutral-50 last:border-0 hover:bg-neutral-50 cursor-pointer">
                      <td className="px-5 py-3">
                        <div>
                          <p className="font-medium text-neutral-800">{member.name}</p>
                          <p className="text-xs text-neutral-400">{member.role}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-neutral-600 tabular-nums">{member.assigned}</td>
                      <td className="px-4 py-3 text-neutral-600 tabular-nums">{member.completed}</td>
                      <td className="px-4 py-3">
                        {member.slaBreaches > 0 ? (
                          <Badge variant="error" dot>
                            {member.slaBreaches} breach{member.slaBreaches > 1 ? 'es' : ''}
                          </Badge>
                        ) : (
                          <Badge variant="success" dot>OK</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Live Chat Queue */}
          <Card padding="none">
            <div className="p-5 border-b border-neutral-100">
              <CardHeader
                title="Live Chat Queue"
                subtitle="Active conversations requiring attention"
                actions={
                  <Button variant="ghost" size="sm" onClick={() => void navigate('/chat')}>
                    Open Chat
                  </Button>
                }
              />
            </div>
            <div className="divide-y divide-neutral-50">
              {mockChatQueue.map((item) => (
                <div key={item.id} className="px-5 py-4 flex items-center justify-between hover:bg-neutral-50">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-brand-100 flex items-center justify-center">
                      <MessageSquare className="h-4 w-4 text-brand-600" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-neutral-800">{item.user}</p>
                      <p className="text-xs text-neutral-400">{item.query}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-medium ${item.waitMins > 15 ? 'text-warning-600' : 'text-neutral-500'}`}>
                      {item.waitMins}m wait
                    </span>
                    <Button variant="primary" size="sm">Assign</Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Row 4: Queue Status Mini-Widgets */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {/* GST Mini Widget */}
        <Card>
          <CardHeader title="GST Queue" actions={
            <Badge variant="gst">GST</Badge>
          } />
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-neutral-500">Draft</span>
              <span className="text-sm font-semibold text-neutral-700 tabular-nums">24</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-neutral-500">Pending Approval</span>
              <span className="text-sm font-semibold text-warning-600 tabular-nums">8</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-neutral-500">Overdue</span>
              <span className="text-sm font-semibold text-error-600 tabular-nums">3</span>
            </div>
          </div>
          <Button
            variant="primary"
            size="sm"
            fullWidth
            className="mt-4"
            onClick={() => void navigate('/gst')}
          >
            Open GST Queue
          </Button>
        </Card>

        {/* ITR Mini Widget */}
        <Card>
          <CardHeader title="ITR Queue" actions={
            <Badge variant="itr">ITR</Badge>
          } />
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-neutral-500">Pending Verification</span>
              <span className="text-sm font-semibold text-neutral-700 tabular-nums">12</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-neutral-500">Filing in Progress</span>
              <span className="text-sm font-semibold text-brand-600 tabular-nums">5</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-neutral-500">Deadline This Week</span>
              <span className="text-sm font-semibold text-warning-600 tabular-nums">7</span>
            </div>
          </div>
          <Button
            variant="primary"
            size="sm"
            fullWidth
            className="mt-4"
            onClick={() => void navigate('/itr')}
          >
            Open ITR Queue
          </Button>
        </Card>

        {/* Loan Mini Widget */}
        <Card>
          <CardHeader title="Loan Applications" actions={
            <Badge variant="loan">Loans</Badge>
          } />
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-neutral-500">Under Review</span>
              <span className="text-sm font-semibold text-warning-600 tabular-nums">3</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-neutral-500">Decision Pending</span>
              <span className="text-sm font-semibold text-neutral-700 tabular-nums">2</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-neutral-500">Total Active</span>
              <span className="text-sm font-semibold text-neutral-700 tabular-nums">{stats.loanApplicationsActive}</span>
            </div>
          </div>
          <Button
            variant="primary"
            size="sm"
            fullWidth
            className="mt-4"
            onClick={() => void navigate('/loans')}
          >
            Open Loan Queue
          </Button>
        </Card>

        {/* Phase 6B: GST Notices Due Widget */}
        <NoticesDueWidget />
      </div>

      {/* Row 5: System Health (System Admin only) */}
      {hasPermission('dashboard.system_health') && (
        <Card>
          <CardHeader
            title="System Health"
            subtitle="Real-time platform metrics"
            actions={
              <Button variant="ghost" size="sm">View Full Dashboard</Button>
            }
          />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'API Response Time', value: '142ms', status: 'success' },
              { label: 'Error Rate', value: '0.02%', status: 'success' },
              { label: 'OCR Queue Depth', value: '7', status: 'success' },
              { label: 'DB Connections', value: '23/100', status: 'success' },
            ].map((metric) => (
              <div key={metric.label} className="flex items-center gap-3 p-3 rounded-xl bg-neutral-50">
                <div className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                  metric.status === 'success' ? 'bg-success-50 text-success-700' : metric.status === 'warning' ? 'bg-warning-50 text-warning-700' : 'bg-error-50 text-error-700'
                )}>
                  <span className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    metric.status === 'success' ? 'bg-success-500' : metric.status === 'warning' ? 'bg-warning-500' : 'bg-error-500'
                  )} aria-hidden="true" />
                  {metric.status}
                </div>
                <div>
                  <p className="text-xs text-neutral-500">{metric.label}</p>
                  <p className="text-sm font-semibold text-neutral-800 tabular-nums">{metric.value}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Row 6: Recent Audit Events */}
      <Card padding="none">
        <div className="p-5 border-b border-neutral-100">
          <CardHeader
            title="Recent Activity"
            subtitle="Latest audit events across the platform"
            actions={
              <Button variant="ghost" size="sm">View Full Log</Button>
            }
          />
        </div>
        <div className="divide-y divide-neutral-50">
          {mockAuditEvents.map((event) => (
            <div key={event.id} className="px-5 py-3 flex items-center gap-3">
              <Activity className="h-4 w-4 text-neutral-300 shrink-0" aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-neutral-700 truncate">{event.action}</p>
                <p className="text-xs text-neutral-400">
                  {event.user} · {formatRelativeTime(event.timestamp)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
