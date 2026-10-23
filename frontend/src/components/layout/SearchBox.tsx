import { CloseButton, Kbd, TextInput } from '@mantine/core'
import { useHotkeys } from '@mantine/hooks'
import { IconSearch } from '@tabler/icons-react'
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { useRef, useState } from 'react'

/**
 * Searches the current folder. The query lives in the URL so the list, the
 * back button and a reload all agree on it.
 */
export function SearchBox() {
  const navigate = useNavigate()
  const { folderId } = useParams({ strict: false })
  const search = useSearch({ strict: false }) as { q?: string }
  const [value, setValue] = useState(search.q ?? '')
  const ref = useRef<HTMLInputElement>(null)

  // The URL is the source of truth: when it changes (folder switch, back
  // button), the field follows. Local state only buffers what is typed.
  const [synced, setSynced] = useState<string | undefined>(search.q)
  if (synced !== search.q) {
    setSynced(search.q)
    setValue(search.q ?? '')
  }

  useHotkeys([['/', () => ref.current?.focus()]])

  const submit = (q: string) => {
    if (!folderId) return
    void navigate({
      to: '/folders/$folderId',
      params: { folderId },
      search: (prev) => ({ ...prev, q: q.trim() || undefined }),
    })
  }

  return (
    <TextInput
      ref={ref}
      size="sm"
      radius="md"
      w="100%"
      maw={520}
      variant="filled"
      placeholder="Search sender, recipient, subject"
      leftSection={<IconSearch size={16} stroke={1.5} />}
      rightSectionPointerEvents={value ? 'all' : 'none'}
      rightSection={
        value ? (
          <CloseButton
            size="xs"
            aria-label="Clear search"
            onClick={() => {
              setValue('')
              submit('')
            }}
          />
        ) : (
          <Kbd visibleFrom="sm">/</Kbd>
        )
      }
      value={value}
      onChange={(event) => setValue(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') submit(value)
        if (event.key === 'Escape') ref.current?.blur()
      }}
      disabled={!folderId}
    />
  )
}
