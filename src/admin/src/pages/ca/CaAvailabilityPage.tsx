/**
 * CaAvailabilityPage — CA recurring availability rule editor (GAP-031, Wave 7)
 * Wave 7A: wired to real /appointments/availability-rules endpoints.
 * Route: /ca/availability
 * Perms: chat.slots.manage (rule CRUD), chat.appointments.book (CA profile list)
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Eye, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { t } from '@/i18n'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { AlertBanner } from '@/components/shared/AlertBanner'
import { AvailabilityRuleEditor } from '@/components/ui/AvailabilityRuleEditor'
import { DateRangePicker, type DateRange } from '@/components/ui/DateRangePicker'
import { cn } from '@/lib/utils'
import {
  listAvailabilityRules,
  createAvailabilityRule,
  deleteAvailabilityRule,
  generateSlotsFromRules,
  listAvailabilityBlocks,
  createAvailabilityBlock,
  deleteAvailabilityBlock,
  listCaProfiles,
  type Weekday,
  type AvailabilityBlock,
} from '@/lib/caApi'

// ---------------------------------------------------------------------------
// Ad-hoc block editor
// ---------------------------------------------------------------------------

interface BlockEditorProps {
  caId: string
  blocks: AvailabilityBlock[]
  onAdd: (blockStart: string, blockEnd: string, reason?: string) => void
  onDelete: (blockId: string) => void
  isLoading: boolean
}

function BlockEditor({ caId: _caId, blocks, onAdd, onDelete, isLoading }: BlockEditorProps) {
  const [range, setRange] = useState<DateRange>({ start: null, end: null })
  const [reason, setReason] = useState('')
  const [adding, setAdding] = useState(false)

  async function handleAdd() {
    if (!range.start || !range.end) {
      toast.error(t('ca.admin.block.error.rangeRequired'))
      return
    }
    setAdding(true)
    try {
      onAdd(range.start.toISOString(), range.end.toISOString(), reason || undefined)
      setRange({ start: null, end: null })
      setReason('')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-neutral-700">{t('ca.admin.block.title')}</p>
      {isLoading ? (
        <div className="animate-pulse h-8 bg-neutral-100 rounded" />
      ) : blocks.length === 0 ? (
        <p className="text-sm text-neutral-400">{t('ca.admin.block.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {blocks.map(b => (
            <li key={b.id} className="flex items-center justify-between text-sm border border-neutral-200 rounded-lg px-3 py-2 bg-neutral-50">
              <div>
                <span className="font-medium text-neutral-800">
                  {new Date(b.blockStart).toLocaleDateString('en-IN')} – {new Date(b.blockEnd).toLocaleDateString('en-IN')}
                </span>
                {b.reason && <span className="ml-2 text-neutral-500">({b.reason})</span>}
              </div>
              <button
                onClick={() => onDelete(b.id)}
                className="text-xs text-error-600 hover:underline"
              >
                {t('common.remove')}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Add block */}
      <div className="border border-dashed border-neutral-300 rounded-lg p-3 space-y-2">
        <p className="text-xs font-medium text-neutral-500">{t('ca.admin.block.add')}</p>
        <DateRangePicker value={range} onChange={setRange} />
        <input
          type="text"
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder={t('ca.admin.block.reasonPlaceholder')}
          className="w-full text-sm rounded-lg border border-neutral-300 px-2.5 py-1.5 focus:border-brand-500 outline-none"
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={handleAdd}
          loading={adding}
          disabled={!range.start || !range.end}
        >
          {t('ca.admin.block.add')}
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Generate slots panel
// ---------------------------------------------------------------------------

interface GenerateSlotsProps {
  caProfileId: string
}

function GenerateSlotsPanel({ caProfileId }: GenerateSlotsProps) {
  const queryClient = useQueryClient()
  const [weeksAhead, setWeeksAhead] = useState(4)

  const generateMutation = useMutation({
    mutationFn: () => generateSlotsFromRules({ caProfileId, weeksAhead }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ['ca-availability-rules', caProfileId] })
      toast.success(
        t('ca.admin.availability.generate.success', {
          created: res.slotsCreated,
          skipped: res.slotsSkipped,
        })
      )
    },
    onError: () => toast.error(t('common.error.save')),
  })

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Eye className="h-4 w-4 text-neutral-400" aria-hidden="true" />
        <p className="text-sm font-medium text-neutral-700">{t('ca.admin.availability.generateSlots')}</p>
      </div>
      <p className="text-xs text-neutral-500">{t('ca.admin.availability.generateSlots.desc')}</p>
      <div className="flex items-center gap-2">
        <label className="text-xs text-neutral-600 shrink-0">{t('ca.admin.availability.weeksAhead')}</label>
        <select
          value={weeksAhead}
          onChange={e => setWeeksAhead(Number(e.target.value))}
          className="text-sm rounded-lg border border-neutral-300 px-2 py-1 focus:border-brand-500 outline-none"
          aria-label={t('ca.admin.availability.weeksAhead')}
        >
          {[1, 2, 4, 8, 12].map(w => (
            <option key={w} value={w}>{w} {t('ca.admin.availability.weeks')}</option>
          ))}
        </select>
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<RefreshCw className={cn('h-3.5 w-3.5', generateMutation.isPending && 'animate-spin')} />}
          onClick={() => generateMutation.mutate()}
          loading={generateMutation.isPending}
        >
          {t('ca.admin.availability.generate')}
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function CaAvailabilityPage() {
  const queryClient = useQueryClient()
  const [selectedCaId, setSelectedCaId] = useState<string>('')

  // CA profiles (for multi-CA orgs) — real endpoint: GET /appointments/ca-profiles
  const { data: caProfiles, isLoading: caLoading } = useQuery({
    queryKey: ['ca-profiles'],
    queryFn: () => listCaProfiles(true),
    staleTime: 300_000,
  })

  // effectiveCaId is the caProfileId (UUID) used as key for the ChatService endpoints
  const effectiveCaId = selectedCaId || caProfiles?.[0]?.caId || ''

  // Rules — GET /appointments/availability-rules?caProfileId=&activeOnly=true
  const { data: rules, isLoading: rulesLoading, isError: rulesError, refetch: refetchRules } = useQuery({
    queryKey: ['ca-availability-rules', effectiveCaId],
    queryFn: () => listAvailabilityRules(effectiveCaId, true),
    enabled: !!effectiveCaId,
    staleTime: 30_000,
  })

  // Availability blocks — no backend yet; stubs return []
  const { data: blocks, isLoading: blocksLoading } = useQuery({
    queryKey: ['ca-availability-blocks', effectiveCaId],
    queryFn: () => listAvailabilityBlocks(effectiveCaId),
    enabled: !!effectiveCaId,
    staleTime: 30_000,
  })

  const addRuleMutation = useMutation({
    mutationFn: (form: { weekday: Weekday; startTime: string; endTime: string; slotDurationMinutes: number }) =>
      createAvailabilityRule({ ...form }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ca-availability-rules', effectiveCaId] })
      toast.success(t('ca.admin.availability.rule.added'))
    },
    onError: () => toast.error(t('common.error.save')),
  })

  const deleteRuleMutation = useMutation({
    mutationFn: (ruleId: string) => deleteAvailabilityRule(ruleId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ca-availability-rules', effectiveCaId] })
      toast.success(t('ca.admin.availability.rule.deleted'))
    },
    onError: () => toast.error(t('common.error.save')),
  })

  const addBlockMutation = useMutation({
    mutationFn: ({ blockStart, blockEnd, reason }: { blockStart: string; blockEnd: string; reason?: string }) =>
      createAvailabilityBlock({ caId: effectiveCaId, blockStart, blockEnd, reason }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ca-availability-blocks', effectiveCaId] })
      toast.success(t('ca.admin.block.added'))
    },
    onError: () => toast.error(t('common.error.save')),
  })

  const deleteBlockMutation = useMutation({
    mutationFn: (blockId: string) => deleteAvailabilityBlock(effectiveCaId, blockId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ca-availability-blocks', effectiveCaId] })
    },
    onError: () => toast.error(t('common.error.save')),
  })

  return (
    <main aria-labelledby="ca-availability-title" className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <nav aria-label="Breadcrumb" className="text-xs text-neutral-400 mb-1">
            {t('ca.admin.availability.breadcrumb')}
          </nav>
          <h1 id="ca-availability-title" className="text-xl font-bold text-neutral-900">
            {t('ca.admin.availability.title')}
          </h1>
        </div>
        {/* CA selector (multi-CA orgs) */}
        {caProfiles && caProfiles.length > 1 && (
          <select
            value={selectedCaId}
            onChange={e => setSelectedCaId(e.target.value)}
            className="text-sm rounded-lg border border-neutral-300 px-3 py-1.5 focus:outline-none focus:border-brand-500"
            aria-label="Select CA"
          >
            {caProfiles.map(ca => (
              <option key={ca.caId} value={ca.caId}>{ca.displayName}</option>
            ))}
          </select>
        )}
      </div>

      {!effectiveCaId && !caLoading && (
        <AlertBanner type="info" description={t('ca.admin.availability.noCa')} />
      )}

      {rulesError && (
        <AlertBanner
          type="error"
          title={t('common.error.load')}
          actions={
            <button onClick={() => void refetchRules()} className="text-xs font-medium text-error-700 underline">
              {t('common.retry')}
            </button>
          }
        />
      )}

      {effectiveCaId && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          {/* Left: rules + blocks */}
          <div className="xl:col-span-2 space-y-4">
            <Card>
              <CardHeader title={t('ca.admin.availability.recurringRules')} />
              {rulesLoading ? (
                <Skeleton variant="card" />
              ) : (
                <AvailabilityRuleEditor
                  rules={rules ?? []}
                  onAdd={form => addRuleMutation.mutate(form)}
                  onDelete={ruleId => deleteRuleMutation.mutate(ruleId)}
                  isLoading={addRuleMutation.isPending || deleteRuleMutation.isPending}
                />
              )}
            </Card>

            <Card>
              <BlockEditor
                caId={effectiveCaId}
                blocks={blocks ?? []}
                onAdd={(blockStart, blockEnd, reason) => addBlockMutation.mutate({ blockStart, blockEnd, reason })}
                onDelete={blockId => deleteBlockMutation.mutate(blockId)}
                isLoading={blocksLoading || addBlockMutation.isPending || deleteBlockMutation.isPending}
              />
            </Card>
          </div>

          {/* Right: generate slots (on-demand) */}
          <div>
            <Card>
              <GenerateSlotsPanel caProfileId={effectiveCaId} />
            </Card>
          </div>
        </div>
      )}
    </main>
  )
}
