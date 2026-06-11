/**
 * CaAppointmentsPage — CA appointments calendar + list admin view (GAP-031, Wave 7)
 * Route: /ca/appointments
 * Perms: ca.appointments.read, ca.appointments.manage [confirm 7A]
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { List, Calendar, ExternalLink, Copy, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { t } from '@/i18n'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Card, CardHeader } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/EmptyState'
import { AlertBanner } from '@/components/shared/AlertBanner'
import { StatusTimeline } from '@/components/ui/StatusTimeline'
import { Drawer } from '@/components/ui/Drawer'
import { DateRangePicker, type DateRange } from '@/components/ui/DateRangePicker'
import { cn } from '@/lib/utils'
import {
  listAppointments,
  cancelAppointmentAsCA,
  type Appointment,
  type AppointmentStatus,
} from '@/lib/caApi'

// ---------------------------------------------------------------------------
// Status badge map (from spec §1.5)
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<AppointmentStatus, { variant: 'warning' | 'info' | 'brand' | 'success' | 'neutral' | 'error'; label: string }> = {
  REQUESTED:  { variant: 'warning',  label: 'ca.status.requested' },
  PENDING:    { variant: 'warning',  label: 'ca.status.requested' },
  CONFIRMED:  { variant: 'info',     label: 'ca.status.confirmed' },
  SCHEDULED:  { variant: 'info',     label: 'ca.status.confirmed' },
  IN_PROGRESS:{ variant: 'brand',    label: 'ca.status.inProgress' },
  COMPLETED:  { variant: 'success',  label: 'ca.status.completed' },
  CANCELLED:  { variant: 'neutral',  label: 'ca.status.cancelled' },
  NO_SHOW:    { variant: 'error',    label: 'ca.status.noShow' },
}

function AppointmentStatusBadge({ status }: { status: AppointmentStatus }) {
  const cfg = STATUS_CONFIG[status] ?? { variant: 'neutral' as const, label: status }
  return <Badge variant={cfg.variant}>{t(cfg.label)}</Badge>
}

// ---------------------------------------------------------------------------
// Appointment detail drawer
// ---------------------------------------------------------------------------

interface AppointmentDetailDrawerProps {
  appointment: Appointment | null
  onClose: () => void
  onCancel: (id: string, reason: string) => void
  cancelling: boolean
}

function AppointmentDetailDrawer({ appointment, onClose, onCancel, cancelling }: AppointmentDetailDrawerProps) {
  const [cancelReason, setCancelReason] = useState('')
  const [showCancelForm, setShowCancelForm] = useState(false)
  const [copied, setCopied] = useState(false)

  if (!appointment) return null

  function handleCopy() {
    if (appointment?.meetLink) {
      void navigator.clipboard.writeText(appointment.meetLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const canManage = appointment.status !== 'COMPLETED' && appointment.status !== 'CANCELLED'

  // Timeline steps
  const statusOrder: AppointmentStatus[] = ['REQUESTED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED']
  const currentIdx = statusOrder.indexOf(appointment.status)
  const timelineSteps = statusOrder.map((s, i) => ({
    id: s,
    label: t(STATUS_CONFIG[s]?.label ?? s),
    status: i < currentIdx ? 'completed' as const : i === currentIdx ? 'active' as const : 'pending' as const,
  }))

  return (
    <Drawer open onClose={onClose} title={t('ca.admin.appts.detail.title')} size="md">
      <div className="space-y-4 p-4">
        {/* Client info */}
        <div>
          <p className="text-sm font-semibold text-neutral-900">{appointment.clientName}</p>
          {appointment.clientBusinessName && (
            <p className="text-xs text-neutral-500">{appointment.clientBusinessName}</p>
          )}
        </div>

        {/* Status + timeline */}
        <div className="space-y-2">
          <AppointmentStatusBadge status={appointment.status} />
          {appointment.status !== 'CANCELLED' && (
            <StatusTimeline steps={timelineSteps} orientation="horizontal" />
          )}
        </div>

        {/* Details */}
        <div className="text-sm space-y-1.5">
          <div className="flex justify-between">
            <span className="text-neutral-500">{t('ca.admin.appts.col.dateTime')}</span>
            <span className="text-neutral-800 font-medium">
              {format(new Date(appointment.slotStart), 'dd/MM/yyyy HH:mm')} IST
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-500">{t('ca.admin.appts.col.topic')}</span>
            <span className="text-neutral-800">{t(`ca.confirm.topic.${appointment.topic.toLowerCase()}`)}</span>
          </div>
          {appointment.topicNote && (
            <div>
              <p className="text-neutral-500 text-xs">{t('ca.confirm.topicLabel')}</p>
              <p className="text-neutral-700 text-sm mt-0.5">{appointment.topicNote}</p>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-neutral-500">{t('ca.admin.appts.col.channel')}</span>
            <span className="text-neutral-800">{appointment.channel}</span>
          </div>
          {appointment.meetLink && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-neutral-500">Meet link</span>
              <div className="flex gap-1">
                <a
                  href={appointment.meetLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-brand-600 hover:underline flex items-center gap-0.5"
                  aria-label={`Join video call with ${appointment.caName}`}
                >
                  <ExternalLink className="h-3 w-3" />
                  {t('ca.appt.join')}
                </a>
                <button onClick={handleCopy} className="text-neutral-400 hover:text-neutral-600">
                  {copied ? <CheckCircle className="h-3.5 w-3.5 text-success-500" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          )}
          {appointment.rating != null && (
            <div className="flex justify-between">
              <span className="text-neutral-500">Rating</span>
              <span className="text-neutral-800">{'★'.repeat(appointment.rating)}{'☆'.repeat(5 - appointment.rating)}</span>
            </div>
          )}
        </div>

        {/* CA-initiated cancel */}
        {canManage && (
          <div className="border-t border-neutral-100 pt-4">
            {showCancelForm ? (
              <div className="space-y-2">
                <textarea
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                  rows={2}
                  placeholder={t('ca.admin.appts.cancelReason')}
                  className="w-full text-sm rounded-lg border border-neutral-300 px-2.5 py-1.5 focus:border-brand-500 outline-none resize-none"
                />
                <div className="flex gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => onCancel(appointment.id, cancelReason)}
                    loading={cancelling}
                    disabled={!cancelReason.trim()}
                  >
                    {t('ca.appt.cancel')}
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setShowCancelForm(false)}>
                    {t('common.back')}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="text-error-600"
                onClick={() => setShowCancelForm(true)}
              >
                {t('ca.admin.appts.caCancelAction')}
              </Button>
            )}
          </div>
        )}
      </div>
    </Drawer>
  )
}

// ---------------------------------------------------------------------------
// List view
// ---------------------------------------------------------------------------

interface AppointmentsListProps {
  appointments: Appointment[]
  onRowClick: (a: Appointment) => void
}

function AppointmentsList({ appointments, onRowClick }: AppointmentsListProps) {
  return (
    <div className="overflow-x-auto rounded-xl bg-white shadow-sm border border-neutral-100">
      <table className="w-full text-sm" role="grid" aria-label={t('ca.admin.appts.title')}>
        <thead>
          <tr className="bg-neutral-50 border-b border-neutral-200">
            <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">
              {t('ca.admin.appts.col.client')}
            </th>
            <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">
              {t('ca.admin.appts.col.dateTime')}
            </th>
            <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">
              {t('ca.admin.appts.col.topic')}
            </th>
            <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">
              {t('ca.admin.appts.col.status')}
            </th>
            <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wider">
              {t('ca.admin.appts.col.channel')}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {appointments.map(appt => (
            <tr
              key={appt.id}
              className="hover:bg-neutral-50 cursor-pointer"
              onClick={() => onRowClick(appt)}
            >
              <td className="px-4 py-3">
                <p className="font-medium text-neutral-800">{appt.clientName}</p>
                {appt.clientBusinessName && (
                  <p className="text-xs text-neutral-400">{appt.clientBusinessName}</p>
                )}
              </td>
              <td className="px-4 py-3 text-neutral-700">
                {format(new Date(appt.slotStart), 'dd/MM/yyyy HH:mm')} IST
              </td>
              <td className="px-4 py-3 text-neutral-600">
                {t(`ca.confirm.topic.${appt.topic.toLowerCase()}`)}
              </td>
              <td className="px-4 py-3">
                <AppointmentStatusBadge status={appt.status} />
              </td>
              <td className="px-4 py-3">
                {appt.meetLink ? (
                  <a
                    href={appt.meetLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="text-xs text-brand-600 hover:underline flex items-center gap-0.5"
                    aria-label={`Join video call with ${appt.caName}`}
                  >
                    <ExternalLink className="h-3 w-3" />
                    {t('ca.appt.join')}
                  </a>
                ) : (
                  <span className="text-xs text-neutral-400">{appt.channel}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function CaAppointmentsPage() {
  const queryClient = useQueryClient()
  const [view, setView] = useState<'list' | 'calendar'>('list')
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | ''>('')
  const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null })
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null)

  const queryParams = {
    status: statusFilter || undefined,
    dateFrom: dateRange.start?.toISOString(),
    dateTo: dateRange.end?.toISOString(),
    pageSize: 50,
  }

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['ca-appointments', queryParams],
    queryFn: () => listAppointments(queryParams),
    staleTime: 30_000,
  })

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => cancelAppointmentAsCA(id, reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ca-appointments'] })
      toast.success(t('ca.appt.cancelSuccess'))
      setSelectedAppt(null)
    },
    onError: () => toast.error(t('common.error.save')),
  })

  const appointments = data?.items ?? []
  const hasFilters = !!(statusFilter || dateRange.start)
  const isEmpty = !isLoading && !isError && appointments.length === 0

  return (
    <main aria-labelledby="ca-appts-title" className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <nav aria-label="Breadcrumb" className="text-xs text-neutral-400 mb-1">
            {t('ca.admin.appts.breadcrumb')}
          </nav>
          <h1 id="ca-appts-title" className="text-xl font-bold text-neutral-900">
            {t('ca.admin.appts.title')}
          </h1>
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-1 border border-neutral-200 rounded-lg p-0.5 bg-white" role="group" aria-label="View">
          <button
            onClick={() => setView('list')}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors',
              view === 'list' ? 'bg-neutral-100 text-neutral-800' : 'text-neutral-500 hover:text-neutral-700'
            )}
            aria-pressed={view === 'list'}
          >
            <List className="h-4 w-4" aria-hidden="true" />
            {t('ca.admin.appts.view.list')}
          </button>
          <button
            onClick={() => setView('calendar')}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors',
              view === 'calendar' ? 'bg-neutral-100 text-neutral-800' : 'text-neutral-500 hover:text-neutral-700'
            )}
            aria-pressed={view === 'calendar'}
          >
            <Calendar className="h-4 w-4" aria-hidden="true" />
            {t('ca.admin.appts.view.calendar')}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <DateRangePicker value={dateRange} onChange={setDateRange} />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as AppointmentStatus | '')}
          className="text-sm rounded-lg border border-neutral-300 px-2.5 py-1.5 focus:outline-none focus:border-brand-500"
          aria-label={t('ca.admin.appts.filter.status')}
        >
          <option value="">{t('ca.admin.appts.filter.allStatuses')}</option>
          {Object.keys(STATUS_CONFIG).map(s => (
            <option key={s} value={s}>{t(STATUS_CONFIG[s as AppointmentStatus].label)}</option>
          ))}
        </select>
        {hasFilters && (
          <button
            onClick={() => { setStatusFilter(''); setDateRange({ start: null, end: null }) }}
            className="text-xs text-brand-600 hover:underline"
          >
            {t('common.clearFilters')}
          </button>
        )}
      </div>

      {/* Error */}
      {isError && (
        <AlertBanner
          type="error"
          title={t('common.error.load')}
          actions={
            <button onClick={() => void refetch()} className="text-xs font-medium text-error-700 underline">
              {t('common.retry')}
            </button>
          }
        />
      )}

      {/* Loading */}
      {isLoading && <Skeleton variant="dataTableDense" />}

      {/* Empty */}
      {isEmpty && (
        <EmptyState
          variant="generic"
          size="md"
          description={hasFilters ? t('ca.admin.appts.emptyFiltered') : t('ca.admin.appts.empty')}
          primaryCta={hasFilters ? {
            label: t('common.clearFilters'),
            onPress: () => { setStatusFilter(''); setDateRange({ start: null, end: null }) },
          } : undefined}
        />
      )}

      {/* Calendar view stub (future full calendar integration [confirm 7A]) */}
      {!isLoading && !isError && appointments.length > 0 && view === 'calendar' && (
        <Card>
          <CardHeader title={t('ca.admin.appts.view.calendar')} />
          <div className="py-8 text-center text-sm text-neutral-400">
            {t('ca.admin.appts.calendarComingSoon')}
          </div>
          {/* Fallback: always show list even in calendar mode */}
          <AppointmentsList appointments={appointments} onRowClick={setSelectedAppt} />
        </Card>
      )}

      {/* List view */}
      {!isLoading && !isError && appointments.length > 0 && view === 'list' && (
        <AppointmentsList appointments={appointments} onRowClick={setSelectedAppt} />
      )}

      {/* Detail drawer */}
      <AppointmentDetailDrawer
        appointment={selectedAppt}
        onClose={() => setSelectedAppt(null)}
        onCancel={(id, reason) => cancelMutation.mutate({ id, reason })}
        cancelling={cancelMutation.isPending}
      />
    </main>
  )
}
