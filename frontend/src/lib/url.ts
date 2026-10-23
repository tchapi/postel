import type { DatePreset, SearchFilters } from '../types'

/** What the address bar says: one place in the app, shareable and restorable. */
export type AppLocation = {
  view: 'mail' | 'settings'
  folderId: string
  uid: number | null
  search: SearchFilters | null
}

const PRESETS: DatePreset[] = ['any', '7d', '30d', '1y', 'custom']

const segment = (value: string) => encodeURIComponent(value)

/**
 * /folders/<folder>[/<uid>], /settings, /search?q=…&<filters>.
 * Anything else lands on the inbox.
 */
export function parseLocation(pathname: string, query: string): AppLocation {
  const inbox: AppLocation = { view: 'mail', folderId: 'INBOX', uid: null, search: null }
  const parts = pathname.split('/').filter(Boolean).map(decodeURIComponent)

  if (parts[0] === 'settings') return { ...inbox, view: 'settings' }

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
