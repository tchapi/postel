import { ActionIcon, Button, Checkbox, Group, Menu, Text, Tooltip } from '@mantine/core'
import {
  IconArchive,
  IconBan,
  IconFolderSymlink,
  IconMailOpened,
  IconMail,
  IconStar,
  IconTrash,
} from '@tabler/icons-react'
import { useNavigate } from '@tanstack/react-router'

import { useDeleteMessages, useFlagMessages, useMoveMessages } from '../../api/mutations'
import { useFolders } from '../../api/queries'
import { flattenFolders, folderByRole } from '../../lib/folders'

type Props = {
  folderId: string
  selected: number[]
  loaded: number
  allSelected: boolean
  onSelectAll: () => void
  onClear: () => void
}

export function BulkActionBar({
  folderId,
  selected,
  loaded,
  allSelected,
  onSelectAll,
  onClear,
}: Props) {
  const { data: folders } = useFolders()
  const navigate = useNavigate()
  const flag = useFlagMessages()
  const move = useMoveMessages()
  const remove = useDeleteMessages()

  const uids = selected
  const inTrash = folderByRole(folders, 'trash')?.id === folderId
  const archive = folderByRole(folders, 'archive')
  const junk = folderByRole(folders, 'junk')
  const trash = folderByRole(folders, 'trash')

  const done = () => {
    onClear()
    void navigate({ to: '/folders/$folderId', params: { folderId }, search: (prev) => prev })
  }

  const moveTo = (target: { id: string; name: string } | undefined, label: string) => {
    if (!target || target.id === folderId) return
    move.moveWithUndo({ folder: folderId, uids, to: target.id }, label, target.name)
    done()
  }

  const icon = (
    label: string,
    Icon: typeof IconArchive,
    run: () => void,
    disabled = false,
    color?: string,
  ) => (
    <Tooltip label={label} key={label}>
      <ActionIcon
        variant="subtle"
        color={color ?? 'gray'}
        aria-label={label}
        onClick={run}
        disabled={disabled}
      >
        <Icon size={18} stroke={1.5} />
      </ActionIcon>
    </Tooltip>
  )

  return (
    <Group
      px="sm"
      py={4}
      gap="xs"
      justify="space-between"
      wrap="nowrap"
      style={{
        borderBottom: '1px solid var(--mantine-color-default-border)',
        background: 'var(--mantine-primary-color-light)',
      }}
    >
      <Group gap="xs" wrap="nowrap">
        <Checkbox
          size="xs"
          checked={allSelected}
          indeterminate={!allSelected && selected.length > 0}
          onChange={() => (allSelected ? onClear() : onSelectAll())}
          aria-label={allSelected ? 'Clear selection' : `Select all ${loaded} loaded`}
        />
        <Text size="sm" fw={500}>
          {selected.length}
        </Text>
      </Group>
      <Group gap={2} wrap="nowrap">
        {icon(
          inTrash ? 'Delete forever' : 'Delete',
          IconTrash,
          () => {
            if (inTrash) {
              remove.mutate({ folder: folderId, uids })
              done()
            } else {
              moveTo(trash, 'Moved')
            }
          },
          false,
          inTrash ? 'red' : undefined,
        )}
        {icon(
          'Archive',
          IconArchive,
          () => moveTo(archive, 'Archived'),
          !archive || archive.id === folderId,
        )}
        {icon(
          'Junk',
          IconBan,
          () => moveTo(junk, 'Marked as junk,'),
          !junk || junk.id === folderId,
        )}
        {icon('Mark as read', IconMailOpened, () => {
          flag.mutate({ folder: folderId, uids, seen: true })
          onClear()
        })}
        {icon('Mark as unread', IconMail, () => {
          flag.mutate({ folder: folderId, uids, seen: false })
          onClear()
        })}
        {icon('Star', IconStar, () => {
          flag.mutate({ folder: folderId, uids, flagged: true })
          onClear()
        })}
        <Menu position="bottom-end" width={220}>
          <Menu.Target>
            <Tooltip label="Move to">
              <ActionIcon variant="subtle" color="gray" aria-label="Move to">
                <IconFolderSymlink size={18} stroke={1.5} />
              </ActionIcon>
            </Tooltip>
          </Menu.Target>
          <Menu.Dropdown>
            {flattenFolders(folders ?? [])
              .filter((f) => f.id !== folderId)
              .map((target) => (
                <Menu.Item key={target.id} onClick={() => moveTo(target, 'Moved')}>
                  {target.name}
                </Menu.Item>
              ))}
          </Menu.Dropdown>
        </Menu>
        <Button variant="subtle" color="gray" size="compact-xs" onClick={onClear}>
          Cancel
        </Button>
      </Group>
    </Group>
  )
}
