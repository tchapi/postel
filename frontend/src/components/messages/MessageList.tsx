import { Center, Loader, Skeleton, Stack, Text } from '@mantine/core'
import { useHotkeys } from '@mantine/hooks'
import { IconMailOff } from '@tabler/icons-react'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useMemo, useRef } from 'react'

import { useMessages } from '../../api/queries'
import { ListFilters } from './ListFilters'
import { MessageRow } from './MessageRow'

const ROW_HEIGHT = 72

type Props = {
  folderId: string
}

export function MessageList({ folderId }: Props) {
  const search = useSearch({ from: '/folders/$folderId' })
  const { data, isPending, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useMessages(
    folderId,
    search,
  )
  const { uid } = useParams({ strict: false })
  const activeUid = uid === undefined ? null : Number(uid)
  const navigate = useNavigate()
  const scrollRef = useRef<HTMLDivElement>(null)

  const rows = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data])
  const total = data?.pages[0]?.total

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
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
      'Escape',
      () =>
        void navigate({ to: '/folders/$folderId', params: { folderId }, search: (prev) => prev }),
    ],
  ])

  const filtered = !!(search.q || search.unread || search.flagged)

  let body
  if (isPending) {
    body = (
      <Stack gap={0}>
        {Array.from({ length: 12 }, (_, i) => (
          <Skeleton key={i} height={ROW_HEIGHT - 16} m={8} />
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
                <MessageRow row={row} active={row.uid === activeUid} onOpen={() => open(row.uid)} />
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
      <ListFilters folderId={folderId} total={total} />
      <div style={{ flex: 1, minHeight: 0 }}>{body}</div>
    </Stack>
  )
}
