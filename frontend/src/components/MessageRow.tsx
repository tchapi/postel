import {
  memo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
} from 'react'
import { ActionIcon, Badge, Checkbox, Highlight, Text } from '@mantine/core'
import {
  IconArchive,
  IconPaperclip,
  IconStar,
  IconStarFilled,
  IconTrash,
} from '@tabler/icons-react'
import type { Density, MessageRow as Row } from '../types'
import { absoluteDate, displayName, relativeDate } from '../lib/format'
import { useI18n } from '../lib/i18n'
import classes from './MessageRow.module.css'

// Slot per row: the row inset 2px top and bottom, then 12px (comfortable, three lines) or 10px (compact, two) around the text.
export const ROW_HEIGHT: Record<Density, number> = { comfortable: 88, compact: 64 }
const SWIPE_THRESHOLD = 96

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
  const [dx, setDx] = useState(0)
  const start = useRef<{ x: number; y: number; locked: boolean | null } | null>(null)

  const onPointerDown = (e: PointerEvent) => {
    if (!swipeEnabled || e.pointerType === 'mouse') return
    start.current = { x: e.clientX, y: e.clientY, locked: null }
  }
  const onPointerMove = (e: PointerEvent) => {
    const s = start.current
    if (!s) return
    const mx = e.clientX - s.x
    const my = e.clientY - s.y
    if (s.locked === null && Math.hypot(mx, my) > 8) s.locked = Math.abs(mx) > Math.abs(my)
    if (s.locked) setDx(mx)
  }
  const onPointerEnd = () => {
    const s = start.current
    start.current = null
    if (s?.locked && Math.abs(dx) >= SWIPE_THRESHOLD) onSwipe(row, dx > 0 ? 'archive' : 'delete')
    setDx(0)
  }

  const sender = displayName(row.from)

  return (
    <div className={classes.swipeWrap} style={style} data-density={density}>
      {dx > 0 && (
        <div className={`${classes.swipeAction} ${classes.swipeArchive}`} aria-hidden>
          <IconArchive size={20} stroke={1.75} />
          {t.archive}
        </div>
      )}
      {dx < 0 && (
        <div className={`${classes.swipeAction} ${classes.swipeDelete}`} aria-hidden>
          {t.delete}
          <IconTrash size={20} stroke={1.75} />
        </div>
      )}
      <div
        id={domId}
        role="option"
        aria-selected={selected}
        aria-current={active || undefined}
        className={classes.row}
        data-active={active || undefined}
        data-selected={selected || undefined}
        data-unread={!row.seen || undefined}
        data-selection-mode={selectionMode || undefined}
        style={dx ? { transform: `translateX(${dx}px)` } : undefined}
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
              <IconPaperclip
                size={16}
                stroke={1.5}
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
              {row.flagged ? <IconStarFilled size={16} /> : <IconStar size={16} stroke={1.5} />}
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
