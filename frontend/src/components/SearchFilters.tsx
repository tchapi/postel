import { Button, Chip, Group, Menu, SegmentedControl, Stack, TextInput } from '@mantine/core'
import { IconCalendar, IconChevronDown } from '@tabler/icons-react'
import type { DatePreset, SearchFilters as Filters } from '../types'
import { useI18n } from '../lib/i18n'

const PRESETS: DatePreset[] = ['any', '7d', '30d', '1y', 'custom']

export type SearchFiltersProps = {
  value: Filters
  onChange: (patch: Partial<Filters>) => void
  compact?: boolean
}

/** Filter chips for search results: unread, starred, attachments, scope, date range. */
export function SearchFilters({ value, onChange, compact }: SearchFiltersProps) {
  const { t, locale } = useI18n()
  const r = value.range
  const fmt = (iso?: string) =>
    iso ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(iso)) : '…'
  const dateLabel = r.preset === 'custom' ? `${fmt(r.from)} – ${fmt(r.to)}` : t.date[r.preset]

  return (
    <Stack gap={10}>
      <Group
        gap={6}
        role="group"
        aria-label={t.filters}
        wrap={compact ? 'nowrap' : 'wrap'}
        style={compact ? { overflowX: 'auto' } : undefined}
      >
        <Chip
          size="sm"
          variant="outline"
          checked={value.unread}
          onChange={(v) => onChange({ unread: v })}
        >
          {t.unread}
        </Chip>
        <Chip
          size="sm"
          variant="outline"
          checked={value.flagged}
          onChange={(v) => onChange({ flagged: v })}
        >
          {t.starred}
        </Chip>
        <Chip
          size="sm"
          variant="outline"
          checked={value.hasAttachments}
          onChange={(v) => onChange({ hasAttachments: v })}
        >
          {t.hasAttachments}
        </Chip>
      </Group>
      <Group gap={8} wrap="nowrap">
        <SegmentedControl
          size="xs"
          aria-label={t.scope}
          value={value.scope}
          onChange={(v) => onChange({ scope: v as Filters['scope'] })}
          data={[
            { value: 'folder', label: t.thisFolder },
            { value: 'all', label: t.allFolders },
          ]}
        />
        <Menu position="bottom-start" closeOnItemClick={false}>
          <Menu.Target>
            <Button
              variant="default"
              size="xs"
              leftSection={<IconCalendar size={15} stroke={1.75} />}
              rightSection={<IconChevronDown size={14} stroke={2} />}
            >
              {dateLabel}
            </Button>
          </Menu.Target>
          <Menu.Dropdown miw={240}>
            {PRESETS.map((p) => (
              <Menu.Item
                key={p}
                fw={p === r.preset ? 600 : 400}
                aria-checked={p === r.preset}
                role="menuitemradio"
                onClick={() => onChange({ range: { ...r, preset: p } })}
              >
                {t.date[p]}
              </Menu.Item>
            ))}
            {r.preset === 'custom' && (
              <Group gap={8} p={8} wrap="nowrap">
                <TextInput
                  type="date"
                  size="xs"
                  label={t.from}
                  value={r.from ?? ''}
                  onChange={(e) =>
                    onChange({ range: { ...r, from: e.currentTarget.value || undefined } })
                  }
                />
                <TextInput
                  type="date"
                  size="xs"
                  label={t.until}
                  value={r.to ?? ''}
                  onChange={(e) =>
                    onChange({ range: { ...r, to: e.currentTarget.value || undefined } })
                  }
                />
              </Group>
            )}
          </Menu.Dropdown>
        </Menu>
      </Group>
    </Stack>
  )
}
