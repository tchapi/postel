// Data shapes from the brief, plus the few UI-side types the components share.
import type { AccentName } from './theme'

export type Addr = { name?: string; email: string }
export type Contact = { name?: string; email: string }

export type FolderRole = 'inbox' | 'drafts' | 'sent' | 'junk' | 'trash' | 'archive'

export type Folder = {
  id: string
  name: string
  role?: FolderRole
  unread: number
  total: number
  children?: Folder[]
}

export type MessageRow = {
  uid: number
  folder: string
  from: { name?: string; email: string }
  subject: string
  snippet: string
  date: string
  seen: boolean
  flagged: boolean
  hasAttachments: boolean
  size: number
  /** Conversation view: how many messages, and all their UIDs, newest last. */
  threadSize?: number
  threadUids?: number[]
}

export type Attachment = { id: string; name: string; size: number; mime: string; inline: boolean }

export type Message = MessageRow & {
  to: Addr[]
  cc: Addr[]
  replyTo?: Addr[]
  html?: string
  text?: string
  hasRemoteImages: boolean
  attachments: Attachment[]
  bcc?: Addr[]
  /** In the Drafts folder: opening it edits it. */
  draft?: boolean
}

/** A message is addressed by folder + IMAP UID. */
export type MessageRef = { folder: string; uid: number }

export type MessagePage = { items: MessageRow[]; nextCursor: number | null; total: number }

export type DatePreset = 'any' | '7d' | '30d' | '1y' | 'custom'
export type DateRange = { preset: DatePreset; from?: string; to?: string }

export type SearchFilters = {
  query: string
  unread: boolean
  flagged: boolean
  hasAttachments: boolean
  scope: 'folder' | 'all'
  range: DateRange
}

export type Density = 'comfortable' | 'compact'
export type RemoteImagesPolicy = 'block' | 'always'
export type Language = 'en' | 'fr'

export type Settings = {
  signatureHtml: string
  density: Density
  remoteImages: RemoteImagesPolicy
  language: Language
  /** Primary colour: buttons, active folder, unread dots, focus ring. */
  accent: AccentName
  allowedSenders: string[]
  /** Name on sent mail, the login's name when empty. */
  fromName: string
  /** Group the list by conversation. */
  threads: boolean
}

export type ComposeMode = 'new' | 'reply' | 'replyAll' | 'forward' | 'draft'

export type DraftInput = {
  to: Addr[]
  cc: Addr[]
  bcc: Addr[]
  subject: string
  html: string
  /** Ids returned by MailActions.upload */
  attachmentIds: string[]
  inReplyTo?: MessageRef
  forwardOf?: MessageRef
  /** Quoted original, appended on send. Shown collapsed in the composer. */
  quotedHtml?: string
  draftUid?: number
}

/** Every mutating action resolves to an undo function, so the UI can offer Undo in a toast. */
export type Undo = () => Promise<void>

export type BulkAction = 'archive' | 'delete' | 'read' | 'unread' | 'star' | 'unstar' | 'junk'
export type RowAction =
  BulkAction | 'open' | 'reply' | 'replyAll' | 'forward' | 'source' | { moveTo: string }
