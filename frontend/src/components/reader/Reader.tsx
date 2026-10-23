import {
  ActionIcon,
  Alert,
  Avatar,
  Box,
  Button,
  Center,
  Group,
  ScrollArea,
  Skeleton,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core'
import { IconArrowLeft, IconPhotoOff } from '@tabler/icons-react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { useState } from 'react'

import { useMessage } from '../../api/queries'
import type { Address } from '../../api/types'
import { displayName, formatFullDate, initials } from '../../lib/format'
import { AttachmentList } from './AttachmentList'
import { HtmlBody } from './HtmlBody'

function addressList(label: string, addresses: Address[]) {
  if (addresses.length === 0) return null
  return (
    <Text size="xs" c="dimmed">
      {label}{' '}
      {addresses.map((a, i) => (
        <span key={a.email}>
          {i > 0 && ', '}
          <Tooltip label={a.email} disabled={!a.name}>
            <span>{displayName(a)}</span>
          </Tooltip>
        </span>
      ))}
    </Text>
  )
}

export function Reader() {
  const { folderId, uid } = useParams({ from: '/folders/$folderId/$uid' })
  const navigate = useNavigate()
  const [showImages, setShowImages] = useState(false)
  const { data: message, isPending, isError } = useMessage(folderId, Number(uid), showImages)

  const back = (
    <ActionIcon
      variant="subtle"
      hiddenFrom="md"
      aria-label="Back to the list"
      onClick={() => void navigate({ to: '/folders/$folderId', params: { folderId } })}
    >
      <IconArrowLeft size={18} />
    </ActionIcon>
  )

  if (isPending) {
    return (
      <Stack p="lg" gap="md">
        <Skeleton height={28} width="60%" />
        <Skeleton height={40} width="40%" />
        <Skeleton height={200} />
      </Stack>
    )
  }

  if (isError) {
    return (
      <Center h="100%">
        <Text c="dimmed" size="sm">
          Could not load this message.
        </Text>
      </Center>
    )
  }

  const from = message.from
  const fromLabel = displayName(from)

  return (
    <ScrollArea h="100%" type="auto">
      <Stack p={{ base: 'md', md: 'lg' }} gap="md" maw={900}>
        <Group gap="sm" wrap="nowrap" align="flex-start">
          {back}
          <Title order={3} fw={600} style={{ overflowWrap: 'anywhere' }}>
            {message.subject || '(no subject)'}
          </Title>
        </Group>

        <Group gap="sm" wrap="nowrap" align="flex-start">
          <Avatar radius="xl" size="md">
            {initials(fromLabel)}
          </Avatar>
          <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
            <Group gap="xs" justify="space-between" wrap="nowrap">
              <Text size="sm" fw={600} truncate>
                {from?.name ?? from?.email ?? 'Unknown sender'}
                {from?.name && (
                  <Text component="span" size="sm" c="dimmed" fw={400}>
                    {' '}
                    &lt;{from.email}&gt;
                  </Text>
                )}
              </Text>
              <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                {message.date ? formatFullDate(message.date) : ''}
              </Text>
            </Group>
            {addressList('To', message.to)}
            {addressList('Cc', message.cc)}
          </Stack>
        </Group>

        {message.hasRemoteImages && !showImages && (
          <Alert
            icon={<IconPhotoOff size={16} />}
            color="gray"
            variant="light"
            py="xs"
            title="Remote images are blocked"
          >
            <Group gap="xs">
              <Text size="sm">This message loads images from the internet.</Text>
              <Button size="compact-xs" variant="default" onClick={() => setShowImages(true)}>
                Show images
              </Button>
            </Group>
          </Alert>
        )}

        <AttachmentList folderId={folderId} uid={message.uid} attachments={message.attachments} />

        <Box>
          {message.html ? (
            <HtmlBody html={message.html} remoteImages={showImages} />
          ) : (
            <Text size="sm" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {message.text ?? ''}
            </Text>
          )}
        </Box>
      </Stack>
    </ScrollArea>
  )
}
