import type { ContactSummary } from '../types'

/** Lower case, without accents: "Émile" and "emile" are the same to the filter and the sort. */
export function fold(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true })

/** By name, accents and case ignored; names that do not start with a letter go last, under #. */
export function sortCards<T extends { name: string }>(cards: T[]): T[] {
  const keyed = cards.map((card) => ({
    card,
    other: letterOf(card.name) === '#',
    key: fold(card.name.trim()),
  }))
  keyed.sort((a, b) => Number(a.other) - Number(b.other) || collator.compare(a.key, b.key))
  return keyed.map((k) => k.card)
}

/** Digits only, so "+33 6 12" finds "+33612…" and the other way round. */
const digits = (value: string) => value.replace(/\D/g, '')

/**
 * Every word of the query must appear somewhere: in the name, the organisation, an email,
 * or, for a word with digits, a phone number.
 */
export function matchesFilter(
  card: ContactSummary,
  query: string,
  dial: (raw: string) => string = (raw) => raw,
): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const text = fold([card.name, card.org, ...card.emails].join('\n'))
  // As typed and as shown: "06 12" and "+33 6 12" both find the same number
  const phones = card.phones.flatMap((phone) => [digits(phone), digits(dial(phone))])
  return words.every((word) => {
    if (text.includes(word)) return true
    const number = digits(word)
    if (!number) return false
    const local = number.replace(/^0+/, '')
    return phones.some(
      (phone) => phone.includes(number) || (local.length > 1 && phone.includes(local)),
    )
  })
}

/** The letter a card is filed under: A to Z, or # for anything else. */
export function letterOf(name: string): string {
  const first = fold(name.trim()).charAt(0).toUpperCase()
  return first >= 'A' && first <= 'Z' ? first : '#'
}

export type ListEntry =
  { kind: 'letter'; letter: string } | { kind: 'card'; card: ContactSummary; index: number }

/** The rows of the list: a heading before each new letter, then its cards. `index` counts cards only. */
export function withLetters(cards: ContactSummary[]): ListEntry[] {
  const out: ListEntry[] = []
  let current: string | null = null
  cards.forEach((card, index) => {
    const letter = letterOf(card.name)
    if (letter !== current) {
      out.push({ kind: 'letter', letter })
      current = letter
    }
    out.push({ kind: 'card', card, index })
  })
  return out
}

/** The dimmed line under a name: the organisation, else the first email, else the first phone. */
export function secondLine(
  card: ContactSummary,
  phone: (raw: string) => string = (raw) => raw,
): string {
  if (card.org && card.org !== card.name) return card.org
  const email = card.emails.find((e) => e !== card.name)
  return email ?? (card.phones[0] ? phone(card.phones[0]) : '')
}

/** A birthday through Intl, without the year when the card does not know it. */
export function formatBirthday(value: string, locale: string): string {
  const full = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (full) {
    const [, y, m, d] = full
    return new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(
      new Date(Number(y), Number(m) - 1, Number(d)),
    )
  }
  const partial = /^--(\d{2})-?(\d{2})$/.exec(value)
  if (partial) {
    const [, m, d] = partial
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' }).format(
      new Date(2000, Number(m) - 1, Number(d)),
    )
  }
  return value
}

/**
 * The fields a save was refused for, from the backend's paths: `addresses[0].region`
 * gives `addresses.region`, `emails[1].value` gives `emails`. Each one once.
 */
export function refusedFields(paths: string[]): string[] {
  const fields = paths.map((path) => {
    const [field = '', part] = path.replace(/\[\d+\]/g, '').split('.')
    return field === 'addresses' && part ? `${field}.${part}` : field
  })
  return [...new Set(fields.filter(Boolean))]
}
