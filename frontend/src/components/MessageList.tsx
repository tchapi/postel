import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type CSSProperties,
} from 'react'
import {
  ActionIcon,
  Box,
  Checkbox,
  Group,
  Loader,
  Menu,
  ScrollArea,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  ArchiveIcon,
  BanIcon,
  FolderInputIcon,
  ForwardIcon,
  InboxIcon,
  MailIcon,
  MailOpenIcon,
  RefreshCwIcon,
  ReplyAllIcon,
  ReplyIcon,
  StarIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react'
import type { BulkAction, Density, MessageRow as Row, RowAction } from '../types'
import { useElementSize } from '@mantine/hooks'
import { useI18n } from '../lib/i18n'
import { KeyCombo } from './ShortcutTooltip'
import { BulkActionBar } from './BulkActionBar'
import { MoveMenuItems, type MoveTarget } from './MoveMenu'
import { MessageRow, ROW_HEIGHT } from './MessageRow'
import { ErrorState, ListSkeleton, StateMessage } from './States'
import classes from './MessageList.module.css'

export type MessageListProps = {
  title: string
  subtitle?: string
  /** Search filter chips etc., rendered under the header. */
  headerExtra?: ReactNode
  /** The backend does not answer at all, rather than this list failing. */
  unreachable?: boolean
  /** Space taken at the top by a bar floating over the list from outside (the phone top bar). */
  topOffset?: number
  onCloseSearch?: () => void
  rows: Row[]
  total: number
  status: 'pending' | 'error' | 'success'
  onRetry: () => void
  hasNextPage: boolean
  isFetchingNextPage: boolean
  onLoadMore: () => void
  activeUid: number | null
  selected: ReadonlySet<number>
  density: Density
  /** Touch layout: swipe actions and pull to refresh. */
  isTouch: boolean
  emptyLabel: string
  endLabel: string
  highlight?: string
  folderLabelFor?: (row: Row) => string | undefined
  moveTargets: MoveTarget[]
  onActivate: (uid: number) => void
  onOpen: (uid: number) => void
  onToggleSelect: (uid: number, range: boolean) => void
  onSelectAll: (checked: boolean) => void
  onClearSelection: () => void
  onToggleStar: (row: Row) => void
  onAction: (action: RowAction, uids: number[]) => void
  onSwipe: (row: Row, action: 'archive' | 'delete') => void
  onRefresh: () => Promise<unknown>
}

type ContextMenuState = { x: number; y: number; row: Row; uids: number[] } | null

/** Pull distance (after resistance) that triggers a refresh on release. */
const PULL_TRIGGER = 64
/** Distance the list holds, and the indicator's height, while the refresh runs. */
const PULL_HOLD = 44
/** The pull tends to this, ever slower: a rubber band rather than a hard stop. */
const PULL_MAX = 120
const PULL_EASE = 'transform 360ms cubic-bezier(0.22, 1, 0.36, 1), opacity 360ms ease'

type PullPhase = 'idle' | 'pulling' | 'armed' | 'refreshing'

export function MessageList(props: MessageListProps) {
  const {
    title,
    subtitle,
    headerExtra,
    onCloseSearch,
    rows,
    total,
    status,
    onRetry,
    hasNextPage,
    isFetchingNextPage,
    onLoadMore,
    activeUid,
    selected,
    density,
    isTouch,
    emptyLabel,
    endLabel,
    highlight,
    folderLabelFor,
    moveTargets,
    onActivate,
    onOpen,
    onToggleSelect,
    onSelectAll,
    onClearSelection,
    onToggleStar,
    onAction,
    onSwipe,
    onRefresh,
    topOffset = 0,
    unreachable,
  } = props
  const { t } = useI18n()
  const viewportRef = useRef<HTMLDivElement>(null)
  const [scrolled, setScrolled] = useState(false)
  // The header floats over the list: rows start below it and scroll under it
  const { ref: overlayRef, height: overlayHeight } = useElementSize()
  const topInset = topOffset + overlayHeight
  const { ref: areaRef, height: areaHeight } = useElementSize()
  const rowHeight = ROW_HEIGHT[density]
  const [menu, setMenu] = useState<ContextMenuState>(null)
  const [pullPhase, setPullPhase] = useState<PullPhase>('idle')
  const pullContentRef = useRef<HTMLDivElement>(null)
  const pullIndicatorRef = useRef<HTMLDivElement>(null)
  const pullIconRef = useRef<SVGSVGElement>(null)
  const onRefreshRef = useRef(onRefresh)
  useEffect(() => {
    onRefreshRef.current = onRefresh
  })

  // One extra virtual row for the "loading more" / "end of list" footer.
  const count = rows.length > 0 ? rows.length + 1 : 0
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => viewportRef.current,
    estimateSize: () => rowHeight,
    overscan: 10,
    // Below the floating header, plus room above the first row's highlight
    paddingStart: topInset + 6,
    paddingEnd: 6,
  })

  useEffect(() => {
    virtualizer.measure()
  }, [rowHeight, virtualizer])

  const items = virtualizer.getVirtualItems()
  const lastIndex = items.length ? items[items.length - 1]!.index : -1

  // Infinite scroll: fetch the next page of 50 when the window nears the end.
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && lastIndex >= rows.length - 10) onLoadMore()
  }, [lastIndex, rows.length, hasNextPage, isFetchingNextPage, onLoadMore])

  // Keep the keyboard cursor in view (and rendered, so aria-activedescendant resolves).
  const activeIndex = activeUid === null ? -1 : rows.findIndex((r) => r.uid === activeUid)
  useEffect(() => {
    if (activeIndex >= 0) virtualizer.scrollToIndex(activeIndex, { align: 'auto' })
  }, [activeIndex, virtualizer])

  const onListKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!rows.length) return
    const at = Math.max(activeIndex, 0)
    const go = (i: number) => {
      e.preventDefault()
      const r = rows[Math.min(Math.max(i, 0), rows.length - 1)]
      if (r) onActivate(r.uid)
    }
    switch (e.key) {
      case 'ArrowDown':
        return go(activeIndex < 0 ? 0 : at + 1)
      case 'ArrowUp':
        return go(at - 1)
      case 'Home':
        return go(0)
      case 'End':
        return go(rows.length - 1)
      case 'Enter':
        if (activeUid !== null) {
          e.preventDefault()
          onOpen(activeUid)
        }
        return
      case ' ':
        if (activeUid !== null) {
          e.preventDefault()
          onToggleSelect(activeUid, e.shiftKey)
        }
        return
    }
  }

  const openContextMenu = (row: Row, e: MouseEvent) => {
    const uids = selected.has(row.uid) ? [...selected] : [row.uid]
    setMenu({ x: e.clientX, y: e.clientY, row, uids })
  }

  // Pull to refresh (touch only, list scrolled to top). Native listeners: the
  // move must be cancellable, or Safari runs its own page pull and reload on
  // top of ours. The end is caught on window, so a pull can never stay stuck.
  // The drag writes transforms straight to the DOM once per frame; React only
  // hears about phase changes, so the list never re-renders under the finger.
  useEffect(() => {
    const viewport = viewportRef.current
    if (!isTouch || !viewport) return
    let startY: number | null = null
    let startX = 0
    let offset = 0
    let frame = 0
    let busy = false
    let phase: PullPhase = 'idle'

    const setPhase = (next: PullPhase) => {
      if (next !== phase) setPullPhase((phase = next))
    }
    const paint = (animate: boolean) => {
      const content = pullContentRef.current
      const indicator = pullIndicatorRef.current
      const icon = pullIconRef.current
      const transition = animate ? PULL_EASE : 'none'
      if (content) {
        content.style.transition = transition
        content.style.transform = offset ? `translate3d(0, ${offset}px, 0)` : ''
        // No row presses or hovers while the list is being dragged
        content.style.pointerEvents = startY === null ? '' : 'none'
      }
      if (indicator) {
        indicator.style.transition = transition
        indicator.style.transform = `translate3d(0, ${offset - PULL_HOLD}px, 0)`
        indicator.style.opacity = String(Math.min(offset / PULL_TRIGGER, 1))
      }
      if (icon) icon.style.transform = `rotate(${(offset / PULL_TRIGGER) * 270}deg)`
    }
    const moveTo = (next: number, animate: boolean) => {
      offset = next
      if (animate) {
        cancelAnimationFrame(frame)
        frame = 0
        paint(true)
      } else if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0
          paint(false)
        })
      }
    }

    // The pull follows the finger that started it: other fingers are ignored,
    // and only that finger lifting (or iOS cancelling the touch) ends it.
    let finger: number | null = null
    const tracked = (list: TouchList) =>
      Array.from(list).find((touch) => touch.identifier === finger)

    const onStart = (e: globalThis.TouchEvent) => {
      if (startY !== null || busy) return
      const touch = e.touches.length === 1 ? e.touches[0] : undefined
      if (!touch || viewport.scrollTop > 0) return
      startY = touch.clientY
      startX = touch.clientX
      finger = touch.identifier
    }
    const onMove = (e: globalThis.TouchEvent) => {
      const touch = startY === null ? undefined : tracked(e.touches)
      if (!touch || startY === null) return
      const dy = touch.clientY - startY
      const dx = touch.clientX - startX
      if (offset === 0) {
        // Wait for a clear direction before deciding what the finger is doing
        if (Math.hypot(dx, dy) < 8) return
        if (dy < 0 || Math.abs(dx) > Math.abs(dy) || viewport.scrollTop > 0) {
          // Scrolling the list or swiping a row, not pulling
          startY = finger = null
          return
        }
      }
      if (e.cancelable) e.preventDefault()
      const pulled = PULL_MAX * (1 - Math.exp(-Math.max(dy, 0) / (PULL_MAX * 1.6)))
      setPhase(pulled >= PULL_TRIGGER ? 'armed' : 'pulling')
      moveTo(pulled, false)
    }
    const onEnd = async (e: globalThis.TouchEvent) => {
      const cancelled = e.type === 'touchcancel'
      if (startY === null) {
        // Nothing tracked, yet the list is still pulled: put it back
        if (!busy && offset > 0) {
          setPhase('idle')
          moveTo(0, true)
        }
        return
      }
      if (!cancelled && !tracked(e.changedTouches)) return
      startY = finger = null
      if (cancelled || offset < PULL_TRIGGER) {
        setPhase('idle')
        moveTo(0, true)
        return
      }
      busy = true
      setPhase('refreshing')
      moveTo(PULL_HOLD, true)
      try {
        await onRefreshRef.current()
      } finally {
        busy = false
        setPhase('idle')
        moveTo(0, true)
      }
    }
    const onEndListener = (e: globalThis.TouchEvent) => void onEnd(e)
    viewport.addEventListener('touchstart', onStart, { passive: true })
    viewport.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEndListener)
    window.addEventListener('touchcancel', onEndListener)
    return () => {
      viewport.removeEventListener('touchstart', onStart)
      viewport.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEndListener)
      window.removeEventListener('touchcancel', onEndListener)
      cancelAnimationFrame(frame)
      startY = finger = null
      offset = 0
      paint(false)
      setPhase('idle')
    }
  }, [isTouch])

  const allSelected = rows.length > 0 && selected.size === rows.length

  const header =
    selected.size > 0 ? (
      <BulkActionBar
        count={selected.size}
        allSelected={allSelected}
        moveTargets={moveTargets}
        onAction={(a: BulkAction) => onAction(a, [...selected])}
        onMove={(id) => onAction({ moveTo: id }, [...selected])}
        onClear={onClearSelection}
      />
    ) : (
      <Group gap={8} wrap="nowrap" h="100%" pl={12} pr={2}>
        {!isTouch && (
          <Checkbox
            size="xs"
            mr={4}
            aria-label={t.selectAll}
            checked={false}
            disabled={!rows.length}
            onChange={(e) => onSelectAll(e.currentTarget.checked)}
          />
        )}
        <Group gap={8} align="baseline" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
          <Title order={2} size="h2" lineClamp={1}>
            {title}
          </Title>
          {subtitle && (
            <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
              {subtitle}
            </Text>
          )}
        </Group>
        {onCloseSearch ? (
          <Tooltip label={t.closeSearch}>
            <ActionIcon size="lg" aria-label={t.closeSearch} onClick={onCloseSearch}>
              <XIcon size={18} strokeWidth={1.75} />
            </ActionIcon>
          </Tooltip>
        ) : (
          <Tooltip label={t.refresh}>
            <ActionIcon size="lg" aria-label={t.refresh} onClick={() => void onRefresh()}>
              <RefreshCwIcon size={18} strokeWidth={1.75} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>
    )

  // Below the floating header, centred in what is left of the pane
  const state = (node: ReactNode) => (
    <Box pt={topInset} h={areaHeight || undefined}>
      {node}
    </Box>
  )
  let body: ReactNode
  if (status === 'pending') body = state(<ListSkeleton rowHeight={rowHeight} />)
  else if (status === 'error')
    body = state(
      <ErrorState title={unreachable ? t.serverUnreachable : t.loadError} onRetry={onRetry} />,
    )
  else if (!rows.length)
    body = state(
      <StateMessage icon={<InboxIcon size={24} strokeWidth={1.5} />} title={emptyLabel} />,
    )
  else
    body = (
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {items.map((vi) => {
          const style = {
            position: 'absolute' as const,
            top: 0,
            left: 0,
            width: '100%',
            height: vi.size,
            transform: `translateY(${vi.start}px)`,
          }
          const row = rows[vi.index]
          if (!row)
            return (
              <div key="footer" style={style} className={classes.footer} role="presentation">
                {hasNextPage ? (
                  <Group gap={8} justify="center" role="status">
                    <Loader size={14} color="gray" />
                    <Text size="sm" c="dimmed">
                      {t.loadingMore}
                    </Text>
                  </Group>
                ) : (
                  <Text size="sm" c="dimmed">
                    {endLabel}
                  </Text>
                )}
              </div>
            )
          return (
            <MessageRow
              key={`${row.folder}:${row.uid}`}
              style={style}
              row={row}
              domId={`msg-${row.uid}`}
              active={row.uid === activeUid}
              selected={selected.has(row.uid)}
              selectionMode={selected.size > 0}
              density={density}
              folderLabel={folderLabelFor?.(row)}
              highlight={highlight}
              swipeEnabled={isTouch}
              onActivate={onOpen}
              onToggleSelect={onToggleSelect}
              onToggleStar={onToggleStar}
              onContextMenu={openContextMenu}
              onSwipe={onSwipe}
            />
          )
        })}
      </div>
    )

  const menuRun = (action: RowAction) => {
    if (menu) onAction(action, menu.uids)
    setMenu(null)
  }
  const multi = (menu?.uids.length ?? 0) > 1

  return (
    <Stack gap={0} h="100%" className={classes.root}>
      <div ref={overlayRef} className={classes.overlay} style={{ top: topOffset }}>
        {/* On phones the top bar already names the folder. */}
        {(!isTouch || selected.size > 0 || onCloseSearch) && (
          <Box className={classes.header} data-scrolled={scrolled || undefined}>
            {header}
          </Box>
        )}
        {headerExtra && <Box className={classes.extra}>{headerExtra}</Box>}
      </div>

      {isTouch && (
        <Group
          ref={pullIndicatorRef}
          role="status"
          justify="center"
          gap={8}
          wrap="nowrap"
          className={classes.pull}
          style={{ top: topInset, height: PULL_HOLD }}
        >
          {pullPhase === 'refreshing' ? (
            <Loader size={14} color="gray" />
          ) : (
            <RefreshCwIcon ref={pullIconRef} size={16} strokeWidth={2} />
          )}
          <Text size="sm" c="dimmed">
            {pullPhase === 'refreshing'
              ? t.refreshing
              : pullPhase === 'armed'
                ? t.releaseToRefresh
                : t.pullToRefresh}
          </Text>
        </Group>
      )}

      <ScrollArea
        ref={areaRef}
        viewportRef={viewportRef}
        type="auto"
        scrollbars="y"
        classNames={{ viewport: classes.viewport }}
        styles={{ scrollbar: { marginTop: topInset } }}
        style={{ flex: 1, minHeight: 0, '--fade-end': `${topInset + 6}px` } as CSSProperties}
        scrollbarSize={8}
        onScrollPositionChange={({ y }) => setScrolled(y > 0)}
        viewportProps={{
          role: 'listbox',
          tabIndex: 0,
          'aria-label': title,
          'aria-multiselectable': true,
          'aria-activedescendant':
            activeUid !== null && activeIndex >= 0 ? `msg-${activeUid}` : undefined,
          'aria-busy': status === 'pending' || isFetchingNextPage,
          'aria-rowcount': total,
          onKeyDown: onListKeyDown,
        }}
      >
        <div ref={pullContentRef}>{body}</div>
      </ScrollArea>

      <Menu
        opened={!!menu}
        onChange={(o) => !o && setMenu(null)}
        position="bottom-start"
        offset={2}
        withinPortal
      >
        <Menu.Target>
          <div className={classes.menuAnchor} style={{ left: menu?.x ?? 0, top: menu?.y ?? 0 }} />
        </Menu.Target>
        <Menu.Dropdown miw={240}>
          {multi && <Menu.Label>{t.messagesCount(menu?.uids.length ?? 0)}</Menu.Label>}
          {!multi && (
            <>
              <Menu.Item onClick={() => menuRun('open')} rightSection={<KeyCombo id="open" />}>
                {t.open}
              </Menu.Item>
              <Menu.Item
                leftSection={<ReplyIcon size={16} />}
                onClick={() => menuRun('reply')}
                rightSection={<KeyCombo id="reply" />}
              >
                {t.reply}
              </Menu.Item>
              <Menu.Item
                leftSection={<ReplyAllIcon size={16} />}
                onClick={() => menuRun('replyAll')}
                rightSection={<KeyCombo id="replyAll" />}
              >
                {t.replyAll}
              </Menu.Item>
              <Menu.Item
                leftSection={<ForwardIcon size={16} />}
                onClick={() => menuRun('forward')}
                rightSection={<KeyCombo id="forward" />}
              >
                {t.forward}
              </Menu.Item>
              <Menu.Divider />
            </>
          )}
          {menu && !menu.row.seen ? (
            <Menu.Item leftSection={<MailOpenIcon size={16} />} onClick={() => menuRun('read')}>
              {t.markRead}
            </Menu.Item>
          ) : (
            <Menu.Item
              leftSection={<MailIcon size={16} />}
              onClick={() => menuRun('unread')}
              rightSection={<KeyCombo id="unread" />}
            >
              {t.markUnread}
            </Menu.Item>
          )}
          <Menu.Item
            leftSection={<StarIcon size={16} />}
            onClick={() => menuRun(menu?.row.flagged ? 'unstar' : 'star')}
            rightSection={<KeyCombo id="star" />}
          >
            {menu?.row.flagged ? t.unstar : t.star}
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item
            leftSection={<ArchiveIcon size={16} />}
            onClick={() => menuRun('archive')}
            rightSection={<KeyCombo id="archive" />}
          >
            {t.archive}
          </Menu.Item>
          <Menu.Sub>
            <Menu.Sub.Target>
              <Menu.Sub.Item leftSection={<FolderInputIcon size={16} />}>{t.moveTo}</Menu.Sub.Item>
            </Menu.Sub.Target>
            <Menu.Sub.Dropdown>
              <MoveMenuItems targets={moveTargets} onMove={(id) => menuRun({ moveTo: id })} />
            </Menu.Sub.Dropdown>
          </Menu.Sub>
          <Menu.Item leftSection={<BanIcon size={16} />} onClick={() => menuRun('junk')}>
            {t.junk}
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item
            color="red"
            leftSection={<Trash2Icon size={16} />}
            onClick={() => menuRun('delete')}
            rightSection={<KeyCombo id="delete" />}
          >
            {t.delete}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </Stack>
  )
}
