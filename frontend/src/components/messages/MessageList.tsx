import { Center, Loader, Skeleton, Stack, Text } from '@mantine/core'
import { useHotkeys } from '@mantine/hooks'
import { IconMailOff } from '@tabler/icons-react'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useMemo, useRef, useState } from 'react'

import { useMessages } from '../../api/queries'
import { useSettings } from '../../api/settings'
import { BulkActionBar } from './BulkActionBar'
import { ListFilters } from './ListFilters'
import { MessageRow } from './MessageRow'

const ROW_HEIGHTS = { comfortable: 72, compact: 56 }

type Props = {
  folderId: string
}

export function MessageList({ folderId }: Props) {
  const search = useSearch({ from: '/folders/$folderId' })
  const { data: settings } = useSettings()
  const threads = settings?.threads ?? true
  const { data, isPending, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useMessages(
    folderId,
    { ...search, threads },
  )
  const { uid } = useParams({ strict: false })
  const activeUid = uid === undefined ? null : Number(uid)
  const navigate = useNavigate()
  const scrollRef = useRef<HTMLDivElement>(null)
  const rowHeight = ROW_HEIGHTS[settings?.density ?? 'comfortable']

  const rows = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data])
  const total = data?.pages[0]?.total

  // Selection is per folder and only over rows that are loaded
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [lastToggled, setLastToggled] = useState<number | null>(null)
  const [selectionFolder, setSelectionFolder] = useState(folderId)
  if (selectionFolder !== folderId) {
    setSelectionFolder(folderId)
    setSelected(new Set())
    setLastToggled(null)
  }
  const clearSelection = () => {
    setSelected(new Set())
    setLastToggled(null)
  }

  const toggle = (index: number, shift: boolean) => {
    const next = new Set(selected)
    const target = rows[index]!
    const on = !next.has(target.uid)
    const apply = (rowUid: number) => (on ? next.add(rowUid) : next.delete(rowUid))
    if (shift && lastToggled !== null) {
      const [from, to] = [Math.min(lastToggled, index), Math.max(lastToggled, index)]
      for (let i = from; i <= to; i++) {
        const row = rows[i]
        if (row) apply(row.uid)
      }
    } else {
      apply(target.uid)
    }
    setSelected(next)
    setLastToggled(index)
  }

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 10,
  })

  const items = virtualizer.getVirtualItems()
  const lastIndex = items.at(-1)?.index ?? -1
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && lastIndex >= rows.length - 10) {
      void fetchNextPage()
    }
  }, [lastIndex, rows.length, hasNextPage, isFetchingNextPage, fetchNextPage])

  const open = (messageUid: number) =>
    void navigate({
      to: '/folders/$folderId/$uid',
      params: { folderId, uid: String(messageUid) },
      search: (prev) => prev,
    })

  const move = (delta: number) => {
    if (rows.length === 0) return
    const index = rows.findIndex((row) => row.uid === activeUid)
    const next = index === -1 ? 0 : Math.min(rows.length - 1, Math.max(0, index + delta))
    virtualizer.scrollToIndex(next, { align: 'auto' })
    open(rows[next]!.uid)
  }

  useHotkeys([
    ['j', () => move(1)],
    ['k', () => move(-1)],
    [
      'x',
      () => {
        const index = rows.findIndex((row) => row.uid === activeUid)
        if (index !== -1) toggle(index, false)
      },
    ],
    [
      'Escape',
      () => {
        if (selected.size > 0) {
          clearSelection()
          return
        }
        void navigate({ to: '/folders/$folderId', params: { folderId }, search: (prev) => prev })
      },
    ],
  ])

  const filtered = !!(search.q || search.unread || search.flagged)
  const selecting = selected.size > 0

  let body
  if (isPending) {
    body = (
      <Stack gap={0}>
        {Array.from({ length: 12 }, (_, i) => (
          <Skeleton key={i} height={rowHeight - 16} m={8} />
        ))}
      </Stack>
    )
  } else if (isError) {
    body = (
      <Center h="100%">
        <Text c="dimmed" size="sm">
          Could not load this folder.
        </Text>
      </Center>
    )
  } else if (rows.length === 0) {
    body = (
      <Center h="100%">
        <Stack align="center" gap="xs">
          <IconMailOff size={28} stroke={1.5} color="var(--mantine-color-dimmed)" />
          <Text c="dimmed" size="sm">
            {filtered ? 'No message matches' : 'Nothing here'}
          </Text>
        </Stack>
      </Center>
    )
  } else {
    body = (
      <div
        ref={scrollRef}
        style={{ height: '100%', overflowY: 'auto' }}
        role="list"
        aria-label={`${total ?? rows.length} messages`}
      >
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {items.map((item) => {
            const row = rows[item.index]!
            return (
              <div
                key={row.uid}
                role="listitem"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: item.size,
                  transform: `translateY(${item.start}px)`,
                }}
              >
                <MessageRow
                  row={row}
                  active={row.uid === activeUid}
                  selected={selected.has(row.uid)}
                  selecting={selecting}
                  compact={rowHeight === ROW_HEIGHTS.compact}
                  onOpen={() => open(row.uid)}
                  onToggle={(shift) => toggle(item.index, shift)}
                />
              </div>
            )
          })}
        </div>
        {isFetchingNextPage && (
          <Center p="sm">
            <Loader size="xs" />
          </Center>
        )}
      </div>
    )
  }

  return (
    <Stack gap={0} h="100%">
      {selecting ? (
        <BulkActionBar
          folderId={folderId}
          selected={rows
            .filter((row) => selected.has(row.uid))
            .flatMap((row) => (row.threadUids.length ? row.threadUids : [row.uid]))}
          count={selected.size}
          loaded={rows.length}
          allSelected={selected.size === rows.length}
          onSelectAll={() => setSelected(new Set(rows.map((row) => row.uid)))}
          onClear={clearSelection}
        />
      ) : (
        <ListFilters folderId={folderId} total={total} />
      )}
      <div style={{ flex: 1, minHeight: 0 }}>{body}</div>
    </Stack>
  )
}
