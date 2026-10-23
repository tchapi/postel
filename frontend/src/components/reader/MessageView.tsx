import {
  Alert,
  Avatar,
  Box,
  Button,
  Collapse,
  Group,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { IconPhotoOff } from '@tabler/icons-react'

import type { Address, Message, MessageRow } from '../../api/types'
import { displayName, formatFullDate, formatListDate, initials } from '../../lib/format'
import { splitQuotedText } from '../../lib/quoted'
import { AttachmentList } from './AttachmentList'
import { HtmlBody } from './HtmlBody'

function AddressLine({ label, addresses }: { label: string; addresses: Address[] }) {
  if (addresses.length === 0) return null
  return (
    <Text size="xs" c="dimmed" truncate>
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

type HeaderProps = {
  message: Message
  onCollapse?: () => void
}

function MessageHeader({ message, onCollapse }: HeaderProps) {
  const from = message.from
  const content = (
    <Group gap="sm" wrap="nowrap" align="flex-start">
      <Avatar radius="xl" size="md" color="initials" name={displayName(from)}>
        {initials(displayName(from))}
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
        <AddressLine label="To" addresses={message.to} />
        <AddressLine label="Cc" addresses={message.cc} />
      </Stack>
    </Group>
  )

  return onCollapse ? (
    <UnstyledButton onClick={onCollapse} aria-label="Collapse" style={{ width: '100%' }}>
      {content}
    </UnstyledButton>
  ) : (
    content
  )
}

type Props = {
  message: Message
  onShowImages: () => void
  onCollapse?: () => void
}

/** One message: who, when, attachments and the body. */
export function MessageView({ message, onShowImages, onCollapse }: Props) {
  return (
    <Stack gap="md">
      <MessageHeader message={message} onCollapse={onCollapse} />

      {message.hasRemoteImages && !message.remoteImagesLoaded && (
        <Alert icon={<IconPhotoOff size={16} />} color="gray" variant="light" py="xs">
          <Group gap="xs" justify="space-between">
            <Text size="sm">Remote images are blocked.</Text>
            <Button size="compact-xs" variant="default" onClick={onShowImages}>
              Show images
            </Button>
          </Group>
        </Alert>
      )}

      <AttachmentList
        folderId={message.folder}
        uid={message.uid}
        attachments={message.attachments}
      />

      <Box>
        {message.html ? (
          <HtmlBody html={message.html} remoteImages={message.remoteImagesLoaded} />
        ) : (
          <TextBody text={message.text ?? ''} />
        )}
      </Box>
    </Stack>
  )
}

/** A message of a conversation folded to one line. */
export function CollapsedMessage({ row, onExpand }: { row: MessageRow; onExpand: () => void }) {
  return (
    <UnstyledButton onClick={onExpand} style={{ width: '100%' }} py={4}>
      <Group gap="sm" wrap="nowrap">
        <Avatar radius="xl" size="sm" color="initials" name={displayName(row.from)}>
          {initials(displayName(row.from))}
        </Avatar>
        <Text size="sm" fw={row.seen ? 500 : 700} style={{ whiteSpace: 'nowrap' }}>
          {displayName(row.from)}
        </Text>
        <Text size="sm" c="dimmed" truncate style={{ flex: 1 }}>
          {row.snippet}
        </Text>
        <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
          {row.date ? formatListDate(row.date) : ''}
        </Text>
      </Group>
    </UnstyledButton>
  )
}

const textStyle = { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' } as const

function TextBody({ text }: { text: string }) {
  const { body, quoted } = splitQuotedText(text)
  const [opened, { toggle }] = useDisclosure(false)
  return (
    <Stack gap={4}>
      <Text size="sm" style={textStyle}>
        {body}
      </Text>
      {quoted && (
        <>
          <Button
            size="compact-xs"
            variant="light"
            color="gray"
            w="fit-content"
            onClick={toggle}
            aria-expanded={opened}
            title={opened ? 'Hide quoted text' : 'Show quoted text'}
          >
            •••
          </Button>
          <Collapse expanded={opened}>
            <Text size="sm" c="dimmed" style={textStyle}>
              {quoted}
            </Text>
          </Collapse>
        </>
      )}
    </Stack>
  )
}
