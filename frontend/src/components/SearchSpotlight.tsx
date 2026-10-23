import { useState, type ReactNode } from 'react'
import { Group, Text } from '@mantine/core'
import { Spotlight } from '@mantine/spotlight'
import { ClockIcon, FolderIcon, SearchIcon } from 'lucide-react'
import { useI18n } from '../lib/i18n'
import type { ShortcutId } from '../lib/shortcuts'
import { KeyCombo } from './ShortcutTooltip'

export type SpotlightFolder = { id: string; label: string; unread: number; icon?: ReactNode }
export type SpotlightCommand = { id: string; label: string; icon: ReactNode; shortcut?: ShortcutId }

export type SearchSpotlightProps = {
  recent: string[]
  folders: SpotlightFolder[]
  commands: SpotlightCommand[]
  onSearch: (query: string) => void
  onGoToFolder: (folderId: string) => void
  onCommand: (commandId: string) => void
}

/** Open with `spotlight.open()` from @mantine/spotlight; ⌘K / Ctrl+K is bound here, `/` by the app shortcut handler. */
export function SearchSpotlight({
  recent,
  folders,
  commands,
  onSearch,
  onGoToFolder,
  onCommand,
}: SearchSpotlightProps) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const match = (s: string) => !q || s.toLowerCase().includes(q)

  const recentItems = recent.filter(match).slice(0, q ? 3 : 5)
  const folderItems = folders.filter((f) => match(f.label)).slice(0, q ? 4 : 6)
  const commandItems = commands.filter((c) => match(c.label))

  // Typing re-selects the first action, so with a query Enter runs "Search for …".
  return (
    <Spotlight.Root
      query={query}
      onQueryChange={setQuery}
      shortcut="mod + K"
      clearQueryOnClose
      scrollable
      maxHeight={520}
    >
      <Spotlight.Search
        placeholder={t.searchPlaceholder}
        leftSection={<SearchIcon size={18} strokeWidth={1.75} />}
        aria-label={t.searchMail}
      />
      <Spotlight.ActionsList>
        {q && (
          <Spotlight.Action
            leftSection={<SearchIcon size={16} strokeWidth={1.75} />}
            label={t.searchFor(query.trim())}
            rightSection={<KeyCombo id="open" />}
            onClick={() => onSearch(query.trim())}
          />
        )}
        {recentItems.length > 0 && (
          <Spotlight.ActionsGroup label={t.recentSearches}>
            {recentItems.map((r) => (
              <Spotlight.Action
                key={r}
                leftSection={<ClockIcon size={16} strokeWidth={1.75} />}
                label={r}
                onClick={() => onSearch(r)}
              />
            ))}
          </Spotlight.ActionsGroup>
        )}
        {folderItems.length > 0 && (
          <Spotlight.ActionsGroup label={t.goToFolder}>
            {folderItems.map((f) => (
              <Spotlight.Action
                key={f.id}
                leftSection={f.icon ?? <FolderIcon size={16} strokeWidth={1.75} />}
                label={f.label}
                rightSection={
                  <Group gap={10} wrap="nowrap">
                    {f.unread > 0 && (
                      <Text size="xs" c="dimmed">
                        {t.unreadBadge(f.unread)}
                      </Text>
                    )}
                    {f.id === 'INBOX' && <KeyCombo id="goInbox" />}
                  </Group>
                }
                onClick={() => onGoToFolder(f.id)}
              />
            ))}
          </Spotlight.ActionsGroup>
        )}
        {commandItems.length > 0 && (
          <Spotlight.ActionsGroup label={t.actions}>
            {commandItems.map((c) => (
              <Spotlight.Action
                key={c.id}
                leftSection={c.icon}
                label={c.label}
                rightSection={c.shortcut ? <KeyCombo id={c.shortcut} /> : undefined}
                onClick={() => onCommand(c.id)}
              />
            ))}
          </Spotlight.ActionsGroup>
        )}
        {!q && !recentItems.length && !folderItems.length && !commandItems.length && (
          <Spotlight.Empty>{t.nothingFound}</Spotlight.Empty>
        )}
      </Spotlight.ActionsList>
    </Spotlight.Root>
  )
}
