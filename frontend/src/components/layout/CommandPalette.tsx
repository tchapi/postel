import { Spotlight, type SpotlightActionData } from '@mantine/spotlight'
import { useMantineColorScheme } from '@mantine/core'
import {
  IconFolder,
  IconKeyboard,
  IconMoon,
  IconPencil,
  IconSearch,
  IconSettings,
  IconSun,
} from '@tabler/icons-react'
import { useNavigate } from '@tanstack/react-router'

import { useFolders } from '../../api/queries'
import { flattenFolders } from '../../lib/folders'
import { useComposer } from '../compose/ComposerContext'
import { useAppActions } from './AppActions'

/** ⌘K: jump to a folder or run a command. */
export function CommandPalette() {
  const { data: folders } = useFolders()
  const navigate = useNavigate()
  const composer = useComposer()
  const { openSettings, openShortcuts } = useAppActions()
  const { setColorScheme } = useMantineColorScheme()

  const actions: SpotlightActionData[] = [
    {
      id: 'compose',
      label: 'New message',
      leftSection: <IconPencil size={16} stroke={1.5} />,
      onClick: () => composer.open(),
    },
    ...flattenFolders(folders ?? []).map((folder) => ({
      id: `folder-${folder.id}`,
      label: `Go to ${folder.name}`,
      description: folder.unread > 0 ? `${folder.unread} unread` : undefined,
      leftSection: <IconFolder size={16} stroke={1.5} />,
      onClick: () =>
        void navigate({ to: '/folders/$folderId', params: { folderId: folder.id }, search: {} }),
    })),
    {
      id: 'settings',
      label: 'Settings',
      leftSection: <IconSettings size={16} stroke={1.5} />,
      onClick: openSettings,
    },
    {
      id: 'shortcuts',
      label: 'Keyboard shortcuts',
      leftSection: <IconKeyboard size={16} stroke={1.5} />,
      onClick: openShortcuts,
    },
    {
      id: 'light',
      label: 'Light theme',
      leftSection: <IconSun size={16} stroke={1.5} />,
      onClick: () => setColorScheme('light'),
    },
    {
      id: 'dark',
      label: 'Dark theme',
      leftSection: <IconMoon size={16} stroke={1.5} />,
      onClick: () => setColorScheme('dark'),
    },
  ]

  return (
    <Spotlight
      actions={actions}
      shortcut={['mod + K']}
      nothingFound="Nothing matches"
      highlightQuery
      limit={12}
      searchProps={{
        leftSection: <IconSearch size={18} stroke={1.5} />,
        placeholder: 'Go to a folder, run a command',
      }}
    />
  )
}
