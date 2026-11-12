// Shapes the backend sends and accepts. Keep in sync with backend/src.

export type FolderRole = 'inbox' | 'drafts' | 'sent' | 'junk' | 'trash' | 'archive'

export type Folder = {
  id: string
  name: string
  role: FolderRole | null
  unread: number
  total: number
  children: Folder[]
}

export type Me = {
  username: string
  email: string
  displayName: string | null
  logoutUrl: string | null
  /** An address book is configured. Older backends do not send it. */
  contacts?: boolean
}

export type Address = {
  name?: string | null
  email: string
}

export type MessageRow = {
  uid: number
  folder: string
  from: { name?: string; email: string } | null
  subject: string
  snippet: string
  date: string | null
  seen: boolean
  flagged: boolean
  hasAttachments: boolean
  size: number
  threadSize: number
  threadUids: number[]
}

export type MessagePage = {
  items: MessageRow[]
  total: number
  page: number
  perPage: number
}

export type Attachment = {
  id: string
  name: string
  size: number
  mime: string
  inline: boolean
}

export type Message = {
  uid: number
  folder: string
  from: { name?: string; email: string } | null
  to: { name?: string; email: string }[]
  cc: { name?: string; email: string }[]
  bcc: { name?: string; email: string }[]
  replyTo: { name?: string; email: string }[]
  subject: string
  date: string | null
  seen: boolean
  flagged: boolean
  answered: boolean
  draft: boolean
  size: number
  messageId: string | null
  html: string | null
  text: string | null
  hasRemoteImages: boolean
  remoteImagesLoaded: boolean
  attachments: Attachment[]
}

export type Settings = SettingsChange & { updatedAt: string | null }

export type SettingsChange = {
  fromName: string | null
  signature: string | null
  loadRemoteImages: boolean
  density: 'comfortable' | 'compact'
  threads: boolean
  language: 'en' | 'fr'
  accent: string
  allowedSenders: string[]
}

export type MessageRef = { folder: string; uid: number; sections?: string[] }

export type DraftPayload = {
  to: { name?: string; email: string }[]
  cc: { name?: string; email: string }[]
  bcc: { name?: string; email: string }[]
  subject: string
  html: string | null
  uploads: string[]
  inReplyTo?: MessageRef
  forwardOf?: MessageRef
  attachmentsFrom?: MessageRef
  replaces?: MessageRef
}

export type Upload = { id: string; name: string; mime: string; size: number }

/** GET /api/contacts?q= */
export type Contact = { name: string | null; email: string }

/* ---------- address book (GET/POST/PUT/DELETE /api/contacts/…) ---------- */

/** GET /api/contacts/lookup: one entry per address that has a card */
export type LookupEntry = { id?: string; name: string | null; photo: boolean }

export type AddressBook = { id: string; name: string }

export type CardSummary = {
  id: string
  book: string
  etag: string
  name: string | null
  org: string | null
  emails: string[]
  phones: string[]
  photo: boolean
}

/** GET /api/contacts/cards */
export type AddressBookList = { available: boolean; books: AddressBook[]; cards: CardSummary[] }

/** POST /api/contacts/refresh */
export type RefreshResult = { available: boolean; changed: boolean }

export type CardType = 'home' | 'work' | 'cell' | 'other'

export type CardValue = { key: number; value: string; type: CardType | null; label: string | null }

export type CardAddress = {
  key: number
  type: CardType | null
  street: string | null
  city: string | null
  region: string | null
  postalCode: string | null
  country: string | null
}

export type CardUrl = { key: number; value: string }

/** GET /api/contacts/cards/{id}, and the answer to every write */
export type Card = {
  id: string
  book: string
  etag: string
  name: string | null
  firstName: string | null
  lastName: string | null
  org: string | null
  title: string | null
  emails: CardValue[]
  phones: CardValue[]
  addresses: CardAddress[]
  urls: CardUrl[]
  birthday: string | null
  note: string | null
  photo: boolean
}

/**
 * The body of POST (with `book`) and PUT (with `etag`). Entries without `key` are new;
 * an entry of the card whose key is missing is removed.
 */
export type CardInput = {
  book?: string
  etag?: string
  firstName: string | null
  lastName: string | null
  org: string | null
  title: string | null
  emails: { key?: number; value: string; type: CardType }[]
  phones: { key?: number; value: string; type: CardType }[]
  addresses: {
    key?: number
    type: CardType
    street: string | null
    city: string | null
    region: string | null
    postalCode: string | null
    country: string | null
  }[]
  urls: { key?: number; value: string }[]
  birthday: string | null
  note: string | null
}

/** DELETE /api/contacts/cards/{id}: the card as it was, to put it back */
export type DeletedCard = { vcard: string }

/** POST /api/contacts/books/{id}/import */
export type ImportResult = { imported: number; failed: number }
