import { fold } from './addressBook'

/** What is needed of a contact to tell whether another one is the same person. */
export type DuplicateCandidate = {
  id: string
  book: string
  name?: string | null
  emails: string[]
  phones: string[]
}

/** "Émile  DURAND" and "emile durand" are the same name. */
function nameKey(name: string | null | undefined): string {
  return fold(name ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * A number written "+33 6 12 34 56 78" or "06 12 34 56 78" is the same phone: the last
 * nine digits are compared. Shorter numbers are compared whole, and the very short ones
 * (an extension, a typo) are left out.
 */
function phoneKey(phone: string): string {
  const digits = phone.replace(/\D+/g, '')
  if (digits.length < 6) return ''
  return digits.length > 9 ? digits.slice(-9) : digits
}

/**
 * For each contact that may be on file twice, the ids of the others: same address,
 * same name or same phone, in the same address book. Nothing is merged from this,
 * it only says where to look.
 */
export function findDuplicates(cards: DuplicateCandidate[]): Map<string, string[]> {
  const buckets = new Map<string, string[]>()
  const add = (book: string, kind: string, key: string, id: string) => {
    if (!key) return
    const bucket = `${book}\n${kind}\n${key}`
    const ids = buckets.get(bucket)
    if (ids) ids.push(id)
    else buckets.set(bucket, [id])
  }

  for (const card of cards) {
    add(card.book, 'name', nameKey(card.name), card.id)
    // A card listing the same address twice is not its own duplicate
    for (const email of new Set(card.emails.map((e) => e.trim().toLowerCase())))
      add(card.book, 'email', email, card.id)
    for (const phone of new Set(card.phones.map(phoneKey))) add(card.book, 'phone', phone, card.id)
  }

  const found = new Map<string, Set<string>>()
  for (const ids of buckets.values()) {
    if (ids.length < 2) continue
    for (const id of ids) {
      let others = found.get(id)
      if (!others) found.set(id, (others = new Set()))
      for (const other of ids) if (other !== id) others.add(other)
    }
  }

  // In the order of the list, so the first one shown is the first one on screen
  const order = new Map(cards.map((card, index) => [card.id, index]))
  const result = new Map<string, string[]>()
  for (const [id, others] of found)
    result.set(
      id,
      [...others].sort((a, b) => order.get(a)! - order.get(b)!),
    )
  return result
}
