import type { ReactElement } from 'react'
import { Group, Kbd, Text, Tooltip, type KbdProps, type TooltipProps } from '@mantine/core'
import { SHORTCUTS, keyLabel, type ShortcutId } from '../lib/shortcuts'
import { useI18n } from '../lib/i18n'

export function KeyCombo({
  id,
  size = 'xs',
  withAlt = false,
}: {
  id: ShortcutId
  size?: KbdProps['size']
  /** Also list the alternate keys, e.g. "# or ⌫ ⌦" */
  withAlt?: boolean
}) {
  const { t } = useI18n()
  const def = SHORTCUTS[id]
  return (
    <Group gap={4} wrap="nowrap" component="span">
      {def.keys.map((k, i) => (
        <Group key={k} gap={4} wrap="nowrap" component="span">
          {def.sequence && i > 0 && (
            <Text span size="xs" c="dimmed">
              {t.then}
            </Text>
          )}
          <Kbd size={size}>{keyLabel(k)}</Kbd>
        </Group>
      ))}
      {withAlt && def.alt?.length && (
        <Text span size="xs" c="dimmed">
          {t.or}
        </Text>
      )}
      {withAlt &&
        def.alt?.map((k) => (
          <Kbd key={k} size={size}>
            {keyLabel(k)}
          </Kbd>
        ))}
    </Group>
  )
}

/** Tooltip that shows the action and its key, e.g. "Archive  e". */
export function ShortcutTooltip({
  label,
  shortcut,
  position,
  children,
}: {
  label: string
  shortcut?: ShortcutId
  position?: TooltipProps['position']
  children: ReactElement
}) {
  return (
    <Tooltip
      position={position}
      label={
        <Group gap={8} wrap="nowrap">
          <span>{label}</span>
          {shortcut && <KeyCombo id={shortcut} />}
        </Group>
      }
    >
      {children}
    </Tooltip>
  )
}
