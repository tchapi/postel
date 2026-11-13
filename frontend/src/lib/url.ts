import type { DatePreset, SearchFilters } from '../types'

/** What the address bar says: one place in the app, shareable and restorable. */
export type AppLocation = {
  view: 'mail' | 'settings' | 'contacts'
  folderId: string
  uid: number | null
  search: SearchFilters | null
  /** The open contact, in the contacts view. */
  contactId: string | null
}

const PRESETS: DatePreset[] = ['any', '7d', '30d', '1y', 'custom']

const segment = (value: string) => encodeURIComponent(value)

// Contact ids are opaque hex from the backend; anything else in the address bar is ignored
const CONTACT_ID = /^[A-Za-z0-9_-]{1,64}$/

/**
 * /folders/<folder>[/<uid>], /settings, /contacts[/<id>], /search?q=…&<filters>.
 * Anything else lands on the inbox.
 */
export function parseLocation(pathname: string, query: string): AppLocation {
  const inbox: AppLocation = {
    view: 'mail',
    folderId: 'INBOX',
    uid: null,
    search: null,
    contactId: null,
  }
  const parts = pathname.split('/').filter(Boolean).map(decodeURIComponent)

  if (parts[0] === 'settings') return { ...inbox, view: 'settings' }

  if (parts[0] === 'contacts') {
    const id = parts[1] ?? ''
    return { ...inbox, view: 'contacts', contactId: CONTACT_ID.test(id) ? id : null }
  }

  if (parts[0] === 'search') {
    const params = new URLSearchParams(query)
    const preset = params.get('range') as DatePreset | null
    return {
      ...inbox,
      folderId: params.get('in') ?? 'INBOX',
      search: {
        query: params.get('q') ?? '',
        unread: params.get('unread') === '1',
        flagged: params.get('flagged') === '1',
        hasAttachments: params.get('attachments') === '1',
        scope: params.has('in') ? 'folder' : 'all',
        range: {
          preset: preset && PRESETS.includes(preset) ? preset : 'any',
          from: params.get('from') ?? undefined,
          to: params.get('to') ?? undefined,
        },
      },
    }
  }

  if (parts[0] === 'folders' && parts[1]) {
    const uid = Number(parts[2])
    return { ...inbox, folderId: parts[1], uid: Number.isInteger(uid) && uid > 0 ? uid : null }
  }

  return inbox
}

export function toUrl(location: AppLocation): string {
  if (location.view === 'settings') return '/settings'

  if (location.view === 'contacts')
    return location.contactId === null ? '/contacts' : `/contacts/${segment(location.contactId)}`

  if (location.search) {
    const { search } = location
    const params = new URLSearchParams()
    if (search.query) params.set('q', search.query)
    if (search.scope === 'folder') params.set('in', location.folderId)
    if (search.unread) params.set('unread', '1')
    if (search.flagged) params.set('flagged', '1')
    if (search.hasAttachments) params.set('attachments', '1')
    if (search.range.preset !== 'any') params.set('range', search.range.preset)
    if (search.range.preset === 'custom') {
      if (search.range.from) params.set('from', search.range.from)
      if (search.range.to) params.set('to', search.range.to)
    }
    return `/search?${params}`
  }

  const folder = `/folders/${segment(location.folderId)}`
  return location.uid === null ? folder : `${folder}/${location.uid}`
}

/** The part of a URL that makes it a new place in the history; the rest is what is open there. */
export function placeOf(url: string): string {
  const path = url.split('?')[0]!.split('/')
  return path.slice(0, path[1] === 'contacts' ? 2 : 3).join('/')
}
