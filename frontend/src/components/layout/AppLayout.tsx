import { ActionIcon, AppShell, Box, Burger, Button, Group, Text, Tooltip } from '@mantine/core'
import { useDisclosure, useHotkeys, useLocalStorage } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import {
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconMail,
  IconPencil,
  IconWifiOff,
} from '@tabler/icons-react'
import { Outlet } from '@tanstack/react-router'
import { useEffect } from 'react'

import { useFolders } from '../../api/queries'
import { folderByRole } from '../../lib/folders'
import { Composer } from '../compose/Composer'
import { ComposerProvider, useComposer } from '../compose/ComposerContext'
import { FolderNav } from '../folders/FolderNav'
import { AppActionsProvider, useAppActions } from './AppActions'
import { CommandPalette } from './CommandPalette'
import { SearchBox } from './SearchBox'
import { UserMenu } from './UserMenu'

export function AppLayout() {
  return (
    <ComposerProvider>
      <AppActionsProvider>
        <Shell />
        <Composer />
        <CommandPalette />
      </AppActionsProvider>
    </ComposerProvider>
  )
}

function ComposeButton() {
  const { open } = useComposer()
  return (
    <Button size="xs" leftSection={<IconPencil size={14} />} onClick={() => open()}>
      Compose
    </Button>
  )
}

/** Unread count in the tab title, and a toast while the network is gone. */
function useAmbientStatus() {
  const { data: folders } = useFolders()
  const unread = folderByRole(folders, 'inbox')?.unread ?? 0
  useEffect(() => {
    document.title = unread > 0 ? `(${unread}) Webmail` : 'Webmail'
  }, [unread])

  useEffect(() => {
    const offline = () =>
      notifications.show({
        id: 'offline',
        color: 'gray',
        icon: <IconWifiOff size={16} />,
        message: 'You are offline. Changes will fail until the connection is back.',
        autoClose: false,
        withCloseButton: false,
      })
    const online = () => notifications.hide('offline')
    window.addEventListener('offline', offline)
    window.addEventListener('online', online)
    return () => {
      window.removeEventListener('offline', offline)
      window.removeEventListener('online', online)
    }
  }, [])
}

function Shell() {
  const [navOpened, { toggle: toggleNav, close: closeNav }] = useDisclosure()
  const [collapsed, setCollapsed] = useLocalStorage({
    key: 'webmail.nav-collapsed',
    defaultValue: false,
  })
  const { open: compose } = useComposer()
  const { openShortcuts } = useAppActions()
  useAmbientStatus()

  useHotkeys([
    ['c', () => compose()],
    ['shift+?', openShortcuts],
  ])

  return (
    <AppShell
      header={{ height: 52 }}
      navbar={{
        width: collapsed ? 64 : 232,
        breakpoint: 'sm',
        collapsed: { mobile: !navOpened },
      }}
      padding={0}
    >
      <AppShell.Header withBorder>
        <Group h="100%" px="md" gap="md" wrap="nowrap" justify="space-between">
          <Group gap="xs" wrap="nowrap" w={{ sm: collapsed ? 'auto' : 200 }}>
            <Burger opened={navOpened} onClick={toggleNav} hiddenFrom="sm" size="sm" />
            <IconMail size={20} stroke={1.75} color="var(--mantine-primary-color-filled)" />
            <Text fw={600} visibleFrom="xs">
              Webmail
            </Text>
          </Group>
          <Box style={{ flex: 1, display: 'flex', justifyContent: 'center', minWidth: 0 }}>
            <SearchBox />
          </Box>
          <Group gap="sm" wrap="nowrap">
            <ComposeButton />
            <UserMenu />
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs">
        <AppShell.Section grow style={{ overflowY: 'auto' }}>
          <FolderNav onNavigate={closeNav} collapsed={collapsed} />
        </AppShell.Section>
        <AppShell.Section visibleFrom="sm">
          <Tooltip label={collapsed ? 'Expand folders' : 'Collapse folders'} position="right">
            <ActionIcon
              onClick={() => setCollapsed((value) => !value)}
              aria-label={collapsed ? 'Expand folders' : 'Collapse folders'}
              m={6}
            >
              {collapsed ? (
                <IconLayoutSidebarLeftExpand size={18} stroke={1.5} />
              ) : (
                <IconLayoutSidebarLeftCollapse size={18} stroke={1.5} />
              )}
            </ActionIcon>
          </Tooltip>
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main h="100dvh">
        <Outlet />
      </AppShell.Main>
    </AppShell>
  )
}
