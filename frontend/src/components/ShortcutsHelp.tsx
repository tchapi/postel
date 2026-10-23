import { Modal, SimpleGrid, Stack, Table, Text } from '@mantine/core'
import { useI18n } from '../lib/i18n'
import { SHORTCUTS, type ShortcutId } from '../lib/shortcuts'
import { KeyCombo } from './ShortcutTooltip'

const GROUPS = ['move', 'act', 'app'] as const
// "close" is listed once, under Move.
const ORDER: ShortcutId[] = [
  'next',
  'prev',
  'open',
  'close',
  'goInbox',
  'search',
  'palette',
  'reply',
  'replyAll',
  'forward',
  'archive',
  'delete',
  'star',
  'unread',
  'compose',
  'send',
  'help',
]

/** The cheat-sheet content; also printable on its own. */
export function ShortcutsTable() {
  const { t } = useI18n()
  return (
    <SimpleGrid cols={{ base: 1, sm: 3 }} spacing={40}>
      {GROUPS.map((g) => (
        <Stack key={g} gap={8}>
          <Text size="xs" fw={700} tt="uppercase" c="dimmed" style={{ letterSpacing: '0.04em' }}>
            {t.shortcutGroups[g]}
          </Text>
          <Table verticalSpacing={8} horizontalSpacing={0} withRowBorders>
            <Table.Tbody>
              {ORDER.filter((id) => SHORTCUTS[id].group === g).map((id) => (
                <Table.Tr key={id}>
                  <Table.Td w={112}>
                    <KeyCombo id={id} size="sm" />
                  </Table.Td>
                  <Table.Td>{t.shortcutLabels[id]}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Stack>
      ))}
    </SimpleGrid>
  )
}

export function ShortcutsHelp({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const { t } = useI18n()
  return (
    <Modal opened={opened} onClose={onClose} title={t.shortcuts} size={960} centered>
      <Stack gap="lg">
        <ShortcutsTable />
        <Text size="sm" c="dimmed">
          {t.shortcutsFooter}
        </Text>
      </Stack>
    </Modal>
  )
}
