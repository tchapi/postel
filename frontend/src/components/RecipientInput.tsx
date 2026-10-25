import { useId, useState, type ReactNode } from 'react'
import { Avatar, Combobox, Group, Pill, PillsInput, Stack, Text, useCombobox } from '@mantine/core'
import { useDebouncedValue } from '@mantine/hooks'
import { PlusIcon } from 'lucide-react'
import type { Addr, Contact } from '../types'
import { displayName, initials } from '../lib/format'
import { useI18n } from '../lib/i18n'
import classes from './Composer.module.css'

const EMAIL = /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]+$/

/** Accepts `a@b.c`, `Name <a@b.c>` and lists separated by , or ; */
export function parseAddresses(input: string): Addr[] {
  return input
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = s.match(/^"?([^"<]*)"?\s*<([^>]+)>$/)
      return m ? { name: m[1]!.trim() || undefined, email: m[2]!.trim() } : { email: s }
    })
    .filter((a) => EMAIL.test(a.email))
}

export type RecipientInputProps = {
  label: string
  value: Addr[]
  onChange: (value: Addr[]) => void
  /** Injected data hook: `useContacts(q)` from MailHooks. */
  useContacts: (q: string) => { data?: Contact[]; isFetching?: boolean }
  rightSection?: ReactNode
  autoFocus?: boolean
}

export function RecipientInput({
  label,
  value,
  onChange,
  useContacts,
  rightSection,
  autoFocus,
}: RecipientInputProps) {
  const { t } = useI18n()
  const id = useId()
  const [search, setSearch] = useState('')
  const [debounced] = useDebouncedValue(search, 150)
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
    onDropdownOpen: () => combobox.updateSelectedOptionIndex('active'),
  })
  const { data: contacts = [] } = useContacts(debounced.trim())

  const chosen = new Set(value.map((a) => a.email.toLowerCase()))
  const suggestions = debounced.trim()
    ? contacts.filter((c) => !chosen.has(c.email.toLowerCase())).slice(0, 6)
    : []
  const typed = parseAddresses(search)
  const canAddTyped =
    typed.length > 0 &&
    !suggestions.some((c) => c.email.toLowerCase() === typed[0]?.email.toLowerCase())

  const add = (addrs: Addr[]) => {
    const next = [...value]
    for (const a of addrs)
      if (!next.some((x) => x.email.toLowerCase() === a.email.toLowerCase())) next.push(a)
    onChange(next)
    setSearch('')
  }

  const commitTyped = () => {
    if (typed.length) add(typed)
  }

  return (
    <Group gap={10} wrap="nowrap" className={classes.field} align="center">
      <Text component="label" htmlFor={id} size="sm" c="dimmed" className={classes.fieldLabel}>
        {label}
      </Text>
      <Combobox
        store={combobox}
        onOptionSubmit={(val) => {
          if (val === '__typed') commitTyped()
          else {
            const c = suggestions.find((s) => s.email === val)
            if (c) add([c])
          }
          combobox.closeDropdown()
        }}
      >
        <Combobox.DropdownTarget>
          <PillsInput
            // The wrapper hands its id to the field: set here, so the label targets it
            id={id}
            variant="unstyled"
            style={{ flex: 1 }}
            onClick={() => combobox.openDropdown()}
          >
            <Pill.Group>
              {value.map((a) => (
                <Pill
                  key={a.email}
                  withRemoveButton
                  onRemove={() => onChange(value.filter((x) => x !== a))}
                  removeButtonProps={{ 'aria-label': t.remove(displayName(a)) }}
                  title={a.email}
                  className={classes.pill}
                >
                  {displayName(a)}
                </Pill>
              ))}
              <Combobox.EventsTarget>
                <PillsInput.Field
                  // Mantine's FocusTrap focuses [data-autofocus] when the drawer opens.
                  data-autofocus={autoFocus || undefined}
                  value={search}
                  aria-label={`${label}: ${t.addRecipient}`}
                  onFocus={() => combobox.openDropdown()}
                  onBlur={() => {
                    commitTyped()
                    combobox.closeDropdown()
                  }}
                  onChange={(e) => {
                    combobox.updateSelectedOptionIndex()
                    setSearch(e.currentTarget.value)
                  }}
                  onPaste={(e) => {
                    const pasted = parseAddresses(e.clipboardData.getData('text'))
                    if (pasted.length > 1) {
                      e.preventDefault()
                      add(pasted)
                    }
                  }}
                  onKeyDown={(e) => {
                    if ((e.key === ',' || e.key === ';' || e.key === 'Tab') && typed.length) {
                      if (e.key !== 'Tab') e.preventDefault()
                      commitTyped()
                    } else if (e.key === 'Backspace' && search.length === 0 && value.length) {
                      e.preventDefault()
                      onChange(value.slice(0, -1))
                    }
                  }}
                />
              </Combobox.EventsTarget>
            </Pill.Group>
          </PillsInput>
        </Combobox.DropdownTarget>

        <Combobox.Dropdown hidden={!suggestions.length && !canAddTyped} miw={340}>
          <Combobox.Options>
            {suggestions.map((c) => (
              <Combobox.Option value={c.email} key={c.email}>
                <Group gap={10} wrap="nowrap">
                  <Avatar size={28} radius="xl" color="initials" name={displayName(c)}>
                    {initials(c)}
                  </Avatar>
                  <Stack gap={0} style={{ minWidth: 0 }}>
                    <Text size="sm" truncate>
                      {displayName(c)}
                    </Text>
                    {c.name && (
                      <Text size="xs" c="dimmed" truncate>
                        {c.email}
                      </Text>
                    )}
                  </Stack>
                </Group>
              </Combobox.Option>
            ))}
            {canAddTyped && (
              <Combobox.Option value="__typed">
                <Group gap={10} wrap="nowrap">
                  <PlusIcon size={16} strokeWidth={1.75} />
                  <Text size="sm">{t.addAddress(typed.map((a) => a.email).join(', '))}</Text>
                </Group>
              </Combobox.Option>
            )}
          </Combobox.Options>
          {!suggestions.length && canAddTyped && (
            <Combobox.Footer>
              <Text size="xs" c="dimmed">
                {t.noContactMatch}
              </Text>
            </Combobox.Footer>
          )}
        </Combobox.Dropdown>
      </Combobox>
      {rightSection}
    </Group>
  )
}
