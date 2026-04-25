/**
 * DualPaneEditor — resizable left/right split with a draggable vertical splitter.
 * Persists column ratio to localStorage per `storageKey`.
 * Phase 6D new primitive.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface DualPaneEditorProps {
  left: ReactNode
  right: ReactNode
  storageKey?: string
  defaultRatio?: number // 0–1, default 0.55
  minLeftPx?: number
  minRightPx?: number
  className?: string
}

const STORAGE_PREFIX = 'snap_dual_pane_'

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function DualPaneEditor({
  left,
  right,
  storageKey = 'default',
  defaultRatio = 0.55,
  minLeftPx = 280,
  minRightPx = 280,
  className,
}: DualPaneEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)

  const [ratio, setRatio] = useState<number>(() => {
    try {
      const stored = localStorage.getItem(`${STORAGE_PREFIX}${storageKey}`)
      if (stored) {
        const parsed = parseFloat(stored)
        if (parsed > 0 && parsed < 1) return parsed
      }
    } catch { /* noop */ }
    return defaultRatio
  })

  useEffect(() => {
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${storageKey}`, String(ratio))
    } catch { /* noop */ }
  }, [ratio, storageKey])

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true

    function onMouseMove(ev: MouseEvent) {
      if (!isDragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const totalWidth = rect.width
      const minLeft = minLeftPx / totalWidth
      const minRight = minRightPx / totalWidth
      const newRatio = clamp((ev.clientX - rect.left) / totalWidth, minLeft, 1 - minRight)
      setRatio(newRatio)
    }

    function onMouseUp() {
      isDragging.current = false
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [minLeftPx, minRightPx])

  // Keyboard support for splitter focus
  function onKeyDown(e: React.KeyboardEvent) {
    const step = 0.02
    if (e.key === 'ArrowLeft') {
      setRatio(r => clamp(r - step, minLeftPx / 1000, 0.9))
    } else if (e.key === 'ArrowRight') {
      setRatio(r => clamp(r + step, 0.1, 1 - minRightPx / 1000))
    }
  }

  return (
    <div
      ref={containerRef}
      className={cn('flex h-full overflow-hidden', className)}
    >
      {/* Left pane */}
      <div
        className="flex flex-col overflow-hidden"
        style={{ width: `${ratio * 100}%` }}
      >
        {left}
      </div>

      {/* Splitter */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panes — use Arrow Left/Right to adjust"
        tabIndex={0}
        className={cn(
          'w-1.5 shrink-0 cursor-col-resize select-none',
          'bg-neutral-200 hover:bg-brand-400 focus:bg-brand-400 focus:outline-none',
          'transition-colors duration-150',
          isDragging.current && 'bg-brand-500'
        )}
        onMouseDown={onMouseDown}
        onKeyDown={onKeyDown}
      />

      {/* Right pane */}
      <div
        className="flex-1 flex flex-col overflow-hidden"
      >
        {right}
      </div>
    </div>
  )
}
