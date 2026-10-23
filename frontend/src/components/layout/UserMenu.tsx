import { Avatar, Menu, Text, useMantineColorScheme } from '@mantine/core'
import { IconMoon, IconSun, IconSunMoon } from '@tabler/icons-react'

import { useMe } from '../../api/queries'

function initials(name: string) {
  return name
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('')
}

export function UserMenu() {
  const { data: me } = useMe()
  const { setColorScheme } = useMantineColorScheme()
  const label = me?.displayName ?? me?.username ?? ''

  return (
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
  )
}
