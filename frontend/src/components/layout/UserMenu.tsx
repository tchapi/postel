import { Avatar, Kbd, Menu, Text, useMantineColorScheme } from '@mantine/core'
import { IconKeyboard, IconMoon, IconSettings, IconSun, IconSunMoon } from '@tabler/icons-react'

import { useMe } from '../../api/queries'
import { useSettings } from '../../api/settings'
import { initials } from '../../lib/format'
import { useAppActions } from './AppActions'

export function UserMenu() {
  const { data: me } = useMe()
  const { data: settings } = useSettings()
  const { setColorScheme } = useMantineColorScheme()
  const { openSettings, openShortcuts } = useAppActions()
  const label = settings?.fromName ?? me?.displayName ?? me?.username ?? ''

  return (
    <>
      <Menu position="bottom-end" width={200}>
        <Menu.Target>
          <Avatar
            size="sm"
            radius="xl"
            component="button"
            color="initials"
            name={label}
            aria-label="Account menu"
            style={{ cursor: 'pointer', border: 0 }}
          >
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
          <Menu.Item
            leftSection={<IconKeyboard size={14} />}
            rightSection={<Kbd>?</Kbd>}
            onClick={openShortcuts}
          >
            Shortcuts
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
    </>
  )
}
