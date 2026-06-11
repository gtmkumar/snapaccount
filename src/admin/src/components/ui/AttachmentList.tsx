/**
 * AttachmentList — file upload progress + per-row states.
 * Phase 6B new primitive.
 */
import { useState } from 'react'
import { Paperclip, CheckCircle, AlertTriangle, X, RotateCcw, Download, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'

export type AttachmentState =
  | 'queued'
  | 'uploading'
  | 'success'
  | 'failed'
  | 'scanning'
  | 'scan_failed'

export interface AttachmentFile {
  id: string
  fileName: string
  fileSizeBytes: number
  state: AttachmentState
  progress?: number
  errorMessage?: string
  downloadUrl?: string
}

interface AttachmentRowProps {
  file: AttachmentFile
  onRemove: (id: string) => void
  onRetry?: (id: string) => void
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function truncateMiddle(name: string, maxLen = 32): string {
  if (name.length <= maxLen) return name
  const ext = name.lastIndexOf('.') > 0 ? name.slice(name.lastIndexOf('.')) : ''
  const base = name.slice(0, name.lastIndexOf('.') > 0 ? name.lastIndexOf('.') : name.length)
  const half = Math.floor((maxLen - 3 - ext.length) / 2)
  return `${base.slice(0, half)}…${base.slice(-half)}${ext}`
}

function AttachmentRow({ file, onRemove, onRetry }: AttachmentRowProps) {
  const iconClass = 'h-4 w-4 shrink-0'

  const stateIcon = () => {
    switch (file.state) {
      case 'success': return <CheckCircle className={cn(iconClass, 'text-success-600')} aria-hidden="true" />
      case 'failed':
      case 'scan_failed': return <AlertTriangle className={cn(iconClass, 'text-error-600')} aria-hidden="true" />
      case 'uploading':
      case 'queued': return <Upload className={cn(iconClass, 'text-neutral-400')} aria-hidden="true" />
      case 'scanning': return (
        <span className={cn(iconClass, 'rounded-full border-2 border-brand-500 border-t-transparent animate-spin inline-block')} aria-hidden="true" />
      )
      default: return <Paperclip className={cn(iconClass, 'text-neutral-400')} aria-hidden="true" />
    }
  }

  const stateLabel = () => {
    switch (file.state) {
      case 'queued': return <span className="text-xs text-neutral-500">Queued</span>
      case 'uploading': return <span className="text-xs text-brand-600">{file.progress ?? 0}%</span>
      case 'success': return <span className="text-xs text-neutral-500">{formatFileSize(file.fileSizeBytes)}</span>
      case 'failed': return <span className="text-xs text-error-600">{file.errorMessage ?? 'Upload failed'}</span>
      case 'scanning': return <span className="text-xs text-neutral-500">Scanning…</span>
      case 'scan_failed': return <span className="text-xs text-error-600">Virus scan failed</span>
      default: return null
    }
  }

  return (
    <li className="min-h-[44px] flex flex-col gap-1 py-2 px-3 rounded-lg border border-neutral-200 bg-neutral-50">
      <div className="flex items-center gap-2">
        {stateIcon()}
        <span
          className="flex-1 text-sm text-neutral-700 font-medium truncate min-w-0"
          title={file.fileName}
        >
          {truncateMiddle(file.fileName)}
        </span>
        {stateLabel()}
        <div className="flex items-center gap-1 shrink-0">
          {file.state === 'success' && file.downloadUrl && (
            <a
              href={file.downloadUrl}
              download={file.fileName}
              className="p-1 rounded text-neutral-400 hover:text-neutral-600 hover:bg-neutral-200"
              aria-label={`Download ${file.fileName}`}
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          )}
          {(file.state === 'failed') && onRetry && (
            <button
              onClick={() => onRetry(file.id)}
              className="p-1 rounded text-brand-500 hover:text-brand-700 hover:bg-brand-50"
              aria-label={`Retry uploading ${file.fileName}`}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
          {file.state !== 'scanning' && (
            <button
              onClick={() => onRemove(file.id)}
              className="p-1 rounded text-neutral-400 hover:text-error-600 hover:bg-error-50"
              aria-label={`Remove ${file.fileName}`}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      {file.state === 'uploading' && (
        <div
          className="h-1 rounded-full bg-neutral-200"
          role="progressbar"
          aria-valuenow={file.progress ?? 0}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Uploading ${file.fileName}: ${file.progress ?? 0}%`}
        >
          <div
            className="h-1 rounded-full bg-brand-500 transition-all duration-200"
            style={{ width: `${file.progress ?? 0}%` }}
          />
        </div>
      )}
      {file.state === 'scan_failed' && (
        <p className="text-xs text-error-600 mt-0.5">
          This file failed the virus scan and cannot be attached. Remove it and try a different file.
        </p>
      )}
    </li>
  )
}

interface AttachmentListProps {
  files: AttachmentFile[]
  onAdd?: (files: File[]) => void
  onRemove: (id: string) => void
  onRetry?: (id: string) => void
  maxFiles?: number
  accept?: string
  maxSizeMb?: number
  className?: string
  readOnly?: boolean
}

export function AttachmentList({
  files,
  onAdd,
  onRemove,
  onRetry,
  maxFiles = 10,
  accept = 'application/pdf,image/jpeg,image/png',
  maxSizeMb = 10,
  className,
  readOnly = false,
}: AttachmentListProps) {
  const [dragOver, setDragOver] = useState(false)
  const canAdd = !readOnly && files.length < maxFiles

  function handleFiles(rawFiles: FileList | null) {
    if (!rawFiles || !onAdd) return
    const valid = Array.from(rawFiles).filter(
      (f) => f.size <= maxSizeMb * 1024 * 1024
    )
    if (valid.length) onAdd(valid)
  }

  return (
    <div className={cn('space-y-2', className)}>
      {files.length > 0 && (
        <ul role="list" className="space-y-2">
          {files.map((file) => (
            <AttachmentRow
              key={file.id}
              file={file}
              onRemove={onRemove}
              onRetry={onRetry}
            />
          ))}
        </ul>
      )}

      {canAdd && (
        <label
          className={cn(
            'flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed cursor-pointer transition-colors px-4 py-4',
            dragOver
              ? 'border-brand-400 bg-brand-50'
              : 'border-neutral-300 bg-neutral-50 hover:border-brand-300 hover:bg-brand-50/50'
          )}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
        >
          <Paperclip className="h-4 w-4 text-neutral-400" aria-hidden="true" />
          <span className="text-xs text-neutral-500">
            Click or drop files to attach (PDF, JPG, PNG · max {maxSizeMb}MB)
          </span>
          <input
            type="file"
            accept={accept}
            multiple
            className="sr-only"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </label>
      )}

      {files.length >= maxFiles && !readOnly && (
        <p className="text-xs text-neutral-500">Maximum {maxFiles} files reached.</p>
      )}
    </div>
  )
}
