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
