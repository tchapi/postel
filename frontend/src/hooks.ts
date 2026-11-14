import { createContext, use } from 'react'
import type { InfiniteData, UseInfiniteQueryResult, UseQueryResult } from '@tanstack/react-query'
import type {
  AddressBookData,
  Contact,
  ContactCard,
  ContactInput,
  DraftInput,
  Folder,
  Message,
  MessagePage,
  MessageRef,
  MessageRow,
  SearchFilters,
  Settings,
  Undo,
} from './types'
import type { KnownContact } from './lib/contacts'

/**
 * Data contract between the components and the API, implemented with TanStack Query in
 * api/mailHooks.ts.
 * Optimistic updates (flags, move, delete) live in the implementation, not in components.
 */
export interface MailActions {
  setFlags(refs: MessageRef[], flags: { seen?: boolean; flagged?: boolean }): Promise<Undo>
  move(refs: MessageRef[], toFolder: string): Promise<Undo>
  /** The archive folder's id, created on the server when the account has none. */
  archiveFolder(): Promise<string>
  /** Moves to Trash, or expunges when already in Trash (no undo then). */
  remove(refs: MessageRef[]): Promise<Undo | undefined>
  send(draft: DraftInput): Promise<void>
  saveDraft(draft: DraftInput): Promise<{ draftUid: number }>
  discardDraft(draftUid: number): Promise<void>
  upload(
    file: File,
    opts: { onProgress: (ratio: number) => void; signal: AbortSignal },
  ): Promise<{ id: string }>
  allowRemoteImages(senderEmail: string): Promise<void>
  refresh(folder: string): Promise<void>
}

/**
 * Why a write to the address book failed:
 * - `changed`: someone changed the card since it was read (reload it, keep the user's input)
 * - `unavailable`: the address book's server cannot be reached
 * - `notFound`: the card is gone
 * - `refused`: the backend does not accept what was typed; `fields` says where
 * - `failed`: anything else, the backend itself included
 */
export type ContactProblem = 'changed' | 'unavailable' | 'notFound' | 'refused' | 'failed'

export class ContactError extends Error {
  readonly problem: ContactProblem
  /** With `refused`, the refused fields as paths: `addresses[0].region`. */
  readonly fields: string[]

  constructor(problem: ContactProblem, fields: string[] = []) {
    super(problem)
    this.problem = problem
    this.fields = fields
  }
}

/** Every write takes the ETag the user saw, so it never overwrites a change made elsewhere. */
export interface ContactActions {
  create(book: string, input: ContactInput): Promise<ContactCard>
  update(id: string, etag: string, input: ContactInput): Promise<ContactCard>
  /** Undo puts the card back as it was, under a new id. */
  remove(card: { id: string; book: string; etag: string }): Promise<Undo>
  setPhoto(id: string, etag: string, jpeg: Blob): Promise<ContactCard>
  removePhoto(id: string, etag: string): Promise<ContactCard>
  /** Sent a few cards at a time; `onProgress` says how many of the file's cards are done. */
  importFile(
    book: string,
    file: File,
    onProgress?: (done: number, total: number) => void,
  ): Promise<{ imported: number; failed: number }>
  /** `keep` takes in what `other` has and `other` is deleted. No undo. */
  merge(
    keep: { id: string; etag: string },
    other: { id: string; etag: string },
  ): Promise<ContactCard>
  /** Asks the backend to sync with the address book now; the list follows if anything changed. */
  refresh(): Promise<{ available: boolean; changed: boolean }>
}

export interface ContactsHooks {
  /** Every card, from the backend's copy; idle when `enabled` is false. */
  useAddressBook(enabled: boolean): UseQueryResult<AddressBookData>
  /** The whole card; idle when `id` is null. Fails with a ContactError. */
  useContactCard(id: string | null): UseQueryResult<ContactCard>
  useContactActions(): ContactActions
}

/** Where the browser finds pictures and downloads. */
export type ContactUrls = {
  photo: (card: { id: string; etag: string }) => string
  cardVcf: (id: string) => string
  bookVcf: (bookId: string) => string
  allVcf: () => string
}

export interface MailHooks extends ContactsHooks {
  useFolders(): UseQueryResult<Folder[]>
  /** 50 rows per page. `search` null = plain folder listing. */
  useMessages(args: {
    folder: string
    search: SearchFilters | null
  }): UseInfiniteQueryResult<InfiniteData<MessagePage>>
  useMessage(ref: MessageRef | null): UseQueryResult<Message>
  /** The message as stored, headers and all; idle when `ref` is null. */
  useRawMessage(ref: MessageRef | null): UseQueryResult<string>
  /** The conversation of a message, oldest first; idle when `ref` is null. */
  useThread(ref: MessageRef | null): UseQueryResult<MessageRow[]>
  useContacts(q: string): UseQueryResult<Contact[]>
  /** Which of these addresses have a contact card, and the name on it. Grows as addresses come by. */
  useContactNames(emails: string[]): ReadonlyMap<string, KnownContact>
  useSettings(): { settings: Settings; update: (patch: Partial<Settings>) => void }
  useRecentSearches(): { recent: string[]; push: (q: string) => void }
  /** `contacts`: an address book is configured; undefined until the session is known. */
  useSession(): {
    name: string
    email: string
    contacts: boolean | undefined
    signOut: () => void
  }
  useMailActions(): MailActions
  /** False while the backend does not answer at all: nothing that needs it should be offered. */
  useServerReachable(): boolean
}

const MailHooksContext = createContext<MailHooks | null>(null)

/** React 19: the context object itself is the provider. */
export const MailHooksProvider = MailHooksContext

export function useMailHooks(): MailHooks {
  const hooks = use(MailHooksContext)
  if (!hooks) throw new Error('useMailHooks must be used inside <MailHooksProvider value={…}>')
  return hooks
}
