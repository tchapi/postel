import { Badge, NavLink, type NavLinkProps, Skeleton, Stack, Text } from '@mantine/core'
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
}

export function FolderNav({ onNavigate }: Props) {
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
            <Badge size="sm" variant="light" circle={unread < 100}>
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

  return <Stack gap={2}>{folders.map((folder) => renderFolder(folder))}</Stack>
}
