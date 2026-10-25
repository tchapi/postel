import {
  memo,
  useEffect,
  useRef,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
} from 'react'
import { ActionIcon, Badge, Checkbox, Highlight, Text } from '@mantine/core'
import { ArchiveIcon, PaperclipIcon, StarIcon, Trash2Icon } from 'lucide-react'
import type { Density, MessageRow as Row } from '../types'
import { absoluteDate, displayName, relativeDate } from '../lib/format'
import { useI18n } from '../lib/i18n'
import classes from './MessageRow.module.css'

// Slot per row: the row inset 2px top and bottom, then 12px (comfortable, three lines) or 10px (compact, two) around the text.
export const ROW_HEIGHT: Record<Density, number> = { comfortable: 88, compact: 64 }
const SWIPE_THRESHOLD = 96
const SWIPE_EASE = 'transform 280ms cubic-bezier(0.22, 1, 0.36, 1)'
/** How long the row takes to slide out before its action runs. */
const SWIPE_OUT_MS = 200

type SwipeDrag = { id: number; x: number; y: number; locked: boolean | null; dx: number }

export type MessageRowProps = {
  row: Row
  domId: string
  active: boolean
  selected: boolean
  /** Any row selected: checkboxes stay visible on every row. */
  selectionMode: boolean
  density: Density
  folderLabel?: string
  highlight?: string
  swipeEnabled: boolean
  style?: CSSProperties
  onActivate: (uid: number) => void
  onToggleSelect: (uid: number, range: boolean) => void
  onToggleStar: (row: Row) => void
  onContextMenu: (row: Row, event: MouseEvent) => void
  onSwipe: (row: Row, action: 'archive' | 'delete') => void
}

function MessageRowImpl({
  row,
  domId,
  active,
  selected,
  selectionMode,
  density,
  folderLabel,
  highlight,
  swipeEnabled,
  style,
  onActivate,
  onToggleSelect,
  onToggleStar,
  onContextMenu,
  onSwipe,
}: MessageRowProps) {
  const { t, locale } = useI18n()
  const wrapRef = useRef<HTMLDivElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)
  const drag = useRef<SwipeDrag | null>(null)
  const frame = useRef(0)
  const outTimer = useRef(0)
  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current)
      clearTimeout(outTimer.current)
    },
    [],
  )

  // The drag writes to the DOM once per frame, without re-rendering the row.
  // The action behind fades in with the distance, so a slight wobble shows no colour.
  const paint = (dx: number, animate: boolean) => {
    const wrap = wrapRef.current
    const el = rowRef.current
    if (!wrap || !el) return
    el.style.transition = animate ? SWIPE_EASE : 'none'
    el.style.transform = dx ? `translate3d(${dx}px, 0, 0)` : ''
    wrap.dataset.swipe = dx > 0 ? 'archive' : dx < 0 ? 'delete' : ''
    wrap.toggleAttribute('data-armed', Math.abs(dx) >= SWIPE_THRESHOLD)
    wrap.style.setProperty('--swipe-reveal', String(Math.min(Math.abs(dx) / 40, 1)))
  }

  const onPointerDown = (e: PointerEvent) => {
    if (!swipeEnabled || e.pointerType === 'mouse' || drag.current) return
    clearTimeout(outTimer.current)
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, locked: null, dx: 0 }
  }
  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const mx = e.clientX - d.x
    const my = e.clientY - d.y
    if (d.locked === null && Math.hypot(mx, my) > 8) {
      d.locked = Math.abs(mx) > Math.abs(my)
      // Keep the moves coming even if the finger drifts off the row
      if (d.locked) e.currentTarget.setPointerCapture(e.pointerId)
    }
    if (!d.locked) return
    d.dx = mx
    if (!frame.current)
      frame.current = requestAnimationFrame(() => {
        frame.current = 0
        if (drag.current) paint(drag.current.dx, false)
      })
  }
  const onPointerEnd = (e: PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    drag.current = null
    cancelAnimationFrame(frame.current)
    frame.current = 0
    if (!d.locked) return
    const width = wrapRef.current?.offsetWidth ?? 0
    if (e.type === 'pointerup' && Math.abs(d.dx) >= SWIPE_THRESHOLD && width) {
      // Slide out, then act: the row leaves the list as it lands
      const action = d.dx > 0 ? 'archive' : 'delete'
      paint(Math.sign(d.dx) * width, true)
      outTimer.current = window.setTimeout(() => {
        onSwipe(row, action)
        // Back in place, should the row stay (e.g. the action failed)
        outTimer.current = window.setTimeout(() => paint(0, true), 600)
      }, SWIPE_OUT_MS)
    } else {
      paint(0, true)
    }
  }

  const sender = displayName(row.from)

  return (
    <div ref={wrapRef} className={classes.swipeWrap} style={style} data-density={density}>
      {swipeEnabled && (
        <>
          <div className={`${classes.swipeAction} ${classes.swipeArchive}`} aria-hidden>
            <ArchiveIcon size={20} strokeWidth={1.75} />
            {t.archive}
          </div>
          <div className={`${classes.swipeAction} ${classes.swipeDelete}`} aria-hidden>
            {t.delete}
            <Trash2Icon size={20} strokeWidth={1.75} />
          </div>
        </>
      )}
      <div
        ref={rowRef}
        id={domId}
        role="option"
        aria-selected={selected}
        aria-current={active || undefined}
        className={classes.row}
        data-active={active || undefined}
        data-selected={selected || undefined}
        data-unread={!row.seen || undefined}
        data-selection-mode={selectionMode || undefined}
        onClick={(e) => {
          if (e.shiftKey || e.metaKey || e.ctrlKey) onToggleSelect(row.uid, e.shiftKey)
          else onActivate(row.uid)
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          onContextMenu(row, e)
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        <div className={classes.lead}>
          <span className={classes.dot} aria-label={row.seen ? undefined : t.unread} />
          <Checkbox
            className={classes.check}
            size="xs"
            aria-label={t.selectMessage}
            checked={selected}
            readOnly
            onClick={(e) => {
              e.stopPropagation()
              onToggleSelect(row.uid, e.shiftKey)
            }}
          />
        </div>
        <div className={classes.body}>
          <div className={classes.line}>
            <Text span className={classes.sender} truncate>
              {sender}
            </Text>
            {(row.threadSize ?? 1) > 1 && (
              <Text span size="xs" c="dimmed" fw={500} style={{ flex: 'none' }}>
                {row.threadSize}
              </Text>
            )}
            {folderLabel && (
              <Badge size="xs" variant="default" radius="sm" className={classes.folderBadge}>
                {folderLabel}
              </Badge>
            )}
            {row.hasAttachments && (
              <PaperclipIcon
                size={16}
                strokeWidth={1.5}
                className={classes.clip}
                aria-label={t.hasAttachments}
              />
            )}
            <time
              className={classes.date}
              dateTime={row.date}
              title={absoluteDate(row.date, locale)}
            >
              {relativeDate(row.date, locale)}
            </time>
          </div>
          <div className={classes.line}>
            {highlight ? (
              <Highlight highlight={highlight} className={classes.subject} truncate>
                {row.subject}
              </Highlight>
            ) : (
              <Text span className={classes.subject} truncate>
                {row.subject}
              </Text>
            )}
            <ActionIcon
              size="sm"
              className={classes.star}
              data-flagged={row.flagged || undefined}
              aria-label={row.flagged ? t.unstar : t.star}
              aria-pressed={row.flagged}
              onClick={(e) => {
                e.stopPropagation()
                onToggleStar(row)
              }}
            >
              {row.flagged ? (
                <StarIcon fill="currentColor" size={16} />
              ) : (
                <StarIcon size={16} strokeWidth={1.5} />
              )}
            </ActionIcon>
          </div>
          <Text span size="sm" c="dimmed" truncate className={classes.snippet}>
            {row.snippet}
          </Text>
        </div>
      </div>
    </div>
  )
}

export const MessageRow = memo(MessageRowImpl)
