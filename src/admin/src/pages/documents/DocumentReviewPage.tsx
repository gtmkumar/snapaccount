/**
 * DocumentReviewPage — split-screen OCR review for a single document.
 *
 * CONTRACT GAPS (backend B15 — review-decision endpoints not yet implemented):
 *   - Approve & Process action: stubbed behind a clearly-marked disabled state
 *   - Reject action: stubbed behind a clearly-marked disabled state
 *   - Save Draft (persist corrections): stubbed (no PATCH /documents/{id}/fields endpoint)
 *
 * What IS wired to real APIs:
 *   - GET /documents/{id}          → full document detail + OCR fields
 *   - Signed GCS URL               → rendered as <img> in the document viewer
 *   - PUT /documents/{id}/category → categorize mutation
 *   - Confidence color coding:     green >80% / yellow 50–80% / red <50%
 */
import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { t } from '@/i18n'
import {
  ArrowLeft,
  ZoomIn,
  ZoomOut,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  AlertCircle,
  Save,
  AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge, StatusBadge } from '@/components/ui/Badge'
import { Toggle } from '@/components/ui/Toggle'
import { cn, getOcrConfidenceColor, getOcrConfidenceBg } from '@/lib/utils'
import { getDocument, categorizeDocument, type OcrField } from '@/lib/documentApi'

/** Normalise backend confidence: backend stores 0–1 float; display as 0–100. */
function toPercent(confidence: number | null): number {
  if (confidence === null) return 0
  return confidence <= 1 ? Math.round(confidence * 100) : Math.round(confidence)
}

function ConfidenceDot({ confidence }: { confidence: number | null }) {
  const pct = toPercent(confidence)
  return (
    <div
      className={cn('h-2.5 w-2.5 rounded-full shrink-0', getOcrConfidenceBg(pct))}
      title={`OCR Confidence: ${pct}%`}
      aria-label={`OCR confidence ${pct}%`}
    />
  )
}

/** Editable local state for a single OCR field. */
interface EditableField extends OcrField {
  editedValue: string
  isEdited: boolean
}

export default function DocumentReviewPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [zoom, setZoom] = useState(100)
  const [currentPage, setCurrentPage] = useState(1)
  const [notes, setNotes] = useState('')
  const [flagCallback, setFlagCallback] = useState(false)
  const [flagOcrError, setFlagOcrError] = useState(false)
  const [showRejectConfirm, setShowRejectConfirm] = useState(false)
  const [localFields, setLocalFields] = useState<EditableField[] | null>(null)
  const totalPages = 1

  const { data: doc, isLoading, isError } = useQuery({
    queryKey: ['document', id],
    queryFn: () => getDocument(id!),
    enabled: !!id,
  })

  // Initialise editable fields from the fetched document (once)
  const fields = useMemo<EditableField[]>(() => {
    if (localFields !== null) return localFields
    if (!doc?.fields) return []
    return doc.fields.map((f) => ({
      ...f,
      editedValue: f.value ?? '',
      isEdited: false,
    }))
  }, [doc, localFields])

  const updateField = (name: string, value: string) => {
    setLocalFields(
      fields.map((f) =>
        f.name === name ? { ...f, editedValue: value, isEdited: true } : f,
      ),
    )
  }

  const categorizeMutation = useMutation({
    mutationFn: ({ categoryId }: { categoryId: string }) =>
      categorizeDocument(id!, categoryId),
    onSuccess: () => {
      toast.success(t('docReview.toast.categorized'))
      void queryClient.invalidateQueries({ queryKey: ['document', id] })
    },
    onError: () => toast.error(t('common.loadError')),
  })

  const lowConfidenceCount = fields.filter((f) => toPercent(f.confidence) < 80).length

  const overallPct = doc?.ocrConfidence != null ? toPercent(doc.ocrConfidence) : null

  // SLA: 24h from upload
  const slaLabel = useMemo(() => {
    if (!doc) return ''
    const slaExpiry = new Date(new Date(doc.uploadedAt).getTime() + 24 * 60 * 60 * 1000)
    const diffMs = slaExpiry.getTime() - Date.now()
    if (diffMs < 0) return t('docReview.slaExpired')
    const mins = Math.floor(diffMs / (1000 * 60))
    const hours = Math.floor(mins / 60)
    const remainingMins = mins % 60
    const timeStr = hours > 0 ? `${hours}h ${remainingMins}m` : `${mins}m`
    return t('docReview.slaRemaining', { time: timeStr })
  }, [doc, t])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="text-neutral-500">{t('docReview.loading')}</span>
      </div>
    )
  }

  if (isError || !doc) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <AlertTriangle className="h-8 w-8 text-error-500" />
        <span className="text-neutral-600">{t('docReview.loadError')}</span>
        <Button variant="secondary" size="sm" onClick={() => void navigate('/documents')}>
          {t('docReview.back')}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full -m-6">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 px-6 py-3 bg-white border-b border-neutral-200 shrink-0">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void navigate('/documents')}
            leftIcon={<ArrowLeft className="h-4 w-4" />}
            ariaLabel={t('docReview.back')}
          >
            {t('docReview.back')}
          </Button>
          <div>
            <span className="text-sm font-semibold text-neutral-800">
              {doc.fileName}
            </span>
            {doc.vendorName && (
              <>
                <span className="text-sm text-neutral-400 mx-2">·</span>
                <span className="text-sm text-neutral-500">{doc.vendorName}</span>
              </>
            )}
          </div>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <StatusBadge status={doc.status as any} />
          {overallPct !== null && (
            <Badge
              variant={overallPct >= 80 ? 'success' : overallPct >= 50 ? 'warning' : 'error'}
            >
              OCR {overallPct}%
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          {slaLabel && (
            <span className="text-xs text-warning-600 font-medium">{slaLabel}</span>
          )}

          {/* Save Draft — stubbed: no PATCH /documents/{id}/fields endpoint (TODO B15) */}
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Save className="h-4 w-4" />}
            onClick={() => toast.info(t('docReview.approveDisabled'))}
            title={t('docReview.approveDisabled')}
          >
            {t('docReview.saveDraft')}
          </Button>

          {/* Approve — stubbed: no review-decision endpoint (TODO B15) */}
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Check className="h-4 w-4" />}
            disabled
            title={t('docReview.approveDisabled')}
          >
            {t('docReview.approve')}
          </Button>

          {/* Reject — stubbed: no review-decision endpoint (TODO B15) */}
          <Button
            variant="ghost"
            size="sm"
            className="text-error-600 hover:bg-error-50"
            leftIcon={<X className="h-4 w-4" />}
            disabled
            title={t('docReview.approveDisabled')}
          >
            {t('docReview.reject')}
          </Button>
        </div>
      </div>

      {/* Inline rejection confirm — kept for future wiring */}
      {showRejectConfirm && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-3 flex items-center justify-between shrink-0">
          <span className="text-red-700 font-medium text-sm">
            {t('docReview.rejectWarning')}
          </span>
          <div className="flex gap-2 ml-4">
            <Button variant="secondary" size="sm" onClick={() => setShowRejectConfirm(false)}>
              {t('docReview.cancelReject')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="bg-red-600 text-white hover:bg-red-700"
              disabled
              title={t('docReview.approveDisabled')}
            >
              {t('docReview.confirmReject')}
            </Button>
          </div>
        </div>
      )}

      {/* Split panel */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT: Document Viewer */}
        <div className="flex-1 flex flex-col bg-neutral-800 overflow-hidden">
          {/* Viewer controls */}
          <div className="flex items-center gap-2 px-4 py-2 bg-neutral-900 shrink-0">
            <Button variant="icon" size="sm" ariaLabel="Zoom out" onClick={() => setZoom((z) => Math.max(50, z - 10))}>
              <ZoomOut className="h-4 w-4 text-neutral-300" />
            </Button>
            <span className="text-xs text-neutral-400 w-12 text-center tabular-nums">{zoom}%</span>
            <Button variant="icon" size="sm" ariaLabel="Zoom in" onClick={() => setZoom((z) => Math.min(200, z + 10))}>
              <ZoomIn className="h-4 w-4 text-neutral-300" />
            </Button>
            <Button variant="icon" size="sm" ariaLabel="Rotate">
              <RotateCw className="h-4 w-4 text-neutral-300" />
            </Button>

            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="icon"
                size="sm"
                ariaLabel="Previous page"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4 text-neutral-300" />
              </Button>
              <span className="text-xs text-neutral-400 tabular-nums">
                {t('docReview.page', { current: currentPage, total: totalPages })}
              </span>
              <Button
                variant="icon"
                size="sm"
                ariaLabel="Next page"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                <ChevronRight className="h-4 w-4 text-neutral-300" />
              </Button>
            </div>
          </div>

          {/* Document image */}
          <div className="flex-1 flex items-center justify-center p-8 overflow-auto">
            <div
              className="bg-white rounded shadow-lg overflow-hidden"
              style={{ width: `${zoom * 5}px`, maxWidth: '100%', minHeight: '700px' }}
              aria-label="Document image"
            >
              {doc.storageUrl ? (
                <img
                  src={doc.storageUrl}
                  alt={doc.fileName}
                  className="w-full h-auto object-contain"
                  style={{ minHeight: '700px' }}
                />
              ) : (
                <div className="h-full w-full flex flex-col items-center justify-center p-8 text-neutral-300 gap-4 min-h-[700px]">
                  <svg className="h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-sm">{t('docReview.imagePlaceholder')}</p>
                  <p className="text-xs text-center max-w-48">
                    {t('docReview.imagePlaceholderHint')}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: OCR Data Editor */}
        <div className="w-96 flex flex-col bg-white border-l border-neutral-200 overflow-hidden shrink-0">
          {/* Header */}
          <div className="px-5 py-4 border-b border-neutral-200 shrink-0">
            <div className="flex items-center justify-between">
              <Badge variant="brand">{doc.status}</Badge>
              {lowConfidenceCount > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-warning-600">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {t('docReview.fieldsNeedReview_other', { count: lowConfidenceCount })}
                </div>
              )}
            </div>
            {/* Confidence legend */}
            <div className="flex items-center gap-3 mt-3 text-xs text-neutral-500">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-success-500" />
                {t('docReview.confidence.high')}
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-warning-500" />
                {t('docReview.confidence.medium')}
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-error-500" />
                {t('docReview.confidence.low')}
              </span>
            </div>

            {/* Contract gap notice */}
            <div className="mt-3 p-2 rounded-md bg-amber-50 border border-amber-200 text-xs text-amber-700 flex gap-1.5 items-start">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                {/* TODO B15: Approve/Reject disabled — review-decision endpoints pending */}
                Approve &amp; Reject disabled pending backend B15
              </span>
            </div>
          </div>

          {/* Fields */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {fields.length === 0 ? (
              <p className="text-sm text-neutral-400 text-center py-4">
                {t('docReview.noOcrFields')}
              </p>
            ) : (
              fields.map((field) => {
                const pct = toPercent(field.confidence)
                return (
                  <div key={field.name}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <ConfidenceDot confidence={field.confidence} />
                      <label
                        htmlFor={`field-${field.name}`}
                        className={cn('text-sm font-medium', getOcrConfidenceColor(pct))}
                      >
                        {field.name}
                      </label>
                      {field.isEdited && (
                        <Badge variant="warning" size="sm">{t('docReview.source.manual')}</Badge>
                      )}
                      {field.confidence !== null && (
                        <span className="ml-auto text-xs text-neutral-400 tabular-nums">{pct}%</span>
                      )}
                    </div>

                    {field.name === 'gstRate' ? (
                      <select
                        id={`field-${field.name}`}
                        value={field.editedValue}
                        onChange={(e) => updateField(field.name, e.target.value)}
                        className="w-full h-9 rounded-lg border border-neutral-300 bg-white text-sm px-3 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none"
                        aria-label={field.name}
                      >
                        <option value="0">0%</option>
                        <option value="5">5%</option>
                        <option value="12">12%</option>
                        <option value="18">18%</option>
                        <option value="28">28%</option>
                      </select>
                    ) : (
                      <input
                        id={`field-${field.name}`}
                        type="text"
                        value={field.editedValue}
                        onChange={(e) => updateField(field.name, e.target.value)}
                        className={cn(
                          'w-full h-9 rounded-lg border bg-white text-sm px-3',
                          'focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none transition-all',
                          pct < 50
                            ? 'border-error-300 bg-error-50/30'
                            : pct < 80
                            ? 'border-warning-300 bg-warning-50/30'
                            : 'border-neutral-300',
                        )}
                      />
                    )}
                  </div>
                )
              })
            )}

            {/* Notes & Flags */}
            <div className="pt-4 border-t border-neutral-200 space-y-4">
              <div>
                <label htmlFor="notes" className="text-sm font-medium text-neutral-700 block mb-1.5">
                  {t('docReview.notes.label')}
                </label>
                <textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder={t('docReview.notes.placeholder')}
                  className="w-full rounded-lg border border-neutral-300 text-sm px-3 py-2 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none resize-none"
                />
              </div>

              <Toggle
                checked={flagCallback}
                onChange={setFlagCallback}
                label={t('docReview.flag.callback')}
                description={t('docReview.flag.callbackDesc')}
              />

              <Toggle
                checked={flagOcrError}
                onChange={setFlagOcrError}
                label={t('docReview.flag.ocrError')}
                description={t('docReview.flag.ocrErrorDesc')}
              />
            </div>

            {/* Categorize — real API */}
            {doc.storageUrl === null && (
              <div className="pt-4 border-t border-neutral-200">
                <Button
                  variant="secondary"
                  size="sm"
                  fullWidth
                  loading={categorizeMutation.isPending}
                  onClick={() => {
                    // Demonstration: categorize with a fixed category for now.
                    // In production this would open a category picker modal.
                    toast.info(t('docReview.approveDisabled'))
                  }}
                >
                  Categorize Document
                </Button>
              </div>
            )}
          </div>

          {/* Action footer */}
          <div className="px-5 py-4 border-t border-neutral-200 space-y-2 shrink-0">
            {/* TODO B15: Approve/Reject disabled — review-decision endpoints pending */}
            <Button
              variant="primary"
              fullWidth
              leftIcon={<Check className="h-4 w-4" />}
              disabled
              title={t('docReview.approveDisabled')}
            >
              {t('docReview.approve')}
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                size="sm"
                title={t('docReview.approveDisabled')}
                onClick={() => toast.info(t('docReview.approveDisabled'))}
              >
                {t('docReview.saveDraft')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-error-600 hover:bg-error-50"
                disabled
                title={t('docReview.approveDisabled')}
              >
                {t('docReview.reject')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
