import { Group, Kbd, Modal, SimpleGrid, Stack, Text, Title } from '@mantine/core'

import { SHORTCUTS } from '../../lib/shortcuts'

export function ShortcutsModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  return (
    <Modal opened={opened} onClose={onClose} title="Keyboard shortcuts" size="lg">
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xl">
        {SHORTCUTS.map((group) => (
          <Stack key={group.title} gap="xs">
            <Title order={6} c="dimmed" fw={500}>
              {group.title}
            </Title>
            {group.items.map((item) => (
              <Group key={item.label} justify="space-between" wrap="nowrap" gap="sm">
                <Text size="sm">{item.label}</Text>
                <Group gap={4} wrap="nowrap">
                  {item.keys.map((key) => (
                    <Kbd key={key}>{key}</Kbd>
                  ))}
                </Group>
              </Group>
            ))}
          </Stack>
        ))}
      </SimpleGrid>
    </Modal>
  )
}
