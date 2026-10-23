import { AppShell, Burger, Button, Group, Text } from '@mantine/core'
import { useDisclosure, useHotkeys } from '@mantine/hooks'
import { IconPencil } from '@tabler/icons-react'
import { Outlet } from '@tanstack/react-router'

import { Composer } from '../compose/Composer'
import { ComposerProvider, useComposer } from '../compose/ComposerContext'
import { FolderNav } from '../folders/FolderNav'
import { SearchBox } from './SearchBox'
import { UserMenu } from './UserMenu'

export function AppLayout() {
  return (
    <ComposerProvider>
      <Shell />
      <Composer />
    </ComposerProvider>
  )
}

function ComposeButton() {
  const { open } = useComposer()
  useHotkeys([['c', () => open()]])
  return (
    <Button size="xs" leftSection={<IconPencil size={14} />} onClick={() => open()}>
      Compose
    </Button>
  )
}

function Shell() {
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
            <ComposeButton />
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
