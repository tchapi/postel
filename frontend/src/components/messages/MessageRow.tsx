import { Group, Text } from '@mantine/core'
import { IconPaperclip, IconStarFilled } from '@tabler/icons-react'

import type { MessageRow as Row } from '../../api/types'
import { displayName, formatListDate } from '../../lib/format'
import classes from './MessageRow.module.css'

type Props = {
  row: Row
  active: boolean
  compact?: boolean
  onOpen: () => void
}

export function MessageRow({ row, active, compact, onOpen }: Props) {
  const weight = row.seen ? undefined : 600

  return (
    <button
      type="button"
      className={classes.row}
      data-active={active || undefined}
      onClick={onOpen}
      aria-current={active ? 'true' : undefined}
    >
      <span className={classes.dot} data-unread={row.seen ? undefined : ''} />
      <span className={classes.body}>
        <span className={classes.line}>
          <Text component="span" size="sm" fw={weight} className={classes.grow}>
            {displayName(row.from)}
          </Text>
          <Group component="span" gap={4} wrap="nowrap">
            {row.flagged && <IconStarFilled size={12} color="var(--mantine-color-yellow-6)" />}
            {row.hasAttachments && <IconPaperclip size={12} stroke={1.5} />}
            <Text component="span" size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
              {row.date ? formatListDate(row.date) : ''}
            </Text>
          </Group>
        </span>
        <Text component="span" size="sm" fw={weight} className={classes.grow}>
          {row.subject || '(no subject)'}
        </Text>
        {!compact && (
          <Text component="span" size="xs" c="dimmed" className={classes.grow}>
            {row.snippet}
          </Text>
        )}
      </span>
    </button>
  )
}
