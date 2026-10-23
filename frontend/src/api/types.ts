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
  from: Address | null
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

export type Message = Omit<
  MessageRow,
  'snippet' | 'hasAttachments' | 'threadSize' | 'threadUids'
> & {
  to: Address[]
  cc: Address[]
  bcc: Address[]
  replyTo: Address[]
  answered: boolean
  draft: boolean
  messageId: string | null
  html: string | null
  text: string | null
  hasRemoteImages: boolean
  remoteImagesLoaded: boolean
  attachments: Attachment[]
}
