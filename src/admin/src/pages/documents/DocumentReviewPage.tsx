import { useState } from 'react'
import { useParams, useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
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
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge, StatusBadge } from '@/components/ui/Badge'
import { Toggle } from '@/components/ui/Toggle'
import { cn, getOcrConfidenceColor, getOcrConfidenceBg } from '@/lib/utils'

interface OcrField {
  name: string
  label: string
  value: string
  confidence: number
  source: 'OCR' | 'Manual'
  validation?: { valid: boolean; message: string }
}

const mockFields: OcrField[] = [
  { name: 'invoiceNumber', label: 'Invoice Number', value: 'INV-2026-00234', confidence: 95, source: 'OCR', validation: { valid: true, message: 'Valid format' } },
  { name: 'invoiceDate', label: 'Invoice Date', value: '31/03/2026', confidence: 88, source: 'OCR' },
  { name: 'vendorName', label: 'Vendor / Customer Name', value: 'Sharma Trading Co.', confidence: 79, source: 'OCR' },
  { name: 'vendorGstin', label: 'Vendor GSTIN', value: '27AABCS1429B1ZB', confidence: 91, source: 'OCR', validation: { valid: true, message: 'GSTIN format valid' } },
  { name: 'hsnCode', label: 'HSN / SAC Code', value: '6403', confidence: 72, source: 'OCR' },
  { name: 'description', label: 'Description', value: 'Sports Footwear - Assorted', confidence: 82, source: 'OCR' },
  { name: 'taxableAmount', label: 'Taxable Amount (₹)', value: '45,000', confidence: 93, source: 'OCR' },
  { name: 'gstRate', label: 'GST Rate', value: '18', confidence: 88, source: 'OCR' },
  { name: 'cgst', label: 'CGST (₹)', value: '4,050', confidence: 90, source: 'OCR' },
  { name: 'sgst', label: 'SGST (₹)', value: '4,050', confidence: 90, source: 'OCR' },
  { name: 'igst', label: 'IGST (₹)', value: '0', confidence: 95, source: 'OCR' },
  { name: 'totalAmount', label: 'Total Amount (₹)', value: '53,100', confidence: 87, source: 'OCR' },
  { name: 'paymentMode', label: 'Payment Mode', value: 'Bank Transfer', confidence: 43, source: 'OCR' },
]

function ConfidenceDot({ confidence }: { confidence: number }) {
  return (
    <div
      className={cn('h-2.5 w-2.5 rounded-full shrink-0', getOcrConfidenceBg(confidence))}
      title={`OCR Confidence: ${confidence}%`}
      aria-label={`OCR confidence ${confidence}%`}
    />
  )
}

export default function DocumentReviewPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [zoom, setZoom] = useState(100)
  const [currentPage, setCurrentPage] = useState(1)
  const [fields, setFields] = useState<OcrField[]>(mockFields)
  const [notes, setNotes] = useState('')
  const [flagCallback, setFlagCallback] = useState(false)
  const [flagOcrError, setFlagOcrError] = useState(false)
  const [showRejectConfirm, setShowRejectConfirm] = useState(false)
  const totalPages = 2

  useQuery({
    queryKey: ['document', id],
    queryFn: async () => {
      await new Promise(r => setTimeout(r, 200))
      return { id, documentId: 'D-20260401-0001' }
    },
  })

  const updateField = (name: string, value: string) => {
    setFields(prev => prev.map(f =>
      f.name === name ? { ...f, value, source: 'Manual' } : f
    ))
  }

  const getLowConfidenceCount = () => fields.filter(f => f.confidence < 80).length

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
            ariaLabel="Back to queue"
          >
            Queue
          </Button>
          <div>
            <span className="text-sm font-semibold text-neutral-800">
              Document D-20260401-0001
            </span>
            <span className="text-sm text-neutral-400 mx-2">·</span>
            <span className="text-sm text-neutral-500">Rajesh Kumar</span>
          </div>
          <StatusBadge status="OCR_COMPLETE" />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-warning-600 font-medium">
            SLA: 1h 23m remaining
          </span>
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Save className="h-4 w-4" />}
            onClick={() => toast.success('Changes saved as draft')}
          >
            Save Draft
          </Button>
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Check className="h-4 w-4" />}
            onClick={() => {
              toast.success('Document approved and sent for processing')
              void navigate('/documents')
            }}
          >
            Approve & Process
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-error-600 hover:bg-error-50"
            leftIcon={<X className="h-4 w-4" />}
            onClick={() => setShowRejectConfirm(true)}
          >
            Reject
          </Button>
        </div>
      </div>

      {/* Inline rejection confirmation banner */}
      {showRejectConfirm && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-3 flex items-center justify-between shrink-0">
          <span className="text-red-700 font-medium text-sm">Are you sure you want to reject this document? This action cannot be undone.</span>
          <div className="flex gap-2 ml-4">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowRejectConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => {
                setShowRejectConfirm(false)
                toast.error('Document rejected')
                void navigate('/documents')
              }}
            >
              Confirm Reject
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
            <Button variant="icon" size="sm" ariaLabel="Zoom out" onClick={() => setZoom(z => Math.max(50, z - 10))}>
              <ZoomOut className="h-4 w-4 text-neutral-300" />
            </Button>
            <span className="text-xs text-neutral-400 w-12 text-center tabular-nums">{zoom}%</span>
            <Button variant="icon" size="sm" ariaLabel="Zoom in" onClick={() => setZoom(z => Math.min(200, z + 10))}>
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
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4 text-neutral-300" />
              </Button>
              <span className="text-xs text-neutral-400 tabular-nums">
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="icon"
                size="sm"
                ariaLabel="Next page"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                <ChevronRight className="h-4 w-4 text-neutral-300" />
              </Button>
            </div>
          </div>

          {/* Document display area */}
          <div className="flex-1 flex items-center justify-center p-8 overflow-auto">
            <div
              className="bg-white rounded shadow-lg"
              style={{ width: `${zoom * 5}px`, maxWidth: '100%', minHeight: '700px' }}
              aria-label="Document image"
            >
              {/* Placeholder for document image */}
              <div className="h-full w-full flex flex-col items-center justify-center p-8 text-neutral-300 gap-4 min-h-[700px]">
                <svg className="h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-sm">Document image viewer</p>
                <p className="text-xs text-center max-w-48">
                  In production, the signed GCS URL will render the actual document with OCR overlay bounding boxes
                </p>

                {/* Mock OCR overlay boxes */}
                <div className="w-full space-y-3 mt-4 px-4">
                  {['Invoice No: INV-2026-00234', 'Date: 31/03/2026', 'Sharma Trading Co.', '27AABCS1429B1ZB', 'Total: ₹53,100'].map((text, i) => (
                    <div
                      key={i}
                      className={cn(
                        'border rounded px-2 py-1 text-xs cursor-pointer',
                        i === 4 ? 'border-warning-400 bg-warning-50/50 text-warning-700' : 'border-success-400 bg-success-50/50 text-success-700'
                      )}
                    >
                      {text}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: OCR Data Editor */}
        <div className="w-96 flex flex-col bg-white border-l border-neutral-200 overflow-hidden shrink-0">
          {/* Header */}
          <div className="px-5 py-4 border-b border-neutral-200 shrink-0">
            <div className="flex items-center justify-between">
              <Badge variant="brand">Sales Bill</Badge>
              {getLowConfidenceCount() > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-warning-600">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {getLowConfidenceCount()} fields need review
                </div>
              )}
            </div>
            {/* Confidence legend */}
            <div className="flex items-center gap-3 mt-3 text-xs text-neutral-500">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-success-500" /> High (&gt;80%)</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-warning-500" /> Medium</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-error-500" /> Low (&lt;50%)</span>
            </div>
          </div>

          {/* Fields */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {fields.map((field) => (
              <div key={field.name}>
                <div className="flex items-center gap-2 mb-1.5">
                  <ConfidenceDot confidence={field.confidence} />
                  <label
                    htmlFor={`field-${field.name}`}
                    className={cn('text-sm font-medium', getOcrConfidenceColor(field.confidence))}
                  >
                    {field.label}
                  </label>
                  {field.source === 'Manual' && (
                    <Badge variant="warning" size="sm">Manual</Badge>
                  )}
                  <span className="ml-auto text-xs text-neutral-400 tabular-nums">{field.confidence}%</span>
                </div>

                {field.name === 'gstRate' ? (
                  <select
                    id={`field-${field.name}`}
                    value={field.value}
                    onChange={(e) => updateField(field.name, e.target.value)}
                    className="w-full h-9 rounded-lg border border-neutral-300 bg-white text-sm px-3 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none"
                    aria-label={field.label}
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
                    value={field.value}
                    onChange={(e) => updateField(field.name, e.target.value)}
                    className={cn(
                      'w-full h-9 rounded-lg border bg-white text-sm px-3',
                      'focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none transition-all',
                      field.confidence < 50
                        ? 'border-error-300 bg-error-50/30'
                        : field.confidence < 80
                        ? 'border-warning-300 bg-warning-50/30'
                        : 'border-neutral-300'
                    )}
                  />
                )}

                {field.validation && (
                  <p className={cn('text-xs mt-1', field.validation.valid ? 'text-success-600' : 'text-error-600')}>
                    {field.validation.valid ? '✓' : '✗'} {field.validation.message}
                  </p>
                )}
              </div>
            ))}

            {/* Notes & Flags */}
            <div className="pt-4 border-t border-neutral-200 space-y-4">
              <div>
                <label htmlFor="notes" className="text-sm font-medium text-neutral-700 block mb-1.5">
                  Notes for CA / Team
                </label>
                <textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Add any notes or flags for the reviewing CA..."
                  className="w-full rounded-lg border border-neutral-300 text-sm px-3 py-2 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none resize-none"
                />
              </div>

              <Toggle
                checked={flagCallback}
                onChange={setFlagCallback}
                label="Flag for human callback"
                description="Trigger a callback to the user for this document"
              />

              <Toggle
                checked={flagOcrError}
                onChange={setFlagOcrError}
                label="Report OCR error"
                description="Flag this for model improvement feedback"
              />
            </div>
          </div>

          {/* Action footer */}
          <div className="px-5 py-4 border-t border-neutral-200 space-y-2 shrink-0">
            <Button
              variant="primary"
              fullWidth
              leftIcon={<Check className="h-4 w-4" />}
              onClick={() => {
                toast.success('Document approved and sent for processing')
                void navigate('/documents')
              }}
            >
              Approve & Process
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => toast.success('Changes saved as draft')}
              >
                Save Draft
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-error-600 hover:bg-error-50"
                onClick={() => setShowRejectConfirm(true)}
              >
                Reject
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
