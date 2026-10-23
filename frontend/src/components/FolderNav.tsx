import type React from 'react'
import {
  ActionIcon,
  Badge,
  Button,
  Indicator,
  Kbd,
  NavLink,
  ScrollArea,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
  Group,
  useMantineTheme,
} from '@mantine/core'
import {
  IconArchive,
  IconBan,
  IconFileText,
  IconFolder,
  IconInbox,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconPencil,
  IconSend,
  IconTrash,
} from '@tabler/icons-react'
import type { Folder, FolderRole } from '../types'
import { useI18n } from '../lib/i18n'
import { ErrorState, FolderNavSkeleton } from './States'
import { SHORTCUTS, keyLabel } from '../lib/shortcuts'
import { ShortcutTooltip } from './ShortcutTooltip'
import classes from './FolderNav.module.css'

const ROLE_ORDER: FolderRole[] = ['inbox', 'drafts', 'sent', 'junk', 'trash', 'archive']
const ROLE_ICON = {
  inbox: IconInbox,
  drafts: IconFileText,
  sent: IconSend,
  junk: IconBan,
  trash: IconTrash,
  archive: IconArchive,
} as const

export function sortFolders(folders: Folder[]): { system: Folder[]; custom: Folder[] } {
  const system = ROLE_ORDER.map((r) => folders.find((f) => f.role === r)).filter(
    (f): f is Folder => !!f,
  )
  const custom = folders.filter((f) => !f.role).sort((a, b) => a.name.localeCompare(b.name))
  return { system, custom }
}

export function useFolderLabel() {
  const { t } = useI18n()
  return (f: Folder) => (f.role ? t.folderRole[f.role] : f.name)
}

/** Drafts show their total, every other folder its unread count. */
function badgeCount(f: Folder): number {
  return f.role === 'drafts' ? f.total : f.unread
}

export type FolderNavProps = {
  folders: Folder[] | undefined
  status: 'pending' | 'error' | 'success'
  onRetry: () => void
  activeId: string | null
  /** Desktop rail mode: icons only. */
  collapsed: boolean
  onSelect: (folderId: string) => void
  /** Omit to hide the collapse toggle (drawer usage). */
  onToggleCollapsed?: () => void
  /** Desktop: primary Compose action at the top of the sidebar. Omit where Compose lives elsewhere (header, FAB). */
  onCompose?: () => void
}

export function FolderNav({
  folders,
  status,
  onRetry,
  activeId,
  collapsed,
  onSelect,
  onToggleCollapsed,
  onCompose,
}: FolderNavProps) {
  const { t } = useI18n()
  const label = useFolderLabel()
  // ActionIcon defaults to gray in the theme, so accent-coloured icons must name the primary colour explicitly.
  const { primaryColor } = useMantineTheme()

  // Rendered above the loading and error states too, so composing never waits on the folder list.
  const compose = onCompose ? (
    collapsed ? (
      <Group justify="flex-start" px={10} pt={10} pb={4}>
        <ShortcutTooltip label={t.compose} shortcut="compose" position="right">
          <ActionIcon
            size={40}
            radius={12}
            variant="filled"
            color={primaryColor}
            aria-label={t.compose}
            onClick={onCompose}
          >
            <IconPencil size={18} stroke={1.75} />
          </ActionIcon>
        </ShortcutTooltip>
      </Group>
    ) : (
      <Button
        radius={12}
        h={40}
        mx="xs"
        mt={10}
        mb={4}
        justify="space-between"
        leftSection={<IconPencil size={18} stroke={1.75} />}
        rightSection={
          <Kbd size="xs" className={classes.composeKbd} aria-hidden>
            {SHORTCUTS.compose.keys.map(keyLabel).join(' ')}
          </Kbd>
        }
        onClick={onCompose}
        classNames={{ label: classes.composeLabel }}
      >
        {t.compose}
      </Button>
    )
  ) : null

  if (status === 'pending')
    return (
      <Stack gap={0} h="100%" className={classes.root}>
        {compose}
        <FolderNavSkeleton collapsed={collapsed} />
      </Stack>
    )
  if (status === 'error' || !folders)
    return (
      <Stack gap={0} h="100%" className={classes.root}>
        {compose}
        <ErrorState compact title={collapsed ? '' : t.foldersUnavailable} onRetry={onRetry} />
      </Stack>
    )

  const { system, custom } = sortFolders(folders)

  const renderLink = (f: Folder): React.ReactNode => {
    const Icon = f.role ? ROLE_ICON[f.role] : IconFolder
    const count = badgeCount(f)
    const active = f.id === activeId

    if (collapsed) {
      return (
        <Tooltip key={f.id} label={count ? `${label(f)} · ${count}` : label(f)} position="right">
          <Indicator
            label={count > 99 ? '99+' : count}
            disabled={!count}
            size={16}
            offset={6}
            color={active || f.role === 'inbox' ? undefined : 'gray'}
            classNames={{ indicator: classes.railBadge }}
          >
            <ActionIcon
              size={40}
              variant={active ? 'light' : 'subtle'}
              color={active ? primaryColor : 'gray'}
              aria-label={count ? `${label(f)}, ${count}` : label(f)}
              aria-current={active ? 'page' : undefined}
              onClick={() => onSelect(f.id)}
            >
              <Icon size={20} stroke={1.75} />
            </ActionIcon>
          </Indicator>
        </Tooltip>
      )
    }

    return (
      <NavLink
        key={f.id}
        component="button"
        type="button"
        active={active}
        aria-current={active ? 'page' : undefined}
        label={label(f)}
        fw={active || (f.unread && f.role !== 'drafts' && f.role !== 'sent') ? 600 : 400}
        leftSection={<Icon size={18} stroke={1.75} />}
        rightSection={
          f.role === 'inbox' && f.unread ? (
            // The Inbox pill replaces the old header "N unread" badge as the app-wide unread signal.
            <Badge
              size="sm"
              radius="xl"
              variant="filled"
              miw={22}
              px={6}
              aria-label={t.unreadBadge(f.unread)}
            >
              {f.unread > 999 ? '999+' : f.unread}
            </Badge>
          ) : count ? (
            <Text
              span
              size="xs"
              fw={f.unread && f.role !== 'drafts' ? 600 : 400}
              c={active ? undefined : f.unread ? undefined : 'dimmed'}
            >
              {count}
            </Text>
          ) : undefined
        }
        onClick={() => onSelect(f.id)}
        defaultOpened={!!f.children?.length}
        disableRightSectionRotation={count > 0}
        childrenOffset={28}
        className={classes.link}
      >
        {f.children?.length ? f.children.map((c) => renderLink(c)) : undefined}
      </NavLink>
    )
  }

  return (
    <Stack gap={0} h="100%" className={classes.root} data-collapsed={collapsed || undefined}>
      {compose}
      <ScrollArea style={{ flex: 1 }} type="hover" scrollbars="y">
        <Stack
          gap={2}
          p={collapsed ? 10 : 'xs'}
          align={collapsed ? 'flex-start' : 'stretch'}
          component="nav"
          aria-label={t.folders}
        >
          {system.map((f) => renderLink(f))}
          {custom.length > 0 &&
            (collapsed ? (
              <div className={classes.railDivider} />
            ) : (
              <Text
                size="xs"
                fw={700}
                tt="uppercase"
                c="dimmed"
                px={10}
                pt={14}
                pb={6}
                className={classes.sectionLabel}
              >
                {t.folders}
              </Text>
            ))}
          {custom.map((f) => renderLink(f))}
        </Stack>
      </ScrollArea>
      {onToggleCollapsed &&
        (collapsed ? (
          <Group justify="flex-start" p={10}>
            <Tooltip label={t.expandFolders} position="right">
              <ActionIcon size={40} aria-label={t.expandFolders} onClick={onToggleCollapsed}>
                <IconLayoutSidebarLeftExpand size={20} stroke={1.75} />
              </ActionIcon>
            </Tooltip>
          </Group>
        ) : (
          <UnstyledButton
            className={classes.collapse}
            onClick={onToggleCollapsed}
            aria-label={t.collapseFolders}
          >
            <IconLayoutSidebarLeftCollapse size={18} stroke={1.75} />
            <span>{t.collapse}</span>
          </UnstyledButton>
        ))}
    </Stack>
  )
}
