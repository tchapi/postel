import {
  keepPreviousData,
  type InfiniteData,
  type QueryClient,
  useInfiniteQuery,
  useQuery,
} from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'

import type { MailActions, MailHooks } from '../hooks'
import { ACCENTS, DEFAULT_ACCENT, type AccentName } from '../theme'
import type {
  DateRange,
  DraftInput,
  Folder,
  Message,
  MessagePage,
  MessageRef,
  MessageRow,
  SearchFilters,
  Settings,
  Undo,
} from '../types'
import { api, serverReachable } from './client'
import type * as Dto from './dto'

const PAGE = 50

/*
 * UIDs are only unique within a folder, and the components key rows by UID.
 * Rows from a search across folders get an encoded UID: the folder's slot
 * above 2^32, the real UID below. The API always gets the real one.
 */
const SLOT = 2 ** 32
const folderSlots: string[] = []
const encodeUid = (folder: string, uid: number) => {
  let slot = folderSlots.indexOf(folder)
  if (slot === -1) slot = folderSlots.push(folder) - 1
  return (slot + 1) * SLOT + uid
}
export const realUid = (uid: number) => (uid >= SLOT ? uid % SLOT : uid)

const json = (method: string, body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
  headers: { 'Content-Type': 'application/json' },
})

const folderPath = (folder: string) => `/folders/${encodeURIComponent(folder)}`

export const rawUrl = (ref: MessageRef, download = false) =>
  `/api${folderPath(ref.folder)}/messages/${realUid(ref.uid)}/raw${download ? '?download=1' : ''}`

export const partUrl = (ref: MessageRef, partId: string, inline: boolean) =>
  `/api${folderPath(ref.folder)}/messages/${realUid(ref.uid)}/parts/${partId}${inline ? '?inline=1' : ''}`

/* ---------- mapping between the API and the interface ---------- */

const EPOCH = new Date(0).toISOString()

function toFolder(folder: Dto.Folder): Folder {
  return {
    id: folder.id,
    name: folder.name,
    role: folder.role ?? undefined,
    unread: folder.unread,
    total: folder.total,
    children: folder.children.map(toFolder),
  }
}

function toRow(row: Dto.MessageRow, encode: boolean): MessageRow {
  return {
    uid: encode ? encodeUid(row.folder, row.uid) : row.uid,
    folder: row.folder,
    from: row.from ?? { email: '' },
    subject: row.subject,
    snippet: row.snippet,
    date: row.date ?? EPOCH,
    seen: row.seen,
    flagged: row.flagged,
    hasAttachments: row.hasAttachments,
    size: row.size,
    threadSize: row.threadSize,
    threadUids: row.threadUids,
  }
}

function toMessage(message: Dto.Message, uid: number): Message {
  return {
    uid,
    folder: message.folder,
    from: message.from ?? { email: '' },
    subject: message.subject,
    snippet: '',
    date: message.date ?? EPOCH,
    seen: message.seen,
    flagged: message.flagged,
    hasAttachments: message.attachments.some((a) => !a.inline),
    size: message.size,
    to: message.to,
    cc: message.cc,
    bcc: message.bcc,
    replyTo: message.replyTo,
    html: message.html ?? undefined,
    text: message.text ?? undefined,
    hasRemoteImages: message.hasRemoteImages,
    attachments: message.attachments,
    draft: message.draft,
  }
}

const DEFAULT_SETTINGS: Settings = {
  signatureHtml: '',
  density: 'comfortable',
  remoteImages: 'block',
  language: 'en',
  accent: DEFAULT_ACCENT,
  allowedSenders: [],
  fromName: '',
  threads: true,
}

function toSettings(dto: Dto.Settings): Settings {
  return {
    signatureHtml: dto.signature ?? '',
    density: dto.density,
    remoteImages: dto.loadRemoteImages ? 'always' : 'block',
    language: dto.language,
    accent: dto.accent in ACCENTS ? (dto.accent as AccentName) : DEFAULT_ACCENT,
    allowedSenders: dto.allowedSenders,
    fromName: dto.fromName ?? '',
    threads: dto.threads,
  }
}

function fromSettings(settings: Settings): Dto.SettingsChange {
  return {
    fromName: settings.fromName.trim() || null,
    signature: settings.signatureHtml.trim() ? settings.signatureHtml : null,
    loadRemoteImages: settings.remoteImages === 'always',
    density: settings.density,
    threads: settings.threads,
    language: settings.language,
    accent: settings.accent,
    allowedSenders: settings.allowedSenders,
  }
}

const isoDay = (date: Date) => date.toISOString().slice(0, 10)

function rangeParams(range: DateRange, params: URLSearchParams) {
  const daysAgo = (n: number) => isoDay(new Date(Date.now() - n * 86_400_000))
  if (range.preset === '7d') params.set('since', daysAgo(7))
  if (range.preset === '30d') params.set('since', daysAgo(30))
  if (range.preset === '1y') params.set('since', daysAgo(365))
  if (range.preset === 'custom') {
    if (range.from) params.set('since', range.from.slice(0, 10))
    // "to" is inclusive, BEFORE is not
    if (range.to) params.set('before', isoDay(new Date(new Date(range.to).getTime() + 86_400_000)))
  }
}

function searchParams(search: SearchFilters | null, threads: boolean): URLSearchParams {
  const params = new URLSearchParams({ perPage: String(PAGE) })
  if (!search) {
    if (threads) params.set('threads', '1')
    return params
  }
  if (search.query.trim()) params.set('q', search.query.trim())
  if (search.unread) params.set('unread', '1')
  if (search.flagged) params.set('flagged', '1')
  if (search.hasAttachments) params.set('attachments', '1')
  rangeParams(search.range, params)
  return params
}

/* ---------- small local stores ---------- */

function createStore<T>(key: string, initial: T) {
  let value = initial
  try {
    const raw = localStorage.getItem(key)
    if (raw) value = JSON.parse(raw) as T
  } catch {
    // private window or storage disabled: defaults it is
  }
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set: (next: T) => {
      value = next
      try {
        localStorage.setItem(key, JSON.stringify(next))
      } catch {
        // same as above
      }
      listeners.forEach((listener) => listener())
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

const recentStore = createStore<string[]>('webmail.recent-searches', [])

/* ---------- optimistic cache updates ---------- */

type ListData = InfiniteData<MessagePage>
const keyOf = (r: { folder: string; uid: number }) => `${r.folder}:${r.uid}`

function patchLists(qc: QueryClient, fn: (row: MessageRow) => MessageRow | null) {
  qc.setQueriesData<ListData>({ queryKey: ['messages'] }, (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((page) => {
            const items = page.items.map(fn).filter((row): row is MessageRow => row !== null)
            return { ...page, items, total: page.total - (page.items.length - items.length) }
          }),
        }
      : data,
  )
}

function cachedRows(qc: QueryClient): MessageRow[] {
  return qc
    .getQueriesData<ListData>({ queryKey: ['messages'] })
    .flatMap(([, data]) => data?.pages.flatMap((page) => page.items) ?? [])
}

function flatFolders(folders: Folder[]): Folder[] {
  return folders.flatMap((folder) => [folder, ...flatFolders(folder.children ?? [])])
}

/* ---------- the hooks ---------- */

export function createMailHooks(qc: QueryClient): MailHooks {
  const invalidate = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['folders'] }),
      qc.invalidateQueries({ queryKey: ['messages'] }),
      qc.invalidateQueries({ queryKey: ['message'] }),
      qc.invalidateQueries({ queryKey: ['thread'] }),
    ])

  const roleFolder = (role: Folder['role']) =>
    flatFolders(qc.getQueryData<Folder[]>(['folders']) ?? []).find((f) => f.role === role)?.id

  /** A conversation row stands for all its messages. Real UIDs, grouped by folder. */
  const expand = (refs: MessageRef[]): Map<string, number[]> => {
    const rows = new Map(cachedRows(qc).map((row) => [keyOf(row), row]))
    const byFolder = new Map<string, number[]>()
    for (const ref of refs) {
      const row = rows.get(keyOf(ref))
      const uids = row?.threadUids?.length ? row.threadUids : [realUid(ref.uid)]
      byFolder.set(ref.folder, [...(byFolder.get(ref.folder) ?? []), ...uids])
    }
    return byFolder
  }

  const settingsQueryKey = ['settings'] as const
  const currentSettings = () => {
    const dto = qc.getQueryData<Dto.Settings>(settingsQueryKey)
    return dto ? toSettings(dto) : DEFAULT_SETTINGS
  }
  const saveSettings = async (patch: Partial<Settings>) => {
    const next = { ...currentSettings(), ...patch }
    const previous = qc.getQueryData<Dto.Settings>(settingsQueryKey)
    qc.setQueryData<Dto.Settings>(settingsQueryKey, (dto) =>
      dto ? { ...dto, ...fromSettings(next) } : dto,
    )
    try {
      qc.setQueryData(
        settingsQueryKey,
        await api<Dto.Settings>('/settings', json('PUT', fromSettings(next))),
      )
    } catch (error) {
      qc.setQueryData(settingsQueryKey, previous)
      throw error
    }
  }

  const draftPayload = (draft: DraftInput): Dto.DraftPayload => {
    const drafts = roleFolder('drafts')
    const replaces = draft.draftUid && drafts ? { folder: drafts, uid: draft.draftUid } : undefined
    return {
      to: draft.to,
      cc: draft.cc,
      bcc: draft.bcc,
      subject: draft.subject,
      html: draft.html + (draft.quotedHtml ?? ''),
      uploads: draft.attachmentIds,
      inReplyTo: draft.inReplyTo && {
        folder: draft.inReplyTo.folder,
        uid: realUid(draft.inReplyTo.uid),
      },
      forwardOf: draft.forwardOf && {
        folder: draft.forwardOf.folder,
        uid: realUid(draft.forwardOf.uid),
      },
      // An edited draft keeps the attachments it already had
      attachmentsFrom: replaces,
      replaces,
    }
  }

  const actions: MailActions = {
    async setFlags(refs, flags) {
      const keys = new Set(refs.map(keyOf))
      const before = cachedRows(qc).filter((row) => keys.has(keyOf(row)))
      patchLists(qc, (row) => (keys.has(keyOf(row)) ? { ...row, ...flags } : row))
      refs.forEach((ref) =>
        qc.setQueriesData<Message>({ queryKey: ['message', ref.folder, ref.uid] }, (m) =>
          m ? { ...m, ...flags } : m,
        ),
      )
      try {
        for (const [folder, uids] of expand(refs)) {
          await api('/messages/flags', json('PATCH', { folder, uids, ...flags }))
        }
      } finally {
        void qc.invalidateQueries({ queryKey: ['folders'] })
      }
      const undo: Undo = async () => {
        for (const row of before) {
          const restore = {
            ...(flags.seen !== undefined && { seen: row.seen }),
            ...(flags.flagged !== undefined && { flagged: row.flagged }),
          }
          await actions.setFlags([{ folder: row.folder, uid: row.uid }], restore)
        }
      }
      return undo
    },

    async move(refs, toFolder) {
      const keys = new Set(refs.map(keyOf))
      patchLists(qc, (row) => (keys.has(keyOf(row)) ? null : row))
      const moved: { from: string; uids: number[] }[] = []
      try {
        for (const [folder, uids] of expand(refs)) {
          const result = await api<{ uids: number[] }>(
            '/messages/move',
            json('POST', { folder, uids, to: toFolder }),
          )
          moved.push({ from: folder, uids: result.uids })
        }
      } finally {
        void invalidate()
      }
      return async () => {
        for (const { from, uids } of moved) {
          if (uids.length)
            await api('/messages/move', json('POST', { folder: toFolder, uids, to: from }))
        }
        await invalidate()
      }
    },

    async remove(refs) {
      const trash = roleFolder('trash')
      const inTrash = refs.filter((ref) => ref.folder === trash)
      const others = refs.filter((ref) => ref.folder !== trash)
      let undo: Undo | undefined
      if (others.length && trash) undo = await actions.move(others, trash)
      if (inTrash.length) {
        const keys = new Set(inTrash.map(keyOf))
        patchLists(qc, (row) => (keys.has(keyOf(row)) ? null : row))
        try {
          for (const [folder, uids] of expand(inTrash)) {
            await api('/messages/delete', json('POST', { folder, uids }))
          }
        } finally {
          void invalidate()
        }
      }
      return inTrash.length ? undefined : undo
    },

    async send(draft) {
      await api('/send', json('POST', draftPayload(draft)))
      void invalidate()
    },

    async saveDraft(draft) {
      const saved = await api<{ folder: string; uid: number }>(
        '/drafts',
        json('PUT', draftPayload(draft)),
      )
      void invalidate()
      return { draftUid: saved.uid }
    },

    async discardDraft(draftUid) {
      const drafts = roleFolder('drafts')
      if (!drafts) return
      await api('/messages/delete', json('POST', { folder: drafts, uids: [draftUid] }))
      void invalidate()
    },

    upload(file, { onProgress, signal }) {
      return new Promise((resolve, reject) => {
        const request = new XMLHttpRequest()
        request.open('POST', '/api/uploads')
        request.responseType = 'json'
        request.upload.onprogress = (event) => {
          if (event.lengthComputable) onProgress(event.loaded / event.total)
        }
        request.onload = () => {
          if (request.status === 201) resolve({ id: (request.response as Dto.Upload).id })
          else reject(new Error(`upload failed: ${request.status}`))
        }
        request.onerror = () => reject(new Error('upload failed'))
        request.onabort = () => reject(new DOMException('Aborted', 'AbortError'))
        signal.addEventListener('abort', () => request.abort())
        const body = new FormData()
        body.append('file', file)
        request.send(body)
      })
    },

    async allowRemoteImages(senderEmail) {
      const { allowedSenders } = currentSettings()
      const email = senderEmail.toLowerCase()
      if (!allowedSenders.includes(email))
        await saveSettings({ allowedSenders: [...allowedSenders, email] })
    },

    async refresh() {
      await invalidate()
    },
  }

  return {
    useFolders: () =>
      useQuery({
        queryKey: ['folders'],
        queryFn: async () => (await api<Dto.Folder[]>('/folders')).map(toFolder),
        refetchInterval: 30_000,
      }),

    useMessages: ({ folder, search }) => {
      const settings = useQuery({
        queryKey: settingsQueryKey,
        queryFn: () => api<Dto.Settings>('/settings'),
        select: (dto) => dto.threads,
      })
      const threads = settings.data
      const all = search?.scope === 'all'
      const params = searchParams(search, threads ?? false)
      return useInfiniteQuery({
        queryKey: ['messages', all ? '*' : folder, params.toString()],
        queryFn: async ({ pageParam }): Promise<MessagePage> => {
          const path = all ? '/search' : `${folderPath(folder)}/messages`
          const page = await api<Dto.MessagePage>(`${path}?${params}&page=${pageParam}`)
          return {
            items: page.items.map((row) => toRow(row, all)),
            total: page.total,
            nextCursor: page.items.length < page.perPage ? null : page.page + 1,
          }
        },
        initialPageParam: 1,
        getNextPageParam: (last) => last.nextCursor,
        // Without settings (the server is away) the list still loads, or fails and says so
        enabled: threads !== undefined || settings.isError || search !== null,
      })
    },

    useMessage: (ref) =>
      useQuery({
        queryKey: ['message', ref?.folder, ref?.uid],
        enabled: ref !== null,
        queryFn: async () => {
          const r = ref!
          // Remote images come along; the reader's frame blocks them until the user allows them.
          const dto = await api<Dto.Message>(
            `${folderPath(r.folder)}/messages/${realUid(r.uid)}?images=1`,
          )
          return toMessage(dto, r.uid)
        },
      }),

    useRawMessage: (ref) =>
      useQuery({
        queryKey: ['raw', ref?.folder, ref?.uid],
        enabled: ref !== null,
        staleTime: Infinity,
        queryFn: async () => {
          const response = await fetch(rawUrl(ref!))
          if (!response.ok) throw new Error(`raw source: ${response.status}`)
          return response.text()
        },
      }),

    useThread: (ref) =>
      useQuery({
        queryKey: ['thread', ref?.folder, ref?.uid],
        enabled: ref !== null,
        queryFn: async () => {
          const r = ref!
          const rows = await api<Dto.MessageRow[]>(
            `${folderPath(r.folder)}/messages/${realUid(r.uid)}/thread`,
          )
          return rows.map((row) => toRow(row, false))
        },
      }),

    useContacts: (q) =>
      useQuery({
        queryKey: ['contacts', q],
        // The backend answers from its cache of the Davis address books, an empty list without Davis
        queryFn: async () =>
          (await api<Dto.Contact[]>(`/contacts?q=${encodeURIComponent(q)}`)).map((c) => ({
            email: c.email,
            name: c.name ?? undefined,
          })),
        enabled: q.length > 0,
        staleTime: 60_000,
        placeholderData: keepPreviousData,
      }),

    useSettings: () => {
      const { data } = useQuery({
        queryKey: settingsQueryKey,
        queryFn: () => api<Dto.Settings>('/settings'),
        staleTime: Infinity,
      })
      return {
        settings: data ? toSettings(data) : DEFAULT_SETTINGS,
        update: (patch) => void saveSettings(patch).catch(() => undefined),
      }
    },

    useRecentSearches: () => {
      const recent = useSyncExternalStore(recentStore.subscribe, recentStore.get)
      return {
        recent,
        push: (q) => recentStore.set([q, ...recent.filter((item) => item !== q)].slice(0, 8)),
      }
    },

    useServerReachable: () => useSyncExternalStore(serverReachable.subscribe, serverReachable.get),

    useSession: () => {
      const { data } = useQuery({
        queryKey: ['me'],
        queryFn: () => api<Dto.Me>('/me'),
        staleTime: Infinity,
      })
      return {
        name: data?.displayName ?? data?.username ?? '',
        email: data?.email ?? '',
        signOut: () => {
          if (data?.logoutUrl) window.location.assign(data.logoutUrl)
          else window.location.reload()
        },
      }
    },

    useMailActions: () => actions,
  }
}
