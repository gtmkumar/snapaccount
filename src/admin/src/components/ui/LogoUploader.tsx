/**
 * LogoUploader — Phase 6C
 * Client-side resize to 256px square; PNG/SVG ≤ 100 KB.
 * Alt-text required field.
 */
import { useRef, useState } from 'react'
import { Upload, X, ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'

interface LogoUploaderProps {
  value?: string | null // data URI or URL
  altText?: string
  onChangeFile: (dataUri: string, altText: string) => void
  onClear?: () => void
  className?: string
  disabled?: boolean
}

const MAX_SIZE_BYTES = 100 * 1024 // 100 KB
const TARGET_SIZE = 256

function resizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = TARGET_SIZE
        canvas.height = TARGET_SIZE
        const ctx = canvas.getContext('2d')
        if (!ctx) { reject(new Error('Canvas not supported')); return }
        // Draw with white background for PNG transparency
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, TARGET_SIZE, TARGET_SIZE)
        // Scale to fit inside square maintaining aspect ratio
        const scale = Math.min(TARGET_SIZE / img.width, TARGET_SIZE / img.height)
        const w = img.width * scale
        const h = img.height * scale
        const x = (TARGET_SIZE - w) / 2
        const y = (TARGET_SIZE - h) / 2
        ctx.drawImage(img, x, y, w, h)
        resolve(canvas.toDataURL('image/png', 0.9))
      }
      img.onerror = reject
      img.src = e.target?.result as string
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function LogoUploader({ value, altText = '', onChangeFile, onClear, className, disabled }: LogoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [localAltText, setLocalAltText] = useState(altText)
  const [dragging, setDragging] = useState(false)

  async function handleFile(file: File) {
    setError(null)
    if (!['image/png', 'image/svg+xml'].includes(file.type)) {
      setError(t('admin.logoUploader.errorType'))
      return
    }
    if (file.size > MAX_SIZE_BYTES) {
      setError(t('admin.logoUploader.errorSize'))
      return
    }
    try {
      const dataUri = await resizeImage(file)
      onChangeFile(dataUri, localAltText)
    } catch {
      setError(t('admin.logoUploader.errorResize'))
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) void handleFile(file)
    e.target.value = '' // Reset so same file can be re-selected
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) void handleFile(file)
  }

  return (
    <div className={cn('space-y-2', className)}>
      {/* Preview or dropzone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={cn(
          'relative flex items-center justify-center rounded-lg border-2 border-dashed transition-colors',
          'w-24 h-24 cursor-pointer',
          dragging ? 'border-brand-400 bg-brand-50' : 'border-neutral-200 hover:border-brand-300',
          disabled && 'pointer-events-none opacity-50'
        )}
        onClick={() => !disabled && inputRef.current?.click()}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={t('admin.logoUploader.ariaLabel')}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click() }}
      >
        {value ? (
          <>
            <img
              src={value}
              alt={localAltText || t('admin.logoUploader.logoAlt')}
              className="w-full h-full object-contain rounded-lg"
            />
            {!disabled && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onClear?.() }}
                aria-label={t('admin.logoUploader.clear')}
                className="absolute -top-2 -right-2 rounded-full bg-white border border-neutral-200 p-0.5 text-neutral-500 hover:text-error-600 shadow-sm"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center gap-1 text-neutral-400">
            <ImageIcon className="h-6 w-6" aria-hidden="true" />
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
          </div>
        )}
      </div>

      <p className="text-xs text-neutral-400">
        {t('admin.logoUploader.hint')}
      </p>

      {/* Alt-text */}
      <input
        type="text"
        value={localAltText}
        onChange={(e) => setLocalAltText(e.target.value)}
        placeholder={t('admin.logoUploader.altPlaceholder')}
        className={cn(
          'w-full rounded-lg border border-neutral-200 px-3 py-1.5 text-xs',
          'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent',
          'placeholder:text-neutral-400'
        )}
        disabled={disabled}
        aria-label={t('admin.logoUploader.altLabel')}
      />

      {error && (
        <p className="text-xs text-error-600" role="alert">{error}</p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/svg+xml"
        onChange={handleInput}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  )
}
