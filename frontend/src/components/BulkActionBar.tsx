import { ActionIcon, Checkbox, Divider, Group, Menu, Text } from '@mantine/core'
import {
  IconArchive,
  IconFolderShare,
  IconMail,
  IconMailOpened,
  IconStar,
  IconTrash,
  IconX,
} from '@tabler/icons-react'
import type { BulkAction } from '../types'
import { useI18n } from '../lib/i18n'
import { ShortcutTooltip } from './ShortcutTooltip'
import type { MoveTarget } from './MoveMenu'
import { MoveMenuItems } from './MoveMenu'

export type BulkActionBarProps = {
  count: number
  allSelected: boolean
  moveTargets: MoveTarget[]
  onSelectAll: (checked: boolean) => void
  onAction: (action: BulkAction) => void
  onMove: (folderId: string) => void
  onClear: () => void
}

export function BulkActionBar({
  count,
  allSelected,
  moveTargets,
  onSelectAll,
  onAction,
  onMove,
  onClear,
}: BulkActionBarProps) {
  const { t } = useI18n()
  return (
    <Group role="toolbar" aria-label={t.selected(count)} gap={2} wrap="nowrap" h="100%" px={12}>
      <Checkbox
        size="xs"
        mr={8}
        aria-label={t.selectAll}
        checked={allSelected}
        indeterminate={!allSelected}
        onChange={(e) => onSelectAll(e.currentTarget.checked)}
      />
      <Text fw={600} mr="auto" aria-live="polite" style={{ whiteSpace: 'nowrap' }}>
        {t.selected(count)}
      </Text>
      <ShortcutTooltip label={t.archive} shortcut="archive">
        <ActionIcon size="lg" aria-label={t.archive} onClick={() => onAction('archive')}>
          <IconArchive size={18} stroke={1.75} />
        </ActionIcon>
      </ShortcutTooltip>
      <ShortcutTooltip label={t.delete} shortcut="delete">
        <ActionIcon size="lg" aria-label={t.delete} onClick={() => onAction('delete')}>
          <IconTrash size={18} stroke={1.75} />
        </ActionIcon>
      </ShortcutTooltip>
      <ShortcutTooltip label={t.markRead}>
        <ActionIcon size="lg" aria-label={t.markRead} onClick={() => onAction('read')}>
          <IconMailOpened size={18} stroke={1.75} />
        </ActionIcon>
      </ShortcutTooltip>
      <ShortcutTooltip label={t.markUnread} shortcut="unread">
        <ActionIcon size="lg" aria-label={t.markUnread} onClick={() => onAction('unread')}>
          <IconMail size={18} stroke={1.75} />
        </ActionIcon>
      </ShortcutTooltip>
      <Menu position="bottom-end">
        <Menu.Target>
          <ActionIcon size="lg" aria-label={t.moveTo}>
            <IconFolderShare size={18} stroke={1.75} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <MoveMenuItems targets={moveTargets} onMove={onMove} />
        </Menu.Dropdown>
      </Menu>
      <ShortcutTooltip label={t.star} shortcut="star">
        <ActionIcon size="lg" aria-label={t.star} onClick={() => onAction('star')}>
          <IconStar size={18} stroke={1.75} />
        </ActionIcon>
      </ShortcutTooltip>
      <Divider orientation="vertical" mx={4} my={14} />
      <ShortcutTooltip label={t.clearSelection} shortcut="close">
        <ActionIcon size="lg" aria-label={t.clearSelection} onClick={onClear}>
          <IconX size={18} stroke={1.75} />
        </ActionIcon>
      </ShortcutTooltip>
    </Group>
  )
}
