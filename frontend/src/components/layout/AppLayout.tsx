import { AppShell, Burger, Group, Text } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { Outlet } from '@tanstack/react-router'

import { FolderNav } from '../folders/FolderNav'
import { SearchBox } from './SearchBox'
import { UserMenu } from './UserMenu'

export function AppLayout() {
  const [navOpened, { toggle: toggleNav, close: closeNav }] = useDisclosure()

  return (
    <AppShell
      header={{ height: 48 }}
      navbar={{ width: 240, breakpoint: 'sm', collapsed: { mobile: !navOpened } }}
      padding={0}
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="sm">
            <Burger opened={navOpened} onClick={toggleNav} hiddenFrom="sm" size="sm" />
            <Text fw={600}>Webmail</Text>
          </Group>
          <Group gap="sm">
            <SearchBox />
            <UserMenu />
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs">
        <FolderNav onNavigate={closeNav} />
      </AppShell.Navbar>

      <AppShell.Main h="100dvh">
        <Outlet />
      </AppShell.Main>
    </AppShell>
  )
}
