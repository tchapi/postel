import { Center, Stack, Text } from '@mantine/core'
import { IconMailOff } from '@tabler/icons-react'

type Props = {
  folderId: string
}

/**
 * Placeholder until the messages endpoint exists: see docs/roadmap.md, phase 1.
 */
export function MessageList({ folderId }: Props) {
  return (
    <Center h="100%">
      <Stack align="center" gap="xs">
        <IconMailOff size={28} stroke={1.5} color="var(--mantine-color-dimmed)" />
        <Text c="dimmed" size="sm">
          No messages in {folderId} yet
        </Text>
      </Stack>
    </Center>
  )
}
