import { Avatar, Box, Group, Stack, Text, UnstyledButton } from '@mantine/core'
import { type ReactNode, useState } from 'react'

import { displayName, initials, relativeDate } from '../lib/format'
import { useI18n } from '../lib/i18n'
import type { Message, MessageRow } from '../types'
import { MessageFrame, splitTextQuote } from './MessageFrame'
import classes from './Conversation.module.css'

type EarlierProps = {
  /** The conversation's messages before the one in the reader, oldest first */
  rows: MessageRow[]
  /** Renders an opened message; the container loads it */
  renderMessage: (row: MessageRow, onFold: () => void) => ReactNode
}

/** The earlier messages of a conversation, one line each, opened in place. */
export function EarlierMessages({ rows, renderMessage }: EarlierProps) {
  const { t, locale } = useI18n()
  const [open, setOpen] = useState<Set<number>>(
    () => new Set(rows.filter((r) => !r.seen).map((r) => r.uid)),
  )
  const toggle = (uid: number) =>
    setOpen((current) => {
      const next = new Set(current)
      if (next.has(uid)) next.delete(uid)
      else next.add(uid)
      return next
    })

  if (rows.length === 0) return null

  return (
    <Stack gap={0} className={classes.earlier} aria-label={t.earlierMessages(rows.length)}>
      {rows.map((row) =>
        open.has(row.uid) ? (
          <Box key={row.uid} className={classes.item}>
            {renderMessage(row, () => toggle(row.uid))}
          </Box>
        ) : (
          <UnstyledButton
            key={row.uid}
            className={classes.item}
            onClick={() => toggle(row.uid)}
            aria-expanded={false}
          >
            <Group gap={12} wrap="nowrap">
              <Avatar
                radius="xl"
                size={28}
                color="initials"
                name={displayName(row.from)}
                aria-hidden
              >
                {initials(row.from)}
              </Avatar>
              <Text size="sm" fw={row.seen ? 500 : 700} className={classes.sender}>
                {displayName(row.from)}
              </Text>
              <Text size="sm" c="dimmed" truncate style={{ flex: 1 }}>
                {row.snippet}
              </Text>
              <Text size="xs" c="dimmed" className={classes.date}>
                {relativeDate(row.date, locale)}
              </Text>
            </Group>
          </UnstyledButton>
        ),
      )}
    </Stack>
  )
}

type OpenedProps = {
  message: Message
  allowRemote: boolean
  onFold: () => void
}

/** An earlier message, opened: who, when, the body without its quote. */
export function EarlierMessage({ message, allowRemote, onFold }: OpenedProps) {
  const { locale } = useI18n()
  return (
    <Stack gap={12}>
      <UnstyledButton onClick={onFold} aria-expanded>
        <Group gap={12} wrap="nowrap">
          <Avatar
            radius="xl"
            size={28}
            color="initials"
            name={displayName(message.from)}
            aria-hidden
          >
            {initials(message.from)}
          </Avatar>
          <Text size="sm" fw={600} className={classes.sender}>
            {displayName(message.from)}
          </Text>
          <Box style={{ flex: 1 }} />
          <Text size="xs" c="dimmed" className={classes.date}>
            {relativeDate(message.date, locale)}
          </Text>
        </Group>
      </UnstyledButton>
      {message.html ? (
        <MessageFrame
          html={message.html}
          allowRemote={allowRemote}
          showQuoted={false}
          title={message.subject}
        />
      ) : (
        <Text size="sm" className={classes.text}>
          {splitTextQuote(message.text ?? '').body}
        </Text>
      )}
    </Stack>
  )
}
