import { Chip, Group, Text } from '@mantine/core'
import { useNavigate, useSearch } from '@tanstack/react-router'

import type { FolderSearch } from '../../router'

type Props = {
  folderId: string
  total: number | undefined
}

export function ListFilters({ folderId, total }: Props) {
  const search = useSearch({ from: '/folders/$folderId' })
  const navigate = useNavigate()

  const toggle = (key: keyof FolderSearch) =>
    void navigate({
      to: '/folders/$folderId',
      params: { folderId },
      search: (prev: FolderSearch) => ({ ...prev, [key]: prev[key] ? undefined : true }),
    })

  return (
    <Group
      px="sm"
      py={6}
      gap="xs"
      justify="space-between"
      style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
    >
      <Group gap={6}>
        <Chip size="xs" checked={!!search.unread} onChange={() => toggle('unread')}>
          Unread
        </Chip>
        <Chip size="xs" checked={!!search.flagged} onChange={() => toggle('flagged')}>
          Starred
        </Chip>
      </Group>
      <Text size="xs" c="dimmed">
        {total === undefined ? '' : search.q ? `${total} results` : `${total}`}
      </Text>
    </Group>
  )
}
