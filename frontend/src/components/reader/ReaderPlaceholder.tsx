import { Center, Text } from '@mantine/core'

export function ReaderPlaceholder() {
  return (
    <Center h="100%" visibleFrom="md">
      <Text c="dimmed" size="sm">
        Select a message to read it
      </Text>
    </Center>
  )
}
