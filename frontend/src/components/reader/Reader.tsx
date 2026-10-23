import {
  ActionIcon,
  Center,
  Divider,
  Group,
  Paper,
  ScrollArea,
  Skeleton,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { IconArrowLeft } from '@tabler/icons-react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { type ReactNode, useEffect, useState } from 'react'

import { useFlagMessages } from '../../api/mutations'
import { useMessage, useThread } from '../../api/queries'
import { useSettings } from '../../api/settings'
import type { Message, MessageRow } from '../../api/types'
import { CollapsedMessage, MessageView } from './MessageView'
import { ReaderToolbar } from './ReaderToolbar'

const Loading = () => (
  <Stack gap="md">
    <Skeleton height={40} width="40%" />
    <Skeleton height={200} />
  </Stack>
)

const Failed = ({ what }: { what: string }) => (
  <Center h={200}>
    <Text c="dimmed" size="sm">
      Could not load this {what}.
    </Text>
  </Center>
)

export function Reader() {
  const { folderId, uid } = useParams({ from: '/folders/$folderId/$uid' })
  const { data: settings } = useSettings()
  const threads = settings?.threads ?? true
  const thread = useThread(folderId, Number(uid), threads)

  if (threads && thread.isPending) return <Frame folderId={folderId} body={<Loading />} />
  if (threads && thread.data && thread.data.length > 1) {
    return <Conversation key={uid} folderId={folderId} rows={thread.data} />
  }
  return <Single key={uid} folderId={folderId} uid={Number(uid)} />
}

/** Common layout: back button on mobile, subject, toolbar, then the content. */
function Frame({
  folderId,
  subject,
  toolbar,
  body,
}: {
  folderId: string
  subject?: string
  toolbar?: ReactNode
  body: ReactNode
}) {
  const navigate = useNavigate()
  return (
    <ScrollArea h="100%" type="auto">
      <Stack p={{ base: 'md', md: 'xl' }} gap="lg" maw={920} mx="auto">
        <Group gap="sm" wrap="nowrap" align="flex-start" justify="space-between">
          <Group gap="sm" wrap="nowrap" align="flex-start" style={{ minWidth: 0 }}>
            <ActionIcon
              variant="subtle"
              color="gray"
              hiddenFrom="md"
              aria-label="Back to the list"
              onClick={() =>
                void navigate({
                  to: '/folders/$folderId',
                  params: { folderId },
                  search: (prev) => prev,
                })
              }
            >
              <IconArrowLeft size={18} />
            </ActionIcon>
            {subject !== undefined && (
              <Title order={3} fw={600} style={{ overflowWrap: 'anywhere' }}>
                {subject || '(no subject)'}
              </Title>
            )}
          </Group>
          {toolbar}
        </Group>
        {body}
      </Stack>
    </ScrollArea>
  )
}

/** Opening a message reads it, once, optimistic in the list. */
function useMarkRead(folderId: string, uids: number[]) {
  const flag = useFlagMessages()
  const key = uids.join(',')
  useEffect(() => {
    if (uids.length > 0) flag.mutate({ folder: folderId, uids, seen: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderId, key])
}

function Single({ folderId, uid }: { folderId: string; uid: number }) {
  const [images, setImages] = useState<boolean | undefined>(undefined)
  const { data: message, isPending, isError } = useMessage(folderId, uid, images)
  useMarkRead(folderId, message && !message.seen ? [uid] : [])

  if (isPending) return <Frame folderId={folderId} body={<Loading />} />
  if (isError) return <Frame folderId={folderId} body={<Failed what="message" />} />

  return (
    <Frame
      folderId={folderId}
      subject={message.subject}
      toolbar={<ReaderToolbar message={message} />}
      body={<MessageView message={message} onShowImages={() => setImages(true)} />}
    />
  )
}

function Conversation({ folderId, rows }: { folderId: string; rows: MessageRow[] }) {
  const latest = rows[rows.length - 1]!
  const [expanded, setExpanded] = useState<Set<number>>(
    () => new Set(rows.filter((row, i) => !row.seen || i === rows.length - 1).map((r) => r.uid)),
  )
  const { data: latestMessage } = useMessage(folderId, latest.uid, undefined)
  const uids = rows.map((row) => row.uid)
  useMarkRead(
    folderId,
    rows.filter((row) => !row.seen).map((row) => row.uid),
  )

  const toggle = (uid: number) =>
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(uid)) next.delete(uid)
      else next.add(uid)
      return next
    })

  return (
    <Frame
      folderId={folderId}
      subject={latest.subject}
      toolbar={latestMessage && <ReaderToolbar message={latestMessage} uids={uids} />}
      body={
        <Stack gap={0}>
          <Text size="xs" c="dimmed" mb="sm">
            {rows.length} messages
          </Text>
          {rows.map((row, i) => (
            <div key={row.uid}>
              {i > 0 && <Divider my="sm" />}
              {expanded.has(row.uid) ? (
                <ExpandedMessage folderId={folderId} row={row} onCollapse={() => toggle(row.uid)} />
              ) : (
                <CollapsedMessage row={row} onExpand={() => toggle(row.uid)} />
              )}
            </div>
          ))}
        </Stack>
      }
    />
  )
}

function ExpandedMessage({
  folderId,
  row,
  onCollapse,
}: {
  folderId: string
  row: MessageRow
  onCollapse: () => void
}) {
  const [images, setImages] = useState<boolean | undefined>(undefined)
  const { data: message, isPending, isError } = useMessage(folderId, row.uid, images)
  if (isPending) return <Loading />
  if (isError) return <Failed what="message" />
  return (
    <Paper p={0} bg="transparent">
      <MessageView
        message={message as Message}
        onShowImages={() => setImages(true)}
        onCollapse={onCollapse}
      />
    </Paper>
  )
}
