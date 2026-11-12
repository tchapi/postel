import type { ContactAddress, ContactInput, ContactUrl, ContactValue } from '../types'

/*
 * The editor's lines carry a `key`: their place on the card the user started from. When
 * the card changes under the editor (someone else saved it, or half of our own save went
 * through), those keys point at the wrong lines of the new card. Saving them as they are
 * would change or remove lines the user never touched.
 *
 * So the user's edits are moved onto the new card first, the way a version control tool
 * does it, from three versions: `base` (the card the user started from), `mine` (the
 * form) and `theirs` (the card as it is now).
 */

type Keyed = { key?: number }

/**
 * One list (emails, phones, addresses, links).
 *
 * - A line the user left alone follows the new card: updated with it, gone with it.
 * - A line the user changed keeps the user's version, on the same line of the new card
 *   when it is still there, as a new line otherwise.
 * - A line the user removed stays removed.
 * - A line the user added stays, joined with the new card's line when both say the same.
 * - Lines added on the new card are added to the form.
 *
 * `identity` says which line of the new card is "the same line" as one of the old card.
 * `same` says whether the user changed a line.
 */
function rebaseList<T extends Keyed>(
  base: T[],
  mine: T[],
  theirs: T[],
  identity: (entry: T) => string,
  same: (a: T, b: T) => boolean,
): T[] {
  const free = new Set(theirs.keys())
  const take = (wanted: string): T | undefined => {
    if (!wanted) return undefined
    for (const index of free) {
      const entry = theirs[index]!
      if (identity(entry) === wanted) {
        free.delete(index)
        return entry
      }
    }
    return undefined
  }

  // Each line of the old card, and where it is on the new one
  const before = new Map<number, { entry: T; now: T | undefined }>()
  for (const entry of base)
    if (entry.key !== undefined) before.set(entry.key, { entry, now: take(identity(entry)) })

  const onNew = (entry: T, now: T | undefined): T =>
    now ? { ...now, ...entry, key: now.key } : { ...entry, key: undefined }

  const out: T[] = []
  for (const entry of mine) {
    const old = entry.key === undefined ? undefined : before.get(entry.key)
    if (!old) out.push(onNew(entry, take(identity(entry))))
    else if (!same(entry, old.entry)) out.push(onNew(entry, old.now))
    else if (old.now) out.push(old.now)
  }
  for (const index of free) out.push(theirs[index]!)
  return out
}

const text = (value: string) => value.trim().toLowerCase()
const digits = (value: string) => value.replace(/\D+/g, '')

const sameValue = (a: ContactValue, b: ContactValue) => a.value === b.value && a.type === b.type

const addressParts = (a: ContactAddress) => [a.street, a.city, a.region, a.postalCode, a.country]
const addressIdentity = (a: ContactAddress) => {
  const parts = addressParts(a).map(text)
  return parts.some(Boolean) ? parts.join('\n') : ''
}
const sameAddress = (a: ContactAddress, b: ContactAddress) =>
  a.type === b.type && addressParts(a).every((part, i) => part === addressParts(b)[i])

/**
 * The form, moved onto the card as it is now. A field the user did not touch takes the
 * new card's value; a field the user changed keeps theirs.
 */
export function rebaseInput(
  base: ContactInput,
  mine: ContactInput,
  theirs: ContactInput,
): ContactInput {
  const field = <K extends 'firstName' | 'lastName' | 'org' | 'title' | 'birthday' | 'note'>(
    name: K,
  ) => (mine[name] === base[name] ? theirs[name] : mine[name])

  return {
    firstName: field('firstName'),
    lastName: field('lastName'),
    org: field('org'),
    title: field('title'),
    birthday: field('birthday'),
    note: field('note'),
    emails: rebaseList(base.emails, mine.emails, theirs.emails, (e) => text(e.value), sameValue),
    phones: rebaseList(
      base.phones,
      mine.phones,
      theirs.phones,
      // A phone is the same phone whatever its spaces and dashes
      (p) => digits(p.value) || text(p.value),
      sameValue,
    ),
    addresses: rebaseList(
      base.addresses,
      mine.addresses,
      theirs.addresses,
      addressIdentity,
      sameAddress,
    ),
    urls: rebaseList(
      base.urls,
      mine.urls,
      theirs.urls,
      (u: ContactUrl) => text(u.value),
      (a, b) => a.value === b.value,
    ),
  }
}
