import { createContext, use } from 'react'
import type { InfiniteData, UseInfiniteQueryResult, UseQueryResult } from '@tanstack/react-query'
import type {
  Contact,
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

/**
 * Data contract. The real app passes TanStack Query hooks backed by the Symfony IMAP proxy;
 * src/mock/mockHooks.ts implements the same contract in memory.
 * Optimistic updates (flags, move, delete) live in the implementation, not in components.
 */
export interface MailActions {
  setFlags(refs: MessageRef[], flags: { seen?: boolean; flagged?: boolean }): Promise<Undo>
  move(refs: MessageRef[], toFolder: string): Promise<Undo>
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

export interface MailHooks {
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
  useSettings(): { settings: Settings; update: (patch: Partial<Settings>) => void }
  useRecentSearches(): { recent: string[]; push: (q: string) => void }
  useSession(): { name: string; email: string; signOut: () => void }
  useMailActions(): MailActions
}

const MailHooksContext = createContext<MailHooks | null>(null)

/** React 19: the context object itself is the provider. */
export const MailHooksProvider = MailHooksContext

export function useMailHooks(): MailHooks {
  const hooks = use(MailHooksContext)
  if (!hooks) throw new Error('useMailHooks must be used inside <MailHooksProvider value={…}>')
  return hooks
}
