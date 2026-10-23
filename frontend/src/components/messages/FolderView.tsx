import { Box, Flex } from '@mantine/core'
import { Outlet, useParams } from '@tanstack/react-router'

import { MessageList } from './MessageList'

/**
 * List + reader side by side on desktop, stacked on mobile.
 */
export function FolderView() {
  const { folderId } = useParams({ from: '/folders/$folderId' })

  return (
    <Flex h="100%" direction={{ base: 'column', md: 'row' }}>
      <Box
        w={{ base: '100%', md: 380 }}
        h="100%"
        style={{ borderRight: '1px solid var(--mantine-color-default-border)', flexShrink: 0 }}
      >
        <MessageList folderId={folderId} />
      </Box>
      <Box flex={1} h="100%" mih={0}>
        <Outlet />
      </Box>
    </Flex>
  )
}
