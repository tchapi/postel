import type { ReactNode } from 'react'
import { ActionIcon, Checkbox, Group, Menu, Text } from '@mantine/core'
import { useElementSize } from '@mantine/hooks'
import {
  ArchiveIcon,
  EllipsisIcon,
  FolderInputIcon,
  MailIcon,
  MailOpenIcon,
  StarIcon,
  Trash2Icon,
} from 'lucide-react'
import type { BulkAction } from '../types'
import { useI18n } from '../lib/i18n'
import type { ShortcutId } from '../lib/shortcuts'
import { ShortcutTooltip } from './ShortcutTooltip'
import type { MoveTarget } from './MoveMenu'
import { MoveMenuItems } from './MoveMenu'

export type BulkActionBarProps = {
  count: number
  allSelected: boolean
  moveTargets: MoveTarget[]
  onAction: (action: BulkAction) => void
  onMove: (folderId: string) => void
  onClear: () => void
}

type Item = {
  key: string
  label: string
  icon: ReactNode
  shortcut?: ShortcutId
  action?: BulkAction
}

// An `lg` ActionIcon plus the group gap
const BUTTON_WIDTH = 36
// Inline padding, checkbox and its margin, the label's margin
const FIXED_WIDTH = 24 + 24 + 8

export function BulkActionBar({
  count,
  allSelected,
  moveTargets,
  onAction,
  onMove,
  onClear,
}: BulkActionBarProps) {
  const { t } = useI18n()
  const { ref: barRef, width: barWidth } = useElementSize()
  const { ref: labelRef, width: labelWidth } = useElementSize()

  const icon = (Icon: typeof ArchiveIcon) => <Icon size={18} strokeWidth={1.75} />
  const items: Item[] = [
    {
      key: 'archive',
      label: t.archive,
      icon: icon(ArchiveIcon),
      shortcut: 'archive',
      action: 'archive',
    },
    {
      key: 'delete',
      label: t.delete,
      icon: icon(Trash2Icon),
      shortcut: 'delete',
      action: 'delete',
    },
    { key: 'read', label: t.markRead, icon: icon(MailOpenIcon), action: 'read' },
    {
      key: 'unread',
      label: t.markUnread,
      icon: icon(MailIcon),
      shortcut: 'unread',
      action: 'unread',
    },
    { key: 'move', label: t.moveTo, icon: icon(FolderInputIcon) },
    { key: 'star', label: t.star, icon: icon(StarIcon), shortcut: 'star', action: 'star' },
  ]

  // The label always shows in full: the actions that don't fit after it go, from the right, into a More menu
  const room = Math.floor((barWidth - FIXED_WIDTH - labelWidth) / BUTTON_WIDTH)
  const shown = barWidth === 0 || room >= items.length ? items.length : Math.max(0, room - 1)
  const visible = items.slice(0, shown)
  const overflow = items.slice(shown)

  const button = (item: Item) =>
    item.action ? (
      <ShortcutTooltip key={item.key} label={item.label} shortcut={item.shortcut}>
        <ActionIcon size="lg" aria-label={item.label} onClick={() => onAction(item.action!)}>
          {item.icon}
        </ActionIcon>
      </ShortcutTooltip>
    ) : (
      <Menu key={item.key} position="bottom-end">
        <Menu.Target>
          <ActionIcon size="lg" aria-label={item.label}>
            {item.icon}
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <MoveMenuItems targets={moveTargets} onMove={onMove} />
        </Menu.Dropdown>
      </Menu>
    )

  const menuItem = (item: Item) =>
    item.action ? (
      <Menu.Item key={item.key} leftSection={item.icon} onClick={() => onAction(item.action!)}>
        {item.label}
      </Menu.Item>
    ) : (
      <Menu.Sub key={item.key}>
        <Menu.Sub.Target>
          <Menu.Sub.Item leftSection={item.icon}>{item.label}</Menu.Sub.Item>
        </Menu.Sub.Target>
        <Menu.Sub.Dropdown>
          <MoveMenuItems targets={moveTargets} onMove={onMove} />
        </Menu.Sub.Dropdown>
      </Menu.Sub>
    )

  return (
    <Group
      ref={barRef}
      role="toolbar"
      aria-label={t.selected(count)}
      gap={2}
      wrap="nowrap"
      h="100%"
      px={12}
    >
      {/* No clear button, it doesn't fit a narrow list: the checkbox clears the selection */}
      <Checkbox
        size="xs"
        mr={8}
        aria-label={t.clearSelection}
        checked={allSelected}
        indeterminate={!allSelected}
        onChange={onClear}
      />
      <Text fw={600} aria-live="polite" style={{ whiteSpace: 'nowrap' }} ref={labelRef}>
        {t.selected(count)}
      </Text>
      <span style={{ flex: 1 }} />
      {visible.map(button)}
      {overflow.length > 0 && (
        <Menu position="bottom-end">
          <Menu.Target>
            <ActionIcon size="lg" aria-label={t.moreActions}>
              {icon(EllipsisIcon)}
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>{overflow.map(menuItem)}</Menu.Dropdown>
        </Menu>
      )}
    </Group>
  )
}
