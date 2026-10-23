import { ActionIcon, Group, Kbd, Menu, Tooltip } from '@mantine/core'
import { useHotkeys } from '@mantine/hooks'
import {
  IconArchive,
  IconArrowBackUp,
  IconArrowBackUpDouble,
  IconArrowForwardUp,
  IconBan,
  IconFolderSymlink,
  IconPencil,
  IconMailOpened,
  IconStar,
  IconStarFilled,
  IconTrash,
} from '@tabler/icons-react'
import { useNavigate } from '@tanstack/react-router'

import { useDeleteMessages, useFlagMessages, useMoveMessages } from '../../api/mutations'
import { useFolders, useMe } from '../../api/queries'
import type { FolderRole, Message } from '../../api/types'
import { flattenFolders, folderByRole } from '../../lib/folders'
import {
  forwardHtml,
  forwardSubject,
  replyAllRecipients,
  replyHtml,
  replyRecipients,
  replySubject,
} from '../../lib/quote'
import { useComposer } from '../compose/ComposerContext'

type Props = {
  message: Message
  /** The whole conversation when there is one: moves and read state apply to all of it */
  uids?: number[]
}

type Action = {
  label: string
  key: string
  icon: typeof IconArchive
  run: () => void
  disabled?: boolean
  color?: string
}

export function ReaderToolbar({ message, uids: conversation }: Props) {
  const { data: folders } = useFolders()
  const { data: me } = useMe()
  const composer = useComposer()
  const navigate = useNavigate()
  const flag = useFlagMessages()
  const move = useMoveMessages()
  const remove = useDeleteMessages()

  const folder = message.folder
  const uids = conversation?.length ? conversation : [message.uid]
  const leave = () =>
    void navigate({
      to: '/folders/$folderId',
      params: { folderId: folder },
      search: (prev) => prev,
    })

  const moveToRole = (role: FolderRole, label: string) => {
    const target = folderByRole(folders, role)
    if (!target || target.id === folder) return
    move.moveWithUndo({ folder, uids, to: target.id }, label, target.name)
    leave()
  }

  const inTrash = folderByRole(folders, 'trash')?.id === folder
  const inJunk = folderByRole(folders, 'junk')?.id === folder

  const ref = { folder, uid: message.uid }
  const compose: Action[] = message.draft
    ? [
        {
          label: 'Edit draft',
          key: 'Enter',
          icon: IconPencil,
          run: () =>
            composer.open({
              to: message.to,
              cc: message.cc,
              bcc: message.bcc,
              subject: message.subject,
              html: message.html ?? undefined,
              attachmentsFrom: ref,
              carried: message.attachments,
              replaces: ref,
            }),
        },
      ]
    : [
        {
          label: 'Reply',
          key: 'r',
          icon: IconArrowBackUp,
          run: () =>
            composer.open({
              to: replyRecipients(message),
              subject: replySubject(message.subject),
              html: replyHtml(message),
              inReplyTo: ref,
            }),
        },
        {
          label: 'Reply all',
          key: 'a',
          icon: IconArrowBackUpDouble,
          run: () =>
            composer.open({
              ...replyAllRecipients(message, me?.email ?? ''),
              subject: replySubject(message.subject),
              html: replyHtml(message),
              inReplyTo: ref,
            }),
        },
        {
          label: 'Forward',
          key: 'f',
          icon: IconArrowForwardUp,
          run: () =>
            composer.open({
              subject: forwardSubject(message.subject),
              html: forwardHtml(message),
              forwardOf: ref,
              carried: message.attachments,
            }),
        },
      ]

  const actions: Action[] = [
    ...compose,
    {
      label: inTrash ? 'Delete forever' : 'Delete',
      key: '#',
      icon: IconTrash,
      color: inTrash ? 'red' : undefined,
      run: () => {
        if (inTrash) {
          remove.mutate({ folder, uids })
          leave()
        } else {
          moveToRole('trash', 'Moved')
        }
      },
    },
    {
      label: 'Archive',
      key: 'e',
      icon: IconArchive,
      disabled:
        !folderByRole(folders, 'archive') || folderByRole(folders, 'archive')?.id === folder,
      run: () => moveToRole('archive', 'Archived'),
    },
    {
      label: inJunk ? 'Not junk' : 'Junk',
      key: '!',
      icon: IconBan,
      run: () => (inJunk ? moveToRole('inbox', 'Moved') : moveToRole('junk', 'Marked as junk,')),
    },
    {
      label: message.flagged ? 'Unstar' : 'Star',
      key: 's',
      icon: message.flagged ? IconStarFilled : IconStar,
      color: message.flagged ? 'yellow' : undefined,
      run: () => flag.mutate({ folder, uids: [message.uid], flagged: !message.flagged }),
    },
    {
      label: 'Mark as unread',
      key: 'u',
      icon: IconMailOpened,
      run: () => {
        flag.mutate({ folder, uids, seen: false })
        leave()
      },
    },
  ]

  useHotkeys(actions.filter((a) => !a.disabled).map((a) => [a.key, a.run] as [string, () => void]))

  const others = flattenFolders(folders ?? []).filter((f) => f.id !== folder)

  return (
    <Group gap={4} wrap="nowrap">
      {actions.map((action) => (
        <Tooltip
          key={action.label}
          label={
            <span>
              {action.label} <Kbd size="xs">{action.key}</Kbd>
            </span>
          }
        >
          <ActionIcon
            variant="subtle"
            color={action.color ?? 'gray'}
            aria-label={action.label}
            disabled={action.disabled}
            onClick={action.run}
          >
            <action.icon size={18} stroke={1.5} />
          </ActionIcon>
        </Tooltip>
      ))}
      <Menu position="bottom-end" width={220}>
        <Menu.Target>
          <Tooltip label="Move to">
            <ActionIcon variant="subtle" color="gray" aria-label="Move to">
              <IconFolderSymlink size={18} stroke={1.5} />
            </ActionIcon>
          </Tooltip>
        </Menu.Target>
        <Menu.Dropdown>
          {others.map((target) => (
            <Menu.Item
              key={target.id}
              onClick={() => {
                move.moveWithUndo({ folder, uids, to: target.id }, 'Moved', target.name)
                leave()
              }}
            >
              {target.name}
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
    </Group>
  )
}
