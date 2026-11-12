import { useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import type { Layout } from './AppShell'
import classes from './SplitPanes.module.css'

export type SplitPanesProps = {
  layout: Layout
  list: ReactNode
  reader: ReactNode
  /** Phones show one pane at a time. */
  mobilePane: 'list' | 'reader'
  listWidth: number
  onListWidthChange: (w: number) => void
}

const MIN_LIST = 300
const MAX_LIST = 560
const clamp = (w: number) => Math.min(MAX_LIST, Math.max(MIN_LIST, w))

/** A list and what it opens, side by side, with a splitter between them. Mail and contacts share it. */
export function SplitPanes(p: SplitPanesProps) {
  const drag = useRef<{ x: number; w: number } | null>(null)

  const onSplitDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, w: p.listWidth }
  }
  const onSplitMove = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current) p.onListWidthChange(clamp(drag.current.w + e.clientX - drag.current.x))
  }
  const onSplitKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') p.onListWidthChange(clamp(p.listWidth - 16))
    if (e.key === 'ArrowRight') p.onListWidthChange(clamp(p.listWidth + 16))
  }

  return (
    <>
      {(p.layout !== 'mobile' || p.mobilePane === 'list') && (
        <div
          className={classes.listPane}
          style={{ width: p.layout === 'mobile' ? '100%' : p.listWidth }}
        >
          {p.list}
        </div>
      )}
      {p.layout !== 'mobile' && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-valuenow={p.listWidth}
          aria-valuemin={MIN_LIST}
          aria-valuemax={MAX_LIST}
          tabIndex={0}
          className={classes.splitter}
          onPointerDown={onSplitDown}
          onPointerMove={onSplitMove}
          onPointerUp={() => (drag.current = null)}
          onKeyDown={onSplitKey}
        />
      )}
      {(p.layout !== 'mobile' || p.mobilePane === 'reader') && (
        <main className={classes.readerPane}>{p.reader}</main>
      )}
    </>
  )
}
