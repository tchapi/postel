import { Center, Text } from '@mantine/core'
import { useParams } from '@tanstack/react-router'

/**
 * Placeholder until the message endpoint exists: see docs/roadmap.md, phase 1.
 */
export function Reader() {
  const { folderId, uid } = useParams({ from: '/folders/$folderId/$uid' })

  return (
    <Center h="100%">
      <Text c="dimmed" size="sm">
        Message {uid} in {folderId}
      </Text>
    </Center>
  )
}
