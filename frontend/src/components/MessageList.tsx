import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type TouchEvent,
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

const PULL_TRIGGER = 64

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
  } = props
  const { t } = useI18n()
  const viewportRef = useRef<HTMLDivElement>(null)
  const [scrolled, setScrolled] = useState(false)
  // The header floats over the list: rows start below it and scroll under it
  const { ref: overlayRef, height: overlayHeight } = useElementSize()
  const topInset = topOffset + overlayHeight
  const rowHeight = ROW_HEIGHT[density]
  const [menu, setMenu] = useState<ContextMenuState>(null)
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const pullStart = useRef<number | null>(null)

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

  // Pull to refresh (touch only, list scrolled to top).
  const onTouchStart = (e: TouchEvent) => {
    if (!isTouch || refreshing) return
    pullStart.current =
      (viewportRef.current?.scrollTop ?? 1) === 0 ? (e.touches[0]?.clientY ?? null) : null
  }
  const onTouchMove = (e: TouchEvent) => {
    if (pullStart.current === null) return
    const dy = (e.touches[0]?.clientY ?? 0) - pullStart.current
    setPull(dy > 0 ? Math.min(dy * 0.5, 96) : 0)
  }
  const onTouchEnd = async () => {
    const trigger = pull >= PULL_TRIGGER
    pullStart.current = null
    setPull(0)
    if (!trigger) return
    setRefreshing(true)
    try {
      await onRefresh()
    } finally {
      setRefreshing(false)
    }
  }

  const allSelected = rows.length > 0 && selected.size === rows.length

  const header =
    selected.size > 0 ? (
      <BulkActionBar
        count={selected.size}
        allSelected={allSelected}
        moveTargets={moveTargets}
        onSelectAll={onSelectAll}
        onAction={(a: BulkAction) => onAction(a, [...selected])}
        onMove={(id) => onAction({ moveTo: id }, [...selected])}
        onClear={onClearSelection}
      />
    ) : (
      <Group gap={8} wrap="nowrap" h="100%" pl={6} pr={2}>
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

  let body: ReactNode
  if (status === 'pending') body = <ListSkeleton rowHeight={rowHeight} />
  else if (status === 'error') body = <ErrorState title={t.loadError} onRetry={onRetry} />
  else if (!rows.length)
    body = <StateMessage icon={<InboxIcon size={24} strokeWidth={1.5} />} title={emptyLabel} />
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

      {(pull > 0 || refreshing) && (
        <Group
          role="status"
          justify="center"
          gap={8}
          className={classes.pull}
          style={{ height: refreshing ? 44 : pull, marginTop: topInset }}
        >
          {refreshing ? (
            <Loader size={14} color="gray" />
          ) : (
            <RefreshCwIcon size={16} strokeWidth={2} />
          )}
          <Text size="sm" c="dimmed">
            {pull >= PULL_TRIGGER || refreshing ? t.releaseToRefresh : t.pullToRefresh}
          </Text>
        </Group>
      )}

      <ScrollArea
        viewportRef={viewportRef}
        type="auto"
        scrollbars="y"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={() => void onTouchEnd()}
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
        {body}
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
