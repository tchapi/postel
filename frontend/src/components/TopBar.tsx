import {
  ActionIcon,
  Avatar,
  Box,
  Button,
  Group,
  Kbd,
  Menu,
  Text,
  ThemeIcon,
  Title,
  UnstyledButton,
} from '@mantine/core'
import {
  IconAdjustmentsHorizontal,
  IconKeyboard,
  IconLogout,
  IconMail,
  IconMenu2,
  IconMoon,
  IconPencil,
  IconSearch,
  IconSun,
} from '@tabler/icons-react'
import { useI18n } from '../lib/i18n'
import { initials } from '../lib/format'
import { KeyCombo, ShortcutTooltip } from './ShortcutTooltip'
import classes from './AppShell.module.css'

export type TopBarProps = {
  layout: 'desktop' | 'tablet' | 'mobile'
  unreadCount: number
  /** Mobile: current folder name shown as the title. */
  title: string
  navOpened: boolean
  onNavToggle: () => void
  onSearch: () => void
  onCompose: () => void
  session: { name: string; email: string }
  isDark: boolean
  onToggleTheme: () => void
  onSettings: () => void
  onShortcuts: () => void
  onSignOut: () => void
}

export function TopBar(p: TopBarProps) {
  const { t } = useI18n()
  const mobile = p.layout === 'mobile'

  const userMenu = (
    <Menu position="bottom-end" width={260}>
      <Menu.Target>
        <UnstyledButton aria-label={t.accountMenu} className={classes.avatarButton}>
          <Avatar size={32} radius="xl" color="initials" name={p.session.name}>
            {initials(p.session)}
          </Avatar>
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Box px={10} py={8}>
          <Text fw={600}>{p.session.name}</Text>
          <Text size="xs" c="dimmed">
            {p.session.email}
          </Text>
        </Box>
        <Menu.Divider />
        <Menu.Item leftSection={<IconAdjustmentsHorizontal size={16} />} onClick={p.onSettings}>
          {t.settings}
        </Menu.Item>
        <Menu.Item
          leftSection={p.isDark ? <IconSun size={16} /> : <IconMoon size={16} />}
          onClick={p.onToggleTheme}
        >
          {p.isDark ? t.lightTheme : t.darkTheme}
        </Menu.Item>
        <Menu.Item
          leftSection={<IconKeyboard size={16} />}
          rightSection={<KeyCombo id="help" />}
          onClick={p.onShortcuts}
        >
          {t.shortcuts}
        </Menu.Item>
        <Menu.Divider />
        <Menu.Item leftSection={<IconLogout size={16} />} onClick={p.onSignOut}>
          {t.signOut}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  )

  if (mobile) {
    return (
      <Group h="100%" gap={4} px={6} wrap="nowrap">
        <ActionIcon
          size={44}
          aria-label={t.openFolders}
          aria-expanded={p.navOpened}
          onClick={p.onNavToggle}
        >
          <IconMenu2 size={22} stroke={1.75} />
        </ActionIcon>
        <Group gap={8} align="baseline" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
          <Title order={1} size="h2" lineClamp={1}>
            {p.title}
          </Title>
          {p.unreadCount > 0 && (
            <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
              {t.unreadBadge(p.unreadCount)}
            </Text>
          )}
        </Group>
        <ActionIcon size={44} aria-label={t.searchMail} onClick={p.onSearch}>
          <IconSearch size={22} stroke={1.75} />
        </ActionIcon>
        {userMenu}
      </Group>
    )
  }

  return (
    <Group h="100%" gap={16} px={16} wrap="nowrap">
      <Group gap={8} w={p.layout === 'desktop' ? 208 : undefined} wrap="nowrap">
        <ActionIcon
          size="lg"
          onClick={p.onNavToggle}
          aria-expanded={p.navOpened}
          aria-label={
            p.layout === 'desktop'
              ? p.navOpened
                ? t.collapseFolders
                : t.expandFolders
              : t.openFolders
          }
        >
          <IconMenu2 size={18} stroke={1.75} />
        </ActionIcon>
        {p.layout === 'desktop' && (
          <Group gap={8} wrap="nowrap">
            <ThemeIcon size={26} radius="md" aria-hidden>
              <IconMail size={16} stroke={2} />
            </ThemeIcon>
            <Text fw={700} fz="md" style={{ letterSpacing: '-0.01em' }}>
              {t.appName}
            </Text>
          </Group>
        )}
      </Group>
      <UnstyledButton
        className={classes.searchTrigger}
        onClick={p.onSearch}
        aria-label={t.searchMail}
      >
        <IconSearch size={16} stroke={1.75} />
        <span className={classes.searchLabel}>{t.searchMail}</span>
        <Kbd size="xs">/</Kbd>
      </UnstyledButton>
      <Box style={{ flex: 1 }} />
      {/* Desktop: Compose lives at the top of the folder sidebar and the unread count on the Inbox row. */}
      {p.layout === 'tablet' && (
        <ShortcutTooltip label={t.compose} shortcut="compose">
          <Button
            radius="xl"
            leftSection={<IconPencil size={16} stroke={1.75} />}
            onClick={p.onCompose}
          >
            {t.compose}
          </Button>
        </ShortcutTooltip>
      )}
      {userMenu}
    </Group>
  )
}
