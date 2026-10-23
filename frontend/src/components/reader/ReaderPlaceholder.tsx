import { Center, Group, Kbd, Stack, Text } from '@mantine/core'
import { IconMail } from '@tabler/icons-react'

export function ReaderPlaceholder() {
  return (
    <Center h="100%" visibleFrom="md">
      <Stack align="center" gap="xs">
        <IconMail size={32} stroke={1.25} color="var(--mantine-color-dimmed)" />
        <Text c="dimmed" size="sm">
          No message selected
        </Text>
        <Group gap={6}>
          <Kbd>j</Kbd>
          <Kbd>k</Kbd>
          <Text c="dimmed" size="xs">
            to move,
          </Text>
          <Kbd>?</Kbd>
          <Text c="dimmed" size="xs">
            for shortcuts
          </Text>
        </Group>
      </Stack>
    </Center>
  )
}
