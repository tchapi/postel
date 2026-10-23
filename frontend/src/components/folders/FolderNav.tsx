import {
  Badge,
  Indicator,
  NavLink,
  type NavLinkProps,
  Skeleton,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core'
import {
  IconArchive,
  IconBan,
  IconFolder,
  IconInbox,
  IconPencil,
  IconSend,
  IconTrash,
} from '@tabler/icons-react'
import { createLink, useParams } from '@tanstack/react-router'
import { type ComponentPropsWithoutRef, forwardRef } from 'react'

import { useFolders } from '../../api/queries'
import type { Folder, FolderRole } from '../../api/types'
import { flattenFolders } from '../../lib/folders'

const roleIcons: Record<FolderRole, typeof IconFolder> = {
  inbox: IconInbox,
  drafts: IconPencil,
  sent: IconSend,
  junk: IconBan,
  trash: IconTrash,
  archive: IconArchive,
}

// A Mantine NavLink that the router knows how to navigate with, typed routes included.
const RouterNavLink = createLink(
  forwardRef<HTMLAnchorElement, NavLinkProps & ComponentPropsWithoutRef<'a'>>((props, ref) => (
    <NavLink ref={ref} component="a" {...props} />
  )),
)

type Props = {
  onNavigate?: () => void
  /** Icons only, names in tooltips */
  collapsed?: boolean
}

export function FolderNav({ onNavigate, collapsed = false }: Props) {
  const { data: folders, isPending, isError } = useFolders()
  const { folderId } = useParams({ strict: false })

  if (isPending) {
    return (
      <Stack gap="xs" p="xs">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} height={28} />
        ))}
      </Stack>
    )
  }

  if (isError) {
    return (
      <Text c="dimmed" size="sm" p="xs">
        Could not load folders.
      </Text>
    )
  }

  const renderFolder = (folder: Folder, depth = 0) => {
    const Icon = folder.role ? roleIcons[folder.role] : IconFolder
    const unread = folder.unread > 0 ? folder.unread : null

    return (
      <RouterNavLink
        key={folder.id}
        to="/folders/$folderId"
        params={{ folderId: folder.id }}
        preload="intent"
        onClick={onNavigate}
        label={folder.name}
        leftSection={<Icon size={16} stroke={1.5} />}
        rightSection={
          unread && (
            <Badge size="sm" variant="transparent" c="dimmed" fw={600} px={0}>
              {unread}
            </Badge>
          )
        }
        active={folder.id === folderId}
        fw={unread ? 600 : undefined}
        pl={`calc(var(--mantine-spacing-sm) + ${depth} * var(--mantine-spacing-md))`}
      >
        {folder.children.length > 0 &&
          folder.children.map((child) => renderFolder(child, depth + 1))}
      </RouterNavLink>
    )
  }

  if (collapsed) {
    return (
      <Stack gap={2} align="center">
        {flattenFolders(folders).map((folder) => {
          const Icon = folder.role ? roleIcons[folder.role] : IconFolder
          const label = folder.unread > 0 ? `${folder.name} (${folder.unread})` : folder.name
          return (
            <Tooltip key={folder.id} label={label} position="right">
              <RouterNavLink
                to="/folders/$folderId"
                params={{ folderId: folder.id }}
                preload="intent"
                onClick={onNavigate}
                aria-label={label}
                active={folder.id === folderId}
                w={44}
                styles={{ section: { marginInlineEnd: 0 }, body: { display: 'none' } }}
                leftSection={
                  <Indicator size={7} offset={2} disabled={folder.unread === 0}>
                    <Icon size={18} stroke={1.5} />
                  </Indicator>
                }
              />
            </Tooltip>
          )
        })}
      </Stack>
    )
  }

  return <Stack gap={2}>{folders.map((folder) => renderFolder(folder))}</Stack>
}
