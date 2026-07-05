/**
 * CaAppointmentsPage — CA appointments calendar + list admin view (GAP-031, Wave 7)
 * DG-CHAT-09: replaced calendar stub with real month/week/day grid
 * Route: /ca/appointments
 * Perms: ca.appointments.read, ca.appointments.manage [confirm 7A]
 */
import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { List, Calendar, ExternalLink, Copy, CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  addWeeks,
  subMonths,
  subWeeks,
  isSameMonth,
  isToday,
  parseISO,
} from 'date-fns'
import { t } from '@/i18n'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
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

type CalendarView = 'list' | 'month' | 'week' | 'day'

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
// Status colour for calendar dots
// ---------------------------------------------------------------------------

const STATUS_DOT: Record<AppointmentStatus, string> = {
  REQUESTED:   'bg-warning-400',
  PENDING:     'bg-warning-400',
  CONFIRMED:   'bg-info-400',
  SCHEDULED:   'bg-info-400',
  IN_PROGRESS: 'bg-brand-400',
  COMPLETED:   'bg-success-400',
  CANCELLED:   'bg-neutral-300',
  NO_SHOW:     'bg-error-400',
}

// ---------------------------------------------------------------------------
// Month Calendar Grid
// ---------------------------------------------------------------------------

interface MonthGridProps {
  appointments: Appointment[]
  focusDate: Date
  onDateClick: (d: Date) => void
  onApptClick: (a: Appointment) => void
}

function MonthGrid({ appointments, focusDate, onDateClick, onApptClick }: MonthGridProps) {
  const monthStart = startOfMonth(focusDate)
  const monthEnd = endOfMonth(focusDate)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })

  const days: Date[] = []
  let cur = gridStart
  while (cur <= gridEnd) {
    days.push(cur)
    cur = addDays(cur, 1)
  }

  const apptsByDay = useMemo(() => {
    const map: Record<string, Appointment[]> = {}
    for (const appt of appointments) {
      const key = format(parseISO(appt.slotStart), 'yyyy-MM-dd')
      if (!map[key]) map[key] = []
      map[key].push(appt)
    }
    return map
  }, [appointments])

  const DAY_HEADERS = [
    t('ca.calendar.mon'), t('ca.calendar.tue'), t('ca.calendar.wed'),
    t('ca.calendar.thu'), t('ca.calendar.fri'), t('ca.calendar.sat'), t('ca.calendar.sun'),
  ]

  return (
    <div>
      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_HEADERS.map(d => (
          <div key={d} className="text-center text-xs font-semibold text-neutral-500 py-1">{d}</div>
        ))}
      </div>
      {/* Day cells */}
      <div className="grid grid-cols-7 gap-px bg-neutral-200 border border-neutral-200 rounded-lg overflow-hidden">
        {days.map(day => {
          const key = format(day, 'yyyy-MM-dd')
          const dayAppts = apptsByDay[key] ?? []
          const inMonth = isSameMonth(day, focusDate)
          const todayFlag = isToday(day)

          return (
            <div
              key={key}
              onClick={() => onDateClick(day)}
              className={cn(
                'min-h-[80px] p-1.5 bg-white cursor-pointer hover:bg-neutral-50 transition-colors',
                !inMonth && 'bg-neutral-50 opacity-40',
              )}
              role="gridcell"
              aria-label={format(day, 'EEEE, d MMMM yyyy')}
            >
              <div className={cn(
                'text-xs font-medium mb-1 h-5 w-5 flex items-center justify-center rounded-full',
                todayFlag ? 'bg-brand-600 text-white' : inMonth ? 'text-neutral-700' : 'text-neutral-400',
              )}>
                {format(day, 'd')}
              </div>
              <div className="space-y-px">
                {dayAppts.slice(0, 3).map(appt => (
                  <button
                    key={appt.id}
                    onClick={e => { e.stopPropagation(); onApptClick(appt) }}
                    className="w-full text-left text-[10px] leading-tight px-1 py-0.5 rounded bg-brand-50 text-brand-700 hover:bg-brand-100 truncate flex items-center gap-0.5"
                    title={`${format(parseISO(appt.slotStart), 'HH:mm')} — ${appt.clientName}`}
                  >
                    <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', STATUS_DOT[appt.status] ?? 'bg-neutral-300')} />
                    <span className="truncate">{format(parseISO(appt.slotStart), 'HH:mm')} {appt.clientName}</span>
                  </button>
                ))}
                {dayAppts.length > 3 && (
                  <p className="text-[10px] text-neutral-400 pl-1">+{dayAppts.length - 3} {t('ca.calendar.more')}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Week Grid
// ---------------------------------------------------------------------------

const WEEK_HOUR_SLOTS = Array.from({ length: 13 }, (_, i) => i + 8) // 08:00–20:00

interface WeekGridProps {
  appointments: Appointment[]
  focusDate: Date
  onApptClick: (a: Appointment) => void
}

function WeekGrid({ appointments, focusDate, onApptClick }: WeekGridProps) {
  const weekStart = startOfWeek(focusDate, { weekStartsOn: 1 })
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  const apptMap = useMemo(() => {
    const map: Record<string, Record<number, Appointment[]>> = {}
    for (const appt of appointments) {
      const dt = parseISO(appt.slotStart)
      const dayKey = format(dt, 'yyyy-MM-dd')
      const hour = dt.getHours()
      if (!map[dayKey]) map[dayKey] = {}
      if (!map[dayKey][hour]) map[dayKey][hour] = []
      map[dayKey][hour].push(appt)
    }
    return map
  }, [appointments])

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        {/* Day headers */}
        <div className="flex border-b border-neutral-200">
          <div className="w-16 shrink-0" />
          {weekDays.map(day => (
            <div
              key={format(day, 'yyyy-MM-dd')}
              className={cn(
                'flex-1 text-center text-xs font-semibold py-2',
                isToday(day) ? 'text-brand-600' : 'text-neutral-600'
              )}
            >
              <div>{format(day, 'EEE')}</div>
              <div className={cn(
                'mx-auto mt-0.5 h-6 w-6 flex items-center justify-center rounded-full text-sm font-bold',
                isToday(day) ? 'bg-brand-600 text-white' : 'text-neutral-700'
              )}>
                {format(day, 'd')}
              </div>
            </div>
          ))}
        </div>

        {/* Time grid */}
        <div className="relative">
          {WEEK_HOUR_SLOTS.map(hour => (
            <div key={hour} className="flex border-b border-neutral-100">
              <div className="w-16 shrink-0 py-1 pr-2 text-right text-[10px] text-neutral-400 -mt-2">
                {`${String(hour).padStart(2, '0')}:00`}
              </div>
              {weekDays.map(day => {
                const dayKey = format(day, 'yyyy-MM-dd')
                const slotAppts = apptMap[dayKey]?.[hour] ?? []
                return (
                  <div
                    key={`${dayKey}-${hour}`}
                    className={cn(
                      'flex-1 min-h-[52px] border-l border-neutral-100 p-0.5',
                      isToday(day) && 'bg-brand-50/30'
                    )}
                  >
                    {slotAppts.map(appt => (
                      <button
                        key={appt.id}
                        onClick={() => onApptClick(appt)}
                        className="w-full text-left text-[10px] leading-tight px-1.5 py-1 rounded bg-brand-100 text-brand-800 hover:bg-brand-200 mb-px block"
                        title={`${appt.clientName} — ${t(`ca.confirm.topic.${appt.topic.toLowerCase()}`)}`}
                      >
                        <div className="flex items-center gap-0.5">
                          <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', STATUS_DOT[appt.status] ?? 'bg-neutral-300')} />
                          <span className="font-medium truncate">{appt.clientName}</span>
                        </div>
                        <span className="text-brand-600 ml-2">{format(parseISO(appt.slotStart), 'HH:mm')}</span>
                      </button>
                    ))}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Day View
// ---------------------------------------------------------------------------

interface DayViewProps {
  appointments: Appointment[]
  focusDate: Date
  onApptClick: (a: Appointment) => void
}

function DayView({ appointments, focusDate, onApptClick }: DayViewProps) {
  const dayKey = format(focusDate, 'yyyy-MM-dd')
  const dayAppts = appointments
    .filter(a => format(parseISO(a.slotStart), 'yyyy-MM-dd') === dayKey)
    .sort((a, b) => a.slotStart.localeCompare(b.slotStart))

  return (
    <div>
      <div className="text-sm font-semibold text-neutral-700 mb-3 flex items-center gap-2">
        <span>{format(focusDate, 'EEEE, d MMMM yyyy')}</span>
        {isToday(focusDate) && <span className="text-xs px-2 py-0.5 rounded-full bg-brand-100 text-brand-700">{t('ca.calendar.today')}</span>}
      </div>
      {dayAppts.length === 0 ? (
        <p className="text-sm text-neutral-400 py-6 text-center">{t('ca.admin.appts.empty')}</p>
      ) : (
        <div className="space-y-2">
          {dayAppts.map(appt => (
            <button
              key={appt.id}
              onClick={() => onApptClick(appt)}
              className="w-full text-left rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 transition-colors p-3 flex items-start gap-3"
            >
              <div className="text-xs text-neutral-500 w-14 shrink-0 text-right pt-0.5">
                {format(parseISO(appt.slotStart), 'HH:mm')}
              </div>
              <div className={cn('w-0.5 self-stretch rounded-full shrink-0', STATUS_DOT[appt.status] ?? 'bg-neutral-300')} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-neutral-800">{appt.clientName}</p>
                <p className="text-xs text-neutral-500">
                  {t(`ca.confirm.topic.${appt.topic.toLowerCase()}`)} · {appt.durationMinutes}m
                  {appt.caName ? ` · ${appt.caName}` : ''}
                </p>
              </div>
              <AppointmentStatusBadge status={appt.status} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function CaAppointmentsPage() {
  const queryClient = useQueryClient()
  const [view, setView] = useState<CalendarView>('list')
  const [calendarSubView, setCalendarSubView] = useState<'month' | 'week' | 'day'>('month')
  const [focusDate, setFocusDate] = useState<Date>(new Date())
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | ''>('')
  const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null })
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null)

  // For calendar views load a broader date range (full month/week window)
  const calendarDateFrom = useMemo(() => {
    if (calendarSubView === 'month') return startOfWeek(startOfMonth(focusDate), { weekStartsOn: 1 })
    if (calendarSubView === 'week') return startOfWeek(focusDate, { weekStartsOn: 1 })
    return focusDate
  }, [calendarSubView, focusDate])

  const calendarDateTo = useMemo(() => {
    if (calendarSubView === 'month') return endOfWeek(endOfMonth(focusDate), { weekStartsOn: 1 })
    if (calendarSubView === 'week') return endOfWeek(focusDate, { weekStartsOn: 1 })
    return focusDate
  }, [calendarSubView, focusDate])

  const isCalendarView = view !== 'list'

  const queryParams = {
    status: (!isCalendarView && statusFilter) ? statusFilter : undefined,
    dateFrom: isCalendarView
      ? calendarDateFrom.toISOString()
      : dateRange.start?.toISOString(),
    dateTo: isCalendarView
      ? calendarDateTo.toISOString()
      : dateRange.end?.toISOString(),
    pageSize: isCalendarView ? 200 : 50,
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

  // Calendar navigation
  function navigatePrev() {
    if (calendarSubView === 'month') setFocusDate(d => subMonths(d, 1))
    else if (calendarSubView === 'week') setFocusDate(d => subWeeks(d, 1))
    else setFocusDate(d => { const n = new Date(d); n.setDate(n.getDate() - 1); return n })
  }

  function navigateNext() {
    if (calendarSubView === 'month') setFocusDate(d => addMonths(d, 1))
    else if (calendarSubView === 'week') setFocusDate(d => addWeeks(d, 1))
    else setFocusDate(d => { const n = new Date(d); n.setDate(n.getDate() + 1); return n })
  }

  function calendarTitle(): string {
    if (calendarSubView === 'month') return format(focusDate, 'MMMM yyyy')
    if (calendarSubView === 'week') {
      const ws = startOfWeek(focusDate, { weekStartsOn: 1 })
      const we = endOfWeek(focusDate, { weekStartsOn: 1 })
      return `${format(ws, 'd MMM')} – ${format(we, 'd MMM yyyy')}`
    }
    return format(focusDate, 'EEEE, d MMMM yyyy')
  }

  // Today's appointments for sidebar
  const todayKey = format(new Date(), 'yyyy-MM-dd')
  const todayAppts = appointments
    .filter(a => format(parseISO(a.slotStart), 'yyyy-MM-dd') === todayKey)
    .sort((a, b) => a.slotStart.localeCompare(b.slotStart))

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
        <div className="flex items-center gap-1 border border-neutral-200 rounded-lg p-0.5 bg-white" role="group" aria-label={t('ca.admin.appts.view.aria')}>
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
            onClick={() => { if (view === 'list') setView('month') }}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors',
              view !== 'list' ? 'bg-neutral-100 text-neutral-800' : 'text-neutral-500 hover:text-neutral-700'
            )}
            aria-pressed={view !== 'list'}
          >
            <Calendar className="h-4 w-4" aria-hidden="true" />
            {t('ca.admin.appts.view.calendar')}
          </button>
        </div>
      </div>

      {/* Filters — only in list view */}
      {view === 'list' && (
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
      )}

      {/* Calendar sub-view controls */}
      {view !== 'list' && (
        <div className="flex items-center justify-between flex-wrap gap-2">
          {/* Month/Week/Day picker */}
          <div className="flex items-center gap-1 border border-neutral-200 rounded-lg p-0.5 bg-white" role="group" aria-label={t('ca.admin.appts.calendar.subViewAria')}>
            {(['month', 'week', 'day'] as const).map(sv => (
              <button
                key={sv}
                onClick={() => setCalendarSubView(sv)}
                className={cn(
                  'px-2.5 py-1 rounded-md text-xs font-medium transition-colors',
                  calendarSubView === sv ? 'bg-brand-600 text-white' : 'text-neutral-500 hover:text-neutral-700'
                )}
                aria-pressed={calendarSubView === sv}
              >
                {t(`ca.admin.appts.calendar.${sv}`)}
              </button>
            ))}
          </div>

          {/* Navigation */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFocusDate(new Date())}
              className="text-xs font-medium px-3 py-1.5 rounded-lg border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
            >
              {t('ca.calendar.today')}
            </button>
            <div className="flex items-center gap-0.5">
              <button
                onClick={navigatePrev}
                className="p-1.5 rounded-lg border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
                aria-label={t('common.prev')}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <span className="min-w-[160px] text-center text-sm font-semibold text-neutral-800">
                {calendarTitle()}
              </span>
              <button
                onClick={navigateNext}
                className="p-1.5 rounded-lg border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50"
                aria-label={t('common.next')}
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* Empty (list view only) */}
      {!isLoading && !isError && isEmpty && view === 'list' && (
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

      {/* Calendar view — month/week/day grid + today sidebar */}
      {!isLoading && !isError && view !== 'list' && (
        <div className="flex gap-4 items-start">
          {/* Main calendar grid */}
          <div className="flex-1 min-w-0 bg-white rounded-xl border border-neutral-200 shadow-sm p-4">
            {calendarSubView === 'month' && (
              <MonthGrid
                appointments={appointments}
                focusDate={focusDate}
                onDateClick={d => { setFocusDate(d); setCalendarSubView('day') }}
                onApptClick={setSelectedAppt}
              />
            )}
            {calendarSubView === 'week' && (
              <WeekGrid
                appointments={appointments}
                focusDate={focusDate}
                onApptClick={setSelectedAppt}
              />
            )}
            {calendarSubView === 'day' && (
              <DayView
                appointments={appointments}
                focusDate={focusDate}
                onApptClick={setSelectedAppt}
              />
            )}
          </div>

          {/* Today's sidebar */}
          <div className="w-64 shrink-0 space-y-3">
            <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4">
              <h2 className="text-sm font-semibold text-neutral-800 mb-3">
                {t('ca.admin.appts.calendar.todaySidebar')}
              </h2>
              {todayAppts.length === 0 ? (
                <p className="text-xs text-neutral-400">{t('ca.admin.appts.empty')}</p>
              ) : (
                <div className="space-y-2">
                  {todayAppts.map(appt => (
                    <button
                      key={appt.id}
                      onClick={() => setSelectedAppt(appt)}
                      className="w-full text-left rounded-lg border border-neutral-100 bg-neutral-50 hover:bg-neutral-100 transition-colors p-2 text-xs"
                    >
                      <div className="font-medium text-neutral-800">{format(parseISO(appt.slotStart), 'HH:mm')} IST</div>
                      <div className="text-neutral-600 truncate">{appt.clientName}</div>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-neutral-400">{appt.durationMinutes}m</span>
                        <AppointmentStatusBadge status={appt.status} />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Legend */}
            <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4">
              <h3 className="text-xs font-semibold text-neutral-600 mb-2">{t('ca.admin.appts.calendar.legend')}</h3>
              {(Object.entries(STATUS_DOT) as [AppointmentStatus, string][])
                .filter(([s]) => !['PENDING', 'SCHEDULED'].includes(s))
                .map(([status, dotClass]) => (
                  <div key={status} className="flex items-center gap-2 mb-1">
                    <div className={cn('h-2 w-2 rounded-full shrink-0', dotClass)} />
                    <span className="text-xs text-neutral-600">{t(STATUS_CONFIG[status]?.label ?? status)}</span>
                  </div>
                ))
              }
            </div>
          </div>
        </div>
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
