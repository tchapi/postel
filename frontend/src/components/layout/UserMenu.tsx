import { Avatar, Menu, Text, useMantineColorScheme } from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'
import { IconMoon, IconSettings, IconSun, IconSunMoon } from '@tabler/icons-react'

import { useMe } from '../../api/queries'
import { DEFAULT_SETTINGS, useSettings } from '../../api/settings'
import { initials } from '../../lib/format'
import { SettingsModal } from '../settings/SettingsModal'

export function UserMenu() {
  const { data: me } = useMe()
  const { data: settings } = useSettings()
  const { setColorScheme } = useMantineColorScheme()
  const [settingsOpened, { open: openSettings, close: closeSettings }] = useDisclosure()
  const label = settings?.fromName ?? me?.displayName ?? me?.username ?? ''

  return (
    <>
      <Menu position="bottom-end" width={200}>
        <Menu.Target>
          <Avatar size="sm" radius="xl" component="button" style={{ cursor: 'pointer' }}>
            {initials(label)}
          </Avatar>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>
            <Text size="xs" truncate>
              {me?.email}
            </Text>
          </Menu.Label>
          <Menu.Item leftSection={<IconSettings size={14} />} onClick={openSettings}>
            Settings
          </Menu.Item>
          <Menu.Divider />
          <Menu.Label>Theme</Menu.Label>
          <Menu.Item leftSection={<IconSun size={14} />} onClick={() => setColorScheme('light')}>
            Light
          </Menu.Item>
          <Menu.Item leftSection={<IconMoon size={14} />} onClick={() => setColorScheme('dark')}>
            Dark
          </Menu.Item>
          <Menu.Item leftSection={<IconSunMoon size={14} />} onClick={() => setColorScheme('auto')}>
            System
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
      <SettingsModal
        settings={settings ?? DEFAULT_SETTINGS}
        opened={settingsOpened}
        onClose={closeSettings}
      />
    </>
  )
}
