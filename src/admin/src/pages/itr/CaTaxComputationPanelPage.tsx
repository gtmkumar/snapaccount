/**
 * CaTaxComputationPanelPage — dual-pane CA review + live recompute (Phase 6D)
 * Route: /itr/:filingId/computation
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Save, XCircle, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { DualPaneEditor } from '@/components/ui/DualPaneEditor'
import { ComputationCard, type ComputationRow } from '@/components/ui/ComputationCard'
import { AlertBanner } from '@/components/shared/AlertBanner'
import { AmountDisplay } from '@/components/ui/AmountDisplay'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import {
  getFiling,
  computeTax,
  updateFilingDraft,
  caApproveFiling,
  caRejectFiling,
  type ComputationInput,
  type ComputationResult,
  type Regime,
} from '@/lib/itrApi'

// ---------------------------------------------------------------------------
// Income / deduction input section
// ---------------------------------------------------------------------------

interface NumericInputProps {
  label: string
  hint?: string
  value: number
  onChange: (v: number) => void
  max?: number
  disabled?: boolean
}

function NumericInput({ label, hint, value, onChange, max, disabled }: NumericInputProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 border-b border-neutral-100 last:border-0">
      <div className="min-w-0">
        <p className="text-sm text-neutral-700">{label}</p>
        {hint && <p className="text-xs text-neutral-400">{hint}</p>}
      </div>
      <div className="flex flex-col items-end gap-0.5 shrink-0">
        <div className="relative">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-neutral-400">₹</span>
          <input
            type="number"
            value={value}
            min={0}
            max={max}
            disabled={disabled}
            onChange={e => onChange(Math.max(0, Number(e.target.value)))}
            className="w-36 pl-6 pr-2 py-1.5 text-sm text-right rounded border border-neutral-200 focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20 outline-none font-mono disabled:opacity-50"
            aria-label={label}
          />
        </div>
        {max != null && (
          <p className="text-xs text-neutral-400">Max ₹{max.toLocaleString('en-IN')}</p>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Reject modal
// ---------------------------------------------------------------------------

interface RejectModalProps {
  onConfirm: (reason: string) => void
  onCancel: () => void
  pending?: boolean
}

function RejectModal({ onConfirm, onCancel, pending }: RejectModalProps) {
  const [reason, setReason] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="dialog" aria-modal="true">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-5 space-y-4">
        <h2 className="text-base font-semibold text-neutral-900">{t('itr.computationPanel.rejectModal.heading')}</h2>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          rows={3}
          placeholder={t('itr.computationPanel.rejectModal.reasonPlaceholder')}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-500 outline-none resize-none"
        />
        <div className="flex gap-2">
          <Button variant="primary" fullWidth disabled={!reason.trim() || pending} onClick={() => onConfirm(reason)}>
            {pending ? '…' : t('itr.computationPanel.rejectModal.submit')}
          </Button>
          <Button variant="secondary" onClick={onCancel}>
            {t('admin.gst.notice.confirm.back')}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Approve modal
// ---------------------------------------------------------------------------

interface ApproveModalProps {
  onConfirm: () => void
  onCancel: () => void
  pending?: boolean
  name: string
}

function ApproveModal({ onConfirm, onCancel, pending, name }: ApproveModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="dialog" aria-modal="true">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-5 space-y-4">
        <h2 className="text-base font-semibold text-neutral-900">{t('itr.computationPanel.approveModal.heading')}</h2>
        <p className="text-sm text-neutral-600">{t('itr.computationPanel.approveModal.body', { name })}</p>
        <div className="flex gap-2">
          <Button variant="primary" fullWidth disabled={pending} onClick={onConfirm}>
            {pending ? '…' : t('itr.computationPanel.approveModal.confirm')}
          </Button>
          <Button variant="secondary" onClick={onCancel}>
            {t('admin.gst.notice.confirm.back')}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const DEFAULT_INPUT: ComputationInput = {
  salaryIncome: 0,
  housePropertyIncome: 0,
  businessIncome: 0,
  capitalGains: 0,
  otherIncome: 0,
  section80C: 0,
  section80D: 0,
  section80E: 0,
  otherDeductions: 0,
  advanceTaxPaid: 0,
  tdsPaid: 0,
}

type LeftTab = 'income' | 'deductions' | 'notes'

export default function CaTaxComputationPanelPage() {
  const { filingId } = useParams<{ filingId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [leftTab, setLeftTab] = useState<LeftTab>('income')
  const [regime, setRegime] = useState<Regime>('NEW')
  const [inputs, setInputs] = useState<ComputationInput>(DEFAULT_INPUT)
  const [computation, setComputation] = useState<ComputationResult | null>(null)
  const [recomputing, setRecomputing] = useState(false)
  const [notes, setNotes] = useState('')
  const [autosaveState, setAutosaveState] = useState<'saved' | 'saving' | 'unsaved'>('saved')
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [showApproveModal, setShowApproveModal] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const seqRef = useRef(0)

  const { data: filing, isLoading, isError } = useQuery({
    queryKey: ['itr-filing', filingId],
    queryFn: () => getFiling(filingId!),
    enabled: !!filingId,
    staleTime: 30_000,
  })

  // Baseline for the before/after delta pills = the assessee's SUBMITTED figures
  // (from the filing summary). As the CA edits inputs and recomputes, each row's
  // pill shows the change vs what the assessee originally filed (CG-4). Previously
  // baseline was a hardcoded empty object, so no pill ever rendered.
  const baseline = useMemo<Partial<ComputationResult>>(() => {
    if (!filing) return {}
    return {
      grossTotalIncome: filing.totalIncome ?? undefined,
      grossTaxLiability: filing.totalTax ?? undefined,
      payableOrRefund: filing.payableOrRefund ?? undefined,
    }
  }, [filing])

  // Seed the CA's existing notes + the filing's regime once, so the panel opens
  // with prior context rather than blank/default.
  const hydratedRef = useRef(false)
  useEffect(() => {
    if (!filing || hydratedRef.current) return
    hydratedRef.current = true
    if (filing.caNotes) setNotes(filing.caNotes)
    if (filing.regime) setRegime(filing.regime)
  }, [filing])

  // Debounced recompute on any input change
  const triggerRecompute = useCallback((inp: ComputationInput) => {
    if (!filingId) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      const seq = ++seqRef.current
      setRecomputing(true)
      try {
        const result = await computeTax(filingId, inp)
        if (seq === seqRef.current) {
          setComputation(result)
        }
      } catch {
        if (seq === seqRef.current) {
          toast.error(t('itr.computationPanel.recompute.toastFailed'))
        }
      } finally {
        if (seq === seqRef.current) setRecomputing(false)
      }
    }, 300)
  }, [filingId])

  function setInput(key: keyof ComputationInput, value: number) {
    setInputs(prev => {
      const updated = { ...prev, [key]: value }
      triggerRecompute(updated)
      setAutosaveState('unsaved')
      return updated
    })
  }

  // Auto-save every 30s if unsaved
  useEffect(() => {
    if (autosaveState !== 'unsaved') return
    const timer = setTimeout(async () => {
      if (!filingId) return
      setAutosaveState('saving')
      try {
        await updateFilingDraft(filingId, { ...inputs, caNotes: notes })
        setAutosaveState('saved')
      } catch {
        setAutosaveState('unsaved')
      }
    }, 30_000)
    return () => clearTimeout(timer)
  }, [autosaveState, filingId, inputs, notes])

  const saveDraftMutation = useMutation({
    mutationFn: () => updateFilingDraft(filingId!, { ...inputs, caNotes: notes }),
    onMutate: () => setAutosaveState('saving'),
    onSuccess: () => {
      setAutosaveState('saved')
      toast.success(t('itr.computationPanel.action.saveDraft'))
    },
    onError: () => {
      setAutosaveState('unsaved')
      toast.error(t('itr.admin.error.saveFailed'))
    },
  })

  const approveMutation = useMutation({
    mutationFn: () => caApproveFiling(filingId!, 'current-ca'),
    onSuccess: () => {
      toast.success(t('itr.admin.filing.action.approved'))
      void queryClient.invalidateQueries({ queryKey: ['itr-filing', filingId] })
      void navigate('/itr')
    },
    onError: () => toast.error(t('itr.admin.error.saveFailed')),
  })

  const rejectMutation = useMutation({
    mutationFn: (reason: string) => caRejectFiling(filingId!, 'current-ca', reason),
    onSuccess: () => {
      toast.success(t('itr.admin.filing.action.rejected'))
      void queryClient.invalidateQueries({ queryKey: ['itr-filing', filingId] })
      void navigate('/itr')
    },
    onError: () => toast.error(t('itr.admin.error.saveFailed')),
  })

  // Build computation rows from result
  function buildRows(): ComputationRow[] {
    if (!computation) return []

    function delta(key: keyof ComputationResult): number | undefined {
      const cur = computation?.[key] as number | undefined
      const base = baseline[key] as number | undefined
      if (cur == null || base == null || cur === base) return undefined
      return cur - base
    }

    return [
      { label: t('itr.computationPanel.right.row.grossIncome'), value: computation.grossTotalIncome, delta: delta('grossTotalIncome') },
      { label: t('itr.computationPanel.right.row.deductions'), value: computation.deductions, isDeduction: true, delta: delta('deductions') },
      { label: t('itr.computationPanel.right.row.taxable'), value: computation.taxableIncome },
      { label: t('itr.computationPanel.right.row.tax'), value: computation.taxOnIncome },
      { label: t('itr.computationPanel.right.row.surcharge'), value: computation.surcharge, hidden: computation.surcharge === 0 },
      { label: t('itr.computationPanel.right.row.cess'), value: computation.cessAmount },
      { label: t('itr.computationPanel.right.row.rebate'), value: computation.rebate87A, isDeduction: true, hidden: computation.rebate87A === 0 },
      { label: t('itr.computationPanel.right.row.netTax'), value: computation.grossTaxLiability, isTotal: true },
      { label: t('itr.computationPanel.right.row.credits'), value: computation.totalCredits, isDeduction: true },
      {
        label: computation.payableOrRefund >= 0
          ? t('itr.computationPanel.right.row.outcomePayable')
          : t('itr.computationPanel.right.row.outcomeRefund'),
        value: computation.payableOrRefund,
        isTotal: true,
        highlight: true,
        delta: delta('payableOrRefund'),
      },
    ]
  }

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 bg-neutral-100 rounded w-1/3" />
        <div className="h-96 bg-neutral-100 rounded" />
      </div>
    )
  }

  if (isError || !filing) {
    return (
      <AlertBanner
        type="error"
        title={t('itr.admin.error.load')}
        actions={
          <button onClick={() => void navigate('/itr')} className="text-xs font-medium text-error-700 underline">
            {t('itr.admin.error.backToList')}
          </button>
        }
      />
    )
  }

  const isLocked = ['FILED', 'E_VERIFIED', 'REFUND_ISSUED'].includes(filing.status)

  // Left pane
  const leftPane = (
    <div className="flex flex-col h-full border-r border-neutral-200 bg-white overflow-hidden">
      {/* Left tabs */}
      <div className="flex border-b border-neutral-200 px-2 pt-2 shrink-0" role="tablist">
        {([
          { key: 'income', label: t('itr.computationPanel.left.tab.income') },
          { key: 'deductions', label: t('itr.computationPanel.left.tab.deductions') },
          { key: 'notes', label: t('itr.computationPanel.left.tab.notes') },
        ] as { key: LeftTab; label: string }[]).map(tab => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={leftTab === tab.key}
            onClick={() => setLeftTab(tab.key)}
            className={cn(
              'px-3 py-2 text-xs font-medium border-b-2 transition-colors',
              leftTab === tab.key
                ? 'border-brand-500 text-brand-700'
                : 'border-transparent text-neutral-500 hover:text-neutral-700'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLocked && (
        <AlertBanner type="info" title={t('itr.filingDetail.lockedBanner')} className="mx-3 mt-3" />
      )}

      {/* Left content */}
      <div className="flex-1 overflow-y-auto p-4">
        {leftTab === 'income' && (
          <div>
            <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">
              {t('itr.computationPanel.left.section.salary')}
            </p>
            <NumericInput
              label={t('itr.computationPanel.left.section.salary')}
              value={inputs.salaryIncome}
              onChange={v => setInput('salaryIncome', v)}
              disabled={isLocked}
            />
            <NumericInput
              label={t('itr.computationPanel.left.section.houseProperty')}
              value={inputs.housePropertyIncome}
              onChange={v => setInput('housePropertyIncome', v)}
              disabled={isLocked}
            />
            <NumericInput
              label={t('itr.computationPanel.left.section.capitalGains')}
              value={inputs.capitalGains}
              onChange={v => setInput('capitalGains', v)}
              disabled={isLocked}
            />
            <NumericInput
              label={t('itr.computationPanel.left.section.business')}
              value={inputs.businessIncome}
              onChange={v => setInput('businessIncome', v)}
              disabled={isLocked}
            />
            <NumericInput
              label={t('itr.computationPanel.left.section.otherSources')}
              value={inputs.otherIncome}
              onChange={v => setInput('otherIncome', v)}
              disabled={isLocked}
            />
            <div className="mt-4 pt-4 border-t border-neutral-100">
              <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">
                {t('itr.computationPanel.left.section.taxCredits')}
              </p>
              <NumericInput
                label={t('itr.computationPanel.left.section.tds')}
                value={inputs.tdsPaid}
                onChange={v => setInput('tdsPaid', v)}
                disabled={isLocked}
              />
              <NumericInput
                label={t('itr.computationPanel.left.section.advanceTax')}
                value={inputs.advanceTaxPaid}
                onChange={v => setInput('advanceTaxPaid', v)}
                disabled={isLocked}
              />
            </div>
          </div>
        )}

        {leftTab === 'deductions' && (
          <div>
            <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">
              {t('itr.computationPanel.left.tab.deductions')} — Chapter VI-A
            </p>
            <NumericInput
              label="80C (PPF, ELSS, LIC, PF…)"
              hint={t('itr.computationPanel.left.section.maxHint', { max: '₹1,50,000' })}
              value={inputs.section80C}
              onChange={v => setInput('section80C', Math.min(v, 150_000))}
              max={150_000}
              disabled={isLocked || regime === 'NEW'}
            />
            <NumericInput
              label="80D (Health insurance)"
              hint={t('itr.computationPanel.left.section.maxHint', { max: '₹75,000' })}
              value={inputs.section80D}
              onChange={v => setInput('section80D', Math.min(v, 75_000))}
              max={75_000}
              disabled={isLocked || regime === 'NEW'}
            />
            <NumericInput
              label="80E (Education loan interest)"
              value={inputs.section80E}
              onChange={v => setInput('section80E', v)}
              disabled={isLocked || regime === 'NEW'}
            />
            <NumericInput
              label={t('itr.computationPanel.left.section.otherDeductions')}
              value={inputs.otherDeductions}
              onChange={v => setInput('otherDeductions', v)}
              disabled={isLocked || regime === 'NEW'}
            />
            {regime === 'NEW' && (
              <p className="text-xs text-warning-600 mt-3">
                {t('itr.computationPanel.left.deductionsNewRegimeNote')}
              </p>
            )}
          </div>
        )}

        {leftTab === 'notes' && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
              {t('itr.computationPanel.left.tab.notes')}
            </p>
            <textarea
              value={notes}
              onChange={e => { setNotes(e.target.value); setAutosaveState('unsaved') }}
              rows={12}
              placeholder={t('itr.computationPanel.notes.placeholder')}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-500 outline-none resize-none"
            />
          </div>
        )}
      </div>
    </div>
  )

  // Right pane
  const rows = buildRows()
  const rightPane = (
    <div className="flex flex-col h-full bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-neutral-700">{t('itr.computationPanel.right.regimeToggle')}</p>
          <div className="flex rounded-lg border border-neutral-200 overflow-hidden text-xs font-medium">
            {(['OLD', 'NEW'] as Regime[]).map(r => (
              <button
                key={r}
                onClick={() => { setRegime(r); triggerRecompute(inputs) }}
                className={cn(
                  'px-3 py-1.5 transition-colors',
                  regime === r ? 'bg-brand-500 text-white' : 'bg-white text-neutral-600 hover:bg-neutral-50'
                )}
              >
                {r === 'OLD' ? t('itr.computationPanel.regime.old') : t('itr.computationPanel.regime.new')}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-neutral-400">{filing.assessmentYear}</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {!computation && !recomputing && (
          <div className="flex flex-col items-center py-8 gap-2 text-neutral-400">
            <p className="text-sm">{t('itr.computationPanel.right.enterValues')}</p>
          </div>
        )}

        {(computation || recomputing) && (
          <>
            <ComputationCard rows={rows} loading={!computation && recomputing} recomputing={recomputing} />

            {computation && (
              <div className="rounded-xl border border-neutral-200 p-4 bg-neutral-50">
                <p className="text-xs font-semibold text-neutral-500 mb-2">{t('itr.computationPanel.right.summary')}</p>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-neutral-600">
                    {computation.payableOrRefund >= 0
                      ? t('itr.computationPanel.right.row.outcomePayable')
                      : t('itr.computationPanel.right.row.outcomeRefund')}
                  </span>
                  <div className="flex items-center gap-2">
                    <AmountDisplay
                      amount={Math.abs(computation.payableOrRefund)}
                      size="lg"
                      colorCode
                    />
                    {computation.payableOrRefund < 0 && (
                      <Badge variant="success">{t('itr.computationPanel.right.refund')}</Badge>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {recomputing && (
          <p className="text-xs text-neutral-400 text-center">{t('itr.computationPanel.right.recomputing')}</p>
        )}
      </div>
    </div>
  )

  return (
    <div className="flex flex-col h-screen overflow-hidden -m-4">
      {/* Sub-header */}
      <div className="shrink-0 bg-white border-b border-neutral-200 px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void navigate('/itr')}
            leftIcon={<ArrowLeft className="h-4 w-4" />}
          >
            {t('itr.computationPanel.subheader.back')}
          </Button>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-neutral-900 truncate">
              {filing.assesseeName ?? '—'} · {filing.itrFormType} · {filing.assessmentYear}
            </p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-neutral-400 font-mono">···{filing.panLast4}</span>
              {/* Autosave indicator */}
              <span className="text-xs text-neutral-400" aria-live="polite">
                {autosaveState === 'saving' && t('itr.computationPanel.autosave.saving')}
                {autosaveState === 'saved' && t('itr.computationPanel.autosave.saved')}
                {autosaveState === 'unsaved' && (
                  <span className="text-warning-600">{t('itr.computationPanel.autosave.unsaved')}</span>
                )}
              </span>
            </div>
          </div>
        </div>

        {!isLocked && (
          <div className="flex gap-2 shrink-0">
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Save className="h-4 w-4" />}
              onClick={() => void saveDraftMutation.mutate()}
              disabled={saveDraftMutation.isPending}
            >
              {t('itr.computationPanel.action.saveDraft')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<XCircle className="h-4 w-4" />}
              className="text-error-600"
              onClick={() => setShowRejectModal(true)}
            >
              {t('itr.computationPanel.action.reject')}
            </Button>
            <Button
              variant="primary"
              size="sm"
              leftIcon={<CheckCircle className="h-4 w-4" />}
              onClick={() => setShowApproveModal(true)}
            >
              {t('itr.computationPanel.action.approve')}
            </Button>
          </div>
        )}
      </div>

      {/* Dual pane editor — takes remaining height */}
      <div className="flex-1 overflow-hidden">
        <DualPaneEditor
          left={leftPane}
          right={rightPane}
          storageKey={`computation-${filingId}`}
          defaultRatio={0.55}
          className="h-full"
        />
      </div>

      {/* Modals */}
      {showRejectModal && (
        <RejectModal
          onConfirm={reason => void rejectMutation.mutate(reason)}
          onCancel={() => setShowRejectModal(false)}
          pending={rejectMutation.isPending}
        />
      )}
      {showApproveModal && (
        <ApproveModal
          name={filing.assesseeName ?? '—'}
          onConfirm={() => void approveMutation.mutate()}
          onCancel={() => setShowApproveModal(false)}
          pending={approveMutation.isPending}
        />
      )}
    </div>
  )
}
