import { type QueryClient, useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useSyncExternalStore } from 'react'

import {
  ContactError,
  type ContactActions,
  type ContactsHooks,
  type ContactUrls,
  type MailHooks,
} from '../hooks'
import { sortCards } from '../lib/addressBook'
import { batchCards, splitCards } from '../lib/vcf'
import type { KnownContact } from '../lib/contacts'
import type {
  AddressBookData,
  ContactCard,
  ContactInput,
  ContactSummary,
  ContactType,
  Undo,
} from '../types'
import { api, ApiError } from './client'
import type * as Dto from './dto'

/*
 * Everything that knows the address book API's shapes lives here and in dto.ts:
 * routes, field names, how the ETag travels, what each error code means.
 */

const BOOK_KEY = ['address-book'] as const
const cardKey = (id: string) => ['contact-card', id] as const

const cardPath = (id: string) => `/contacts/cards/${encodeURIComponent(id)}`
const bookPath = (id: string) => `/contacts/books/${encodeURIComponent(id)}`

export const contactUrls: ContactUrls = {
  // The picture is cached for a year: the ETag in the URL changes with the card
  photo: ({ id, etag }) => `/api${cardPath(id)}/photo?v=${encodeURIComponent(etag)}`,
  cardVcf: (id) => `/api${cardPath(id)}/vcf`,
  bookVcf: (id) => `/api${bookPath(id)}/vcf`,
  allVcf: () => '/api/contacts/vcf',
}

/* ---------- errors ---------- */

function toContactError(error: unknown): ContactError {
  if (error instanceof ContactError) return error
  if (error instanceof ApiError) {
    if (error.code === 'contact_changed' || error.status === 409) return new ContactError('changed')
    if (error.code === 'contacts_unavailable') return new ContactError('unavailable')
    if (error.code === 'contact_not_found') return new ContactError('notFound')
    if (error.fields.length > 0) return new ContactError('refused', error.fields)
  }
  return new ContactError('failed')
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    return await api<T>(path, init)
  } catch (error) {
    throw toContactError(error)
  }
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
  headers: { 'Content-Type': 'application/json' },
})

const multipart = (method: string, fields: Record<string, string | Blob>, fileName?: string) => {
  const body = new FormData()
  for (const [name, value] of Object.entries(fields)) {
    if (typeof value === 'string') body.append(name, value)
    else body.append(name, value, fileName)
  }
  return { method, body }
}

/* ---------- mapping between the API and the interface ---------- */

const TYPES: ContactType[] = ['home', 'work', 'cell', 'other']
const toType = (type: Dto.CardType | null): ContactType =>
  type && TYPES.includes(type) ? type : 'other'

function toSummary(dto: Dto.CardSummary): ContactSummary {
  return {
    id: dto.id,
    book: dto.book,
    etag: dto.etag,
    name: dto.name || dto.org || dto.emails[0] || dto.phones[0] || '',
    org: dto.org ?? '',
    emails: dto.emails,
    phones: dto.phones,
    photo: dto.photo,
  }
}

function toBook(dto: Dto.AddressBookList): AddressBookData {
  return {
    available: dto.available,
    books: dto.books,
    cards: sortCards(dto.cards.map(toSummary)),
  }
}

function toCard(dto: Dto.Card): ContactCard {
  return {
    id: dto.id,
    book: dto.book,
    etag: dto.etag,
    name: dto.name || dto.org || dto.emails[0]?.value || '',
    firstName: dto.firstName ?? '',
    lastName: dto.lastName ?? '',
    org: dto.org ?? '',
    title: dto.title ?? '',
    emails: dto.emails.map((e) => ({
      key: e.key,
      value: e.value,
      type: toType(e.type),
      label: e.label ?? undefined,
    })),
    phones: dto.phones.map((p) => ({
      key: p.key,
      value: p.value,
      type: toType(p.type),
      label: p.label ?? undefined,
    })),
    addresses: dto.addresses.map((a) => ({
      key: a.key,
      type: toType(a.type),
      street: a.street,
      city: a.city,
      region: a.region,
      postalCode: a.postalCode,
      country: a.country,
    })),
    urls: dto.urls.map((u) => ({ key: u.key, value: u.value })),
    birthday: dto.birthday ?? '',
    note: dto.note ?? '',
    photo: dto.photo,
  }
}

/** What a list row needs, from a whole card. */
function summaryOf(card: ContactCard): ContactSummary {
  return {
    id: card.id,
    book: card.book,
    etag: card.etag,
    name: card.name,
    org: card.org,
    emails: card.emails.map((e) => e.value),
    phones: card.phones.map((p) => p.value),
    photo: card.photo,
  }
}

const orNull = (value: string) => value.trim() || null
const withKey = (key: number | undefined) => (key === undefined ? {} : { key })

/** Empty lines are dropped: the editor shows an empty row to type in, the card should not keep it. */
export function fromInput(input: ContactInput): Dto.CardInput {
  return {
    firstName: orNull(input.firstName),
    lastName: orNull(input.lastName),
    org: orNull(input.org),
    title: orNull(input.title),
    emails: input.emails
      .filter((e) => e.value.trim())
      .map((e) => ({ ...withKey(e.key), value: e.value.trim(), type: e.type })),
    phones: input.phones
      .filter((p) => p.value.trim())
      .map((p) => ({ ...withKey(p.key), value: p.value.trim(), type: p.type })),
    addresses: input.addresses
      .filter((a) => [a.street, a.city, a.region, a.postalCode, a.country].some((v) => v.trim()))
      // The parts of an address are always text: an empty part is '', never null
      .map((a) => ({
        ...withKey(a.key),
        type: a.type,
        street: a.street.trim(),
        city: a.city.trim(),
        region: a.region.trim(),
        postalCode: a.postalCode.trim(),
        country: a.country.trim(),
      })),
    urls: input.urls
      .filter((u) => u.value.trim())
      .map((u) => ({ ...withKey(u.key), value: u.value.trim() })),
    birthday: orNull(input.birthday),
    note: input.note.trim() ? input.note : null,
  }
}

/* ---------- names and pictures of the people on screen ---------- */

/*
 * Looked up once per address and kept for the session, in a store outside React so that a
 * write to the address book can mark them all stale. Stale entries stay on screen until their
 * new answer arrives, so names and pictures do not flicker.
 */
type NameEntry = { contact: KnownContact | null; generation: number }
let names = new Map<string, NameEntry>()
let generation = 0
const nameListeners = new Set<() => void>()
const notifyNames = () => nameListeners.forEach((listener) => listener())

const nameStore = {
  get: () => names,
  subscribe: (listener: () => void) => {
    nameListeners.add(listener)
    return () => void nameListeners.delete(listener)
  },
  set(emails: string[], found: Record<string, Dto.LookupEntry>, at: number) {
    names = new Map(names)
    for (const email of emails) {
      const card = found[email]
      names.set(email, {
        generation: at,
        contact: card
          ? {
              email,
              id: card.id,
              name: card.name ?? undefined,
              // The generation in the URL fetches a picture again after a change
              photo: card.photo
                ? `/api/contacts/photo?email=${encodeURIComponent(email)}&v=${at}`
                : undefined,
            }
          : null,
      })
    }
    notifyNames()
  },
  stale() {
    generation += 1
    names = new Map(names)
    notifyNames()
  },
}

function useContactNames(emails: string[]): ReadonlyMap<string, KnownContact> {
  const known = useSyncExternalStore(nameStore.subscribe, nameStore.get)
  const current = generation
  const missing = useMemo(() => {
    const set = new Set<string>()
    for (const e of emails) {
      const email = e.trim().toLowerCase()
      const entry = known.get(email)
      if (email && (!entry || entry.generation < current)) set.add(email)
    }
    return [...set].sort()
  }, [emails, known, current])
  const { data } = useQuery({
    queryKey: ['contact-names', current, missing],
    queryFn: async () => {
      const query = missing.map((e) => `emails[]=${encodeURIComponent(e)}`).join('&')
      return api<Record<string, Dto.LookupEntry>>(`/contacts/lookup?${query}`)
    },
    enabled: missing.length > 0,
    staleTime: Infinity,
  })
  useEffect(() => {
    if (data) nameStore.set(missing, data, current)
  }, [data, missing, current])
  return useMemo(() => {
    const out = new Map<string, KnownContact>()
    for (const [email, entry] of known) if (entry.contact) out.set(email, entry.contact)
    return out
  }, [known])
}

/* ---------- the hooks ---------- */

export function createContactsHooks(
  qc: QueryClient,
): ContactsHooks & Pick<MailHooks, 'useContactNames'> {
  /** After any write: autocomplete and the names on mail may have changed too. */
  const afterWrite = () => {
    void qc.invalidateQueries({ queryKey: ['contacts'] })
    nameStore.stale()
  }

  const patchList = (fn: (cards: ContactSummary[]) => ContactSummary[]) =>
    qc.setQueryData<AddressBookData>(BOOK_KEY, (data) =>
      data ? { ...data, cards: sortCards(fn(data.cards)) } : data,
    )

  /** The server's answer to a write is the card as it now is: the list and the detail follow it. */
  const store = (dto: Dto.Card): ContactCard => {
    const card = toCard(dto)
    qc.setQueryData(cardKey(card.id), card)
    patchList((cards) => [...cards.filter((c) => c.id !== card.id), summaryOf(card)])
    afterWrite()
    return card
  }

  const reloadBook = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: BOOK_KEY }),
      qc.invalidateQueries({ queryKey: ['contact-card'] }),
    ])

  /**
   * A write refused because the card moved on, or is gone: the backend has read it
   * again, so the list and the card are fetched again before the user is told.
   */
  const onCard = async <T>(write: () => Promise<T>): Promise<T> => {
    try {
      return await write()
    } catch (error) {
      const problem = error instanceof ContactError ? error.problem : null
      if (problem === 'changed' || problem === 'notFound') await reloadBook()
      throw error
    }
  }

  const actions: ContactActions = {
    async create(book, input) {
      return store(
        await call<Dto.Card>('/contacts/cards', json('POST', { book, ...fromInput(input) })),
      )
    },

    async update(id, etag, input) {
      return store(
        await onCard(() =>
          call<Dto.Card>(cardPath(id), json('PUT', { etag, ...fromInput(input) })),
        ),
      )
    },

    async remove({ id, book, etag }) {
      const { vcard } = await onCard(() =>
        call<Dto.DeletedCard>(`${cardPath(id)}?etag=${encodeURIComponent(etag)}`, {
          method: 'DELETE',
        }),
      )
      patchList((cards) => cards.filter((c) => c.id !== id))
      qc.removeQueries({ queryKey: cardKey(id) })
      afterWrite()
      const undo: Undo = async () => {
        const file = new File([vcard], 'contact.vcf', { type: 'text/vcard' })
        if ((await actions.importFile(book, file)).imported < 1) throw new ContactError('failed')
      }
      return undo
    },

    async setPhoto(id, etag, jpeg) {
      return store(
        await onCard(() =>
          call<Dto.Card>(
            `${cardPath(id)}/photo`,
            multipart('PUT', { etag, file: jpeg }, 'photo.jpg'),
          ),
        ),
      )
    },

    async removePhoto(id, etag) {
      return store(
        await onCard(() =>
          call<Dto.Card>(`${cardPath(id)}/photo?etag=${encodeURIComponent(etag)}`, {
            method: 'DELETE',
          }),
        ),
      )
    },

    async importFile(book, file, onProgress) {
      const cards = splitCards(await file.text())
      let imported = 0
      let failed = 0
      let done = 0
      try {
        // A few cards at a time: no request runs long, and the user sees how far it is
        for (const batch of batchCards(cards)) {
          const result = await call<Dto.ImportResult>(
            `${bookPath(book)}/import`,
            multipart(
              'POST',
              { file: new Blob([batch.join('')], { type: 'text/vcard' }) },
              'cards.vcf',
            ),
          )
          imported += result.imported
          failed += result.failed
          done += batch.length
          onProgress?.(done, cards.length)
        }
      } catch (error) {
        // Stopped half way: say what went in, the rest did not
        if (imported === 0) throw error
        failed += cards.length - done
      } finally {
        if (done > 0) {
          await reloadBook()
          afterWrite()
        }
      }
      return { imported, failed }
    },

    async merge(keep, other) {
      let dto: Dto.Card
      try {
        dto = await call<Dto.Card>(
          `${cardPath(keep.id)}/merge`,
          json('POST', { etag: keep.etag, other: other.id, otherEtag: other.etag }),
        )
      } catch (error) {
        // Half of it may have gone through: show the cards as they are now
        await reloadBook()
        afterWrite()
        throw error
      }
      patchList((cards) => cards.filter((c) => c.id !== other.id))
      qc.removeQueries({ queryKey: cardKey(other.id) })
      return store(dto)
    },

    async refresh() {
      const result = await call<Dto.RefreshResult>('/contacts/refresh', { method: 'POST' })
      if (result.changed) {
        await reloadBook()
        afterWrite()
      } else {
        qc.setQueryData<AddressBookData>(BOOK_KEY, (data) =>
          data ? { ...data, available: result.available } : data,
        )
      }
      return result
    },
  }

  return {
    useAddressBook: (enabled) =>
      useQuery({
        queryKey: BOOK_KEY,
        queryFn: async () => toBook(await call<Dto.AddressBookList>('/contacts/cards')),
        enabled,
      }),

    useContactCard: (id) =>
      useQuery({
        queryKey: cardKey(id ?? ''),
        queryFn: async () => toCard(await call<Dto.Card>(cardPath(id!))),
        enabled: id !== null,
        // A card that is gone stays gone
        retry: (count, error) =>
          !(error instanceof ContactError && error.problem === 'notFound') && count < 1,
      }),

    useContactActions: () => actions,

    useContactNames,
  }
}
