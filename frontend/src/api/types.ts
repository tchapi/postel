// Shapes returned by the backend. Keep in sync with backend/src/Imap/Dto.

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
}

export type Address = {
  name?: string
  email: string
}

export type MessageRow = {
  uid: number
  folder: string
  from: Address
  subject: string
  snippet: string
  date: string
  seen: boolean
  flagged: boolean
  hasAttachments: boolean
  size: number
}

export type Attachment = {
  id: string
  name: string
  size: number
  mime: string
  inline: boolean
}

export type Message = MessageRow & {
  to: Address[]
  cc: Address[]
  replyTo?: Address[]
  html?: string
  text?: string
  hasRemoteImages: boolean
  attachments: Attachment[]
}
