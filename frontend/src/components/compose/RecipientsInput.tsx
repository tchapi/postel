import { TagsInput } from '@mantine/core'

import type { Address } from '../../api/types'

type Props = {
  label: string
  value: Address[]
  onChange: (value: Address[]) => void
  autoFocus?: boolean
}

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/

/** "Name <email>" or a bare address, from what people type or paste. */
export function parseRecipient(input: string): Address | null {
  const text = input.trim()
  const match = /^"?([^"<]*)"?\s*<([^>]+)>$/.exec(text)
  const email = (match ? match[2] : text).trim()
  if (!EMAIL.test(email)) return null
  const name = match?.[1]?.trim()
  return name ? { email, name } : { email }
}

export function formatRecipient(address: Address): string {
  return address.name ? `${address.name} <${address.email}>` : address.email
}

export function RecipientsInput({ label, value, onChange, autoFocus }: Props) {
  return (
    <TagsInput
      label={label}
      size="sm"
      autoFocus={autoFocus}
      value={value.map(formatRecipient)}
      onChange={(tags) => {
        const next: Address[] = []
        for (const tag of tags) {
          const parsed = parseRecipient(tag)
          if (parsed && !next.some((a) => a.email.toLowerCase() === parsed.email.toLowerCase())) {
            next.push(parsed)
          }
        }
        onChange(next)
      }}
      splitChars={[',', ';', ' ']}
      acceptValueOnBlur
      clearable
      placeholder={value.length ? '' : 'name@example.com'}
      styles={{ label: { fontWeight: 400, color: 'var(--mantine-color-dimmed)' } }}
    />
  )
}
