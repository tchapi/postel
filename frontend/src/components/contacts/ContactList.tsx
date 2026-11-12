import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react'
import {
  ActionIcon,
  Box,
  Button,
  CloseButton,
  Group,
  Kbd,
  Loader,
  Menu,
  ScrollArea,
  Text,
  TextInput,
  Title,
  Tooltip,
} from '@mantine/core'
import { useElementSize } from '@mantine/hooks'
import { defaultRangeExtractor, useVirtualizer, type Range } from '@tanstack/react-virtual'
import {
  ArrowLeftIcon,
  BookUserIcon,
  CheckIcon,
  ChevronDownIcon,
  CloudOffIcon,
  DownloadIcon,
  EllipsisIcon,
  RefreshCwIcon,
  SearchIcon,
  SearchXIcon,
  UploadIcon,
  UserPlusIcon,
} from 'lucide-react'
import type { AddressBook, ContactSummary, Density } from '../../types'
import { withLetters } from '../../lib/addressBook'
import { useI18n } from '../../lib/i18n'
import { ErrorState, ListSkeleton, StateMessage } from '../States'
import { ContactRow, CONTACT_ROW_HEIGHT } from './ContactRow'
import classes from './ContactList.module.css'

const LETTER_HEIGHT = 30

export type ContactListProps = {
  /** The cards to show: already narrowed to the picked book and the filter. */
  cards: ContactSummary[]
  /** How many cards the picked book holds, before the filter. */
  total: number
  status: 'pending' | 'error' | 'success'
  onRetry: () => void
  /** The backend does not answer at all. */
  unreachable?: boolean
  /** The address book could not be reached: this is the last copy. */
  stale: boolean
  books: AddressBook[]
  /** A book's id, or `all`. */
  bookId: string
  onBookChange: (bookId: string) => void
  filter: string
  onFilterChange: (value: string) => void
  filterRef?: Ref<HTMLInputElement>
  activeId: string | null
  density: Density
  isMobile: boolean
  photoUrl: (card: ContactSummary) => string | undefined
  downloadUrl: string
  /** Omit when nothing can be written (the backend is away). */
  onNew?: () => void
  onImport?: () => void
  onRefresh: () => Promise<unknown>
  /** Click, or arrows in the list */
  onActivate: (id: string) => void
  /** Enter, or a click on a phone */
  onOpen: (id: string) => void
  /** Phones: back to mail */
  onBack?: () => void
}

export function ContactList(props: ContactListProps) {
  const {
    cards,
    total,
    status,
    onRetry,
    unreachable,
    stale,
    books,
    bookId,
    onBookChange,
    filter,
    onFilterChange,
    filterRef,
    activeId,
    density,
    isMobile,
    photoUrl,
    downloadUrl,
    onNew,
    onImport,
    onRefresh,
    onActivate,
    onOpen,
    onBack,
  } = props
  const { t, locale } = useI18n()
  const viewportRef = useRef<HTMLDivElement>(null)
  const [scrolled, setScrolled] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  // The header floats over the list: rows start below it and scroll under it
  const { ref: overlayRef, height: overlayHeight } = useElementSize()
  const { ref: areaRef, height: areaHeight } = useElementSize()
  const topInset = overlayHeight
  const rowHeight = CONTACT_ROW_HEIGHT[density]

  const entries = useMemo(() => withLetters(cards), [cards])
  const letterIndexes = useMemo(
    () => entries.flatMap((entry, i) => (entry.kind === 'letter' ? [i] : [])),
    [entries],
  )
  // Where each entry starts: every size is known, so no measuring is needed
  const starts = useMemo(() => {
    let at = topInset + 6
    return entries.map((entry) => {
      const start = at
      at += entry.kind === 'letter' ? LETTER_HEIGHT : rowHeight
      return start
    })
  }, [entries, rowHeight, topInset])
  // The heading of the section just under the floating header stays pinned there
  const pinned = useRef(0)
  const rangeExtractor = useCallback(
    (range: Range) => {
      const top = (viewportRef.current?.scrollTop ?? 0) + topInset + 6
      pinned.current = [...letterIndexes].reverse().find((i) => (starts[i] ?? 0) <= top) ?? 0
      return [...new Set([pinned.current, ...defaultRangeExtractor(range)])].sort((a, b) => a - b)
    },
    [letterIndexes, starts, topInset],
  )

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => viewportRef.current,
    estimateSize: (i) => (entries[i]?.kind === 'letter' ? LETTER_HEIGHT : rowHeight),
    overscan: 10,
    paddingStart: topInset + 6,
    paddingEnd: 12,
    rangeExtractor,
  })

  useEffect(() => {
    virtualizer.measure()
  }, [rowHeight, entries, virtualizer])

  // Keep the keyboard cursor in view (and rendered, so aria-activedescendant resolves)
  const activeEntry =
    activeId === null ? -1 : entries.findIndex((e) => e.kind === 'card' && e.card.id === activeId)
  useEffect(() => {
    if (activeEntry >= 0) virtualizer.scrollToIndex(activeEntry, { align: 'auto' })
  }, [activeEntry, virtualizer])

  const activeIndex = activeId === null ? -1 : cards.findIndex((c) => c.id === activeId)
  const onListKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!cards.length) return
    const go = (i: number) => {
      e.preventDefault()
      const card = cards[Math.min(Math.max(i, 0), cards.length - 1)]
      if (card) onActivate(card.id)
    }
    switch (e.key) {
      case 'ArrowDown':
        return go(activeIndex < 0 ? 0 : activeIndex + 1)
      case 'ArrowUp':
        return go(Math.max(activeIndex, 0) - 1)
      case 'Home':
        return go(0)
      case 'End':
        return go(cards.length - 1)
      case 'Enter':
        if (activeId !== null) {
          e.preventDefault()
          onOpen(activeId)
        }
        return
    }
  }

  const refresh = () => {
    setRefreshing(true)
    void onRefresh().finally(() => setRefreshing(false))
  }

  const several = books.length > 1
  const bookName =
    bookId === 'all' ? t.contact.allBooks : (books.find((b) => b.id === bookId)?.name ?? '')
  const count = new Intl.NumberFormat(locale).format(total)

  const bookPicker = several && (
    <Menu position="bottom-end">
      <Menu.Target>
        <Button
          variant="subtle"
          color="gray"
          size="compact-sm"
          className={classes.picker}
          aria-label={`${t.contact.bookPicker}: ${bookName}`}
          rightSection={<ChevronDownIcon size={14} strokeWidth={2} />}
        >
          <span className={classes.pickerLabel}>{bookName}</span>
        </Button>
      </Menu.Target>
      <Menu.Dropdown miw={220}>
        <Menu.Label>{t.contact.bookPicker}</Menu.Label>
        {[{ id: 'all', name: t.contact.allBooks }, ...books].map((book) => (
          <Menu.Item
            key={book.id}
            role="menuitemradio"
            aria-checked={book.id === bookId}
            onClick={() => onBookChange(book.id)}
            rightSection={book.id === bookId ? <CheckIcon size={14} strokeWidth={2} /> : null}
          >
            {book.name}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  )

  const moreMenu = (
    <Menu position="bottom-end">
      <Menu.Target>
        <ActionIcon size={isMobile ? 44 : 'lg'} aria-label={t.moreActions}>
          <EllipsisIcon size={18} strokeWidth={2} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown miw={240}>
        {onImport && (
          <Menu.Item leftSection={<UploadIcon size={16} />} onClick={onImport}>
            {t.contact.import}
          </Menu.Item>
        )}
        <Menu.Item
          component="a"
          href={downloadUrl}
          leftSection={<DownloadIcon size={16} />}
          disabled={status !== 'success'}
        >
          {several && bookId === 'all' ? t.contact.downloadAll : t.contact.downloadBook}
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item
          leftSection={refreshing ? <Loader size={14} color="gray" /> : <RefreshCwIcon size={16} />}
          onClick={refresh}
          closeMenuOnClick={false}
          disabled={refreshing}
        >
          {refreshing ? t.refreshing : t.refresh}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  )

  const header = (
    <Box className={classes.header} data-scrolled={scrolled || undefined}>
      <Group
        gap={isMobile ? 4 : 8}
        wrap="nowrap"
        h={isMobile ? 48 : 44}
        pl={isMobile ? 0 : 12}
        pr={2}
      >
        {onBack && (
          <ActionIcon size={44} aria-label={t.back} onClick={onBack}>
            <ArrowLeftIcon size={22} strokeWidth={1.75} />
          </ActionIcon>
        )}
        <Group gap={8} align="baseline" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
          <Title order={2} size="h2" lineClamp={1}>
            {t.contact.title}
          </Title>
          {status === 'success' && (
            <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
              {count}
            </Text>
          )}
        </Group>
        {onNew && (
          <Tooltip label={t.contact.newContact}>
            <ActionIcon
              size={isMobile ? 44 : 'lg'}
              aria-label={t.contact.newContact}
              onClick={onNew}
            >
              <UserPlusIcon size={isMobile ? 21 : 18} strokeWidth={isMobile ? 1.75 : 2} />
            </ActionIcon>
          </Tooltip>
        )}
        {moreMenu}
      </Group>
      <Group gap={6} wrap="nowrap" px={8} pb={8}>
        <TextInput
          ref={filterRef}
          size="sm"
          style={{ flex: 1, minWidth: 0 }}
          classNames={{ input: classes.filter }}
          placeholder={t.contact.filterShort}
          aria-label={t.contact.filter}
          value={filter}
          onChange={(e) => onFilterChange(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && filter) {
              e.stopPropagation()
              onFilterChange('')
            }
            // Down from the field goes to the list, like a search box with results
            if (e.key === 'ArrowDown' && cards[0]) {
              e.preventDefault()
              viewportRef.current?.focus()
              if (activeIndex < 0) onActivate(cards[0].id)
            }
          }}
          leftSection={<SearchIcon size={15} strokeWidth={1.75} />}
          rightSection={
            filter ? (
              <CloseButton
                size="sm"
                aria-label={t.contact.clearFilter}
                onClick={() => onFilterChange('')}
              />
            ) : isMobile ? null : (
              <Kbd size="xs">/</Kbd>
            )
          }
        />
        {bookPicker}
      </Group>
      {stale && (
        <Group gap={6} wrap="nowrap" px={12} pb={8} role="status" className={classes.stale}>
          <CloudOffIcon size={14} strokeWidth={2} style={{ flex: 'none' }} />
          <Text size="xs" c="dimmed" truncate>
            {t.contact.stale}
          </Text>
        </Group>
      )}
    </Box>
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
      <ErrorState
        title={unreachable ? t.serverUnreachable : t.contact.loadError}
        onRetry={onRetry}
      />,
    )
  else if (!cards.length)
    body = state(
      filter.trim() ? (
        <StateMessage
          icon={<SearchXIcon size={24} strokeWidth={1.5} />}
          title={t.contact.noMatch}
        />
      ) : (
        <StateMessage icon={<BookUserIcon size={24} strokeWidth={1.5} />} title={t.contact.empty}>
          <Text size="sm">{t.contact.emptyHint}</Text>
          {onNew && (
            <Button
              variant="default"
              size="xs"
              leftSection={<UserPlusIcon size={15} strokeWidth={1.75} />}
              onClick={onNew}
            >
              {t.contact.newContact}
            </Button>
          )}
        </StateMessage>
      ),
    )
  else
    body = (
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map((vi) => {
          const entry = entries[vi.index]
          if (!entry) return null
          if (entry.kind === 'letter') {
            const isPinned = vi.index === pinned.current
            return (
              <div
                key={`letter-${entry.letter}`}
                role="presentation"
                aria-hidden
                className={classes.letter}
                data-pinned={isPinned || undefined}
                style={
                  isPinned
                    ? { position: 'sticky', top: topInset + 6, height: vi.size }
                    : {
                        position: 'absolute',
                        top: 0,
                        transform: `translateY(${vi.start}px)`,
                        height: vi.size,
                      }
                }
              >
                {entry.letter}
              </div>
            )
          }
          const { card } = entry
          return (
            <ContactRow
              key={card.id}
              card={card}
              domId={`contact-${card.id}`}
              active={card.id === activeId}
              density={density}
              photoUrl={photoUrl(card)}
              onActivate={isMobile ? onOpen : onActivate}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: vi.size,
                transform: `translateY(${vi.start}px)`,
              }}
            />
          )
        })}
      </div>
    )

  return (
    <div className={classes.root}>
      <div ref={overlayRef} className={classes.overlay}>
        {header}
      </div>
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
          'aria-label': t.contact.title,
          'aria-activedescendant':
            activeId !== null && activeIndex >= 0 ? `contact-${activeId}` : undefined,
          'aria-busy': status === 'pending',
          onKeyDown: onListKeyDown,
        }}
      >
        {body}
      </ScrollArea>
    </div>
  )
}
