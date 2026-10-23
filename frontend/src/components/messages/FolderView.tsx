import { Box, Flex } from '@mantine/core'
import { Outlet, useParams } from '@tanstack/react-router'

import { MessageList } from './MessageList'

/**
 * List and reader side by side on desktop. On mobile only one shows: the
 * list, or the reader once a message is open.
 */
export function FolderView() {
  const { folderId } = useParams({ from: '/folders/$folderId' })
  const { uid } = useParams({ strict: false })
  const reading = uid !== undefined

  return (
    <Flex h="100%" direction={{ base: 'column', md: 'row' }}>
      <Box
        w={{ base: '100%', md: 380 }}
        h="100%"
        display={{ base: reading ? 'none' : 'block', md: 'block' }}
        style={{ borderRight: '1px solid var(--mantine-color-default-border)', flexShrink: 0 }}
      >
        <MessageList folderId={folderId} />
      </Box>
      <Box flex={1} h="100%" mih={0} display={{ base: reading ? 'block' : 'none', md: 'block' }}>
        <Outlet />
      </Box>
    </Flex>
  )
}
