import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Group, Text, useComputedColorScheme, useMantineColorScheme } from '@mantine/core'
import { useLocalStorage, useMediaQuery, useNetwork } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { spotlight } from '@mantine/spotlight'
import {
  IconAdjustmentsHorizontal,
  IconAlertCircle,
  IconCheck,
  IconKeyboard,
  IconMoon,
  IconPencil,
  IconSend,
  IconWifiOff,
} from '@tabler/icons-react'
import { rawUrl, realUid } from './api/mailHooks'
import { useMailHooks } from './hooks'
import type {
  Attachment,
  ComposeMode,
  DraftInput,
  Folder,
  Message,
  MessageRef,
  MessageRow,
  RowAction,
  SearchFilters as Filters,
  Undo,
} from './types'
import { I18nContext, STRINGS } from './lib/i18n'
import { absoluteDate, displayName } from './lib/format'
import { useMailShortcuts } from './lib/shortcuts'
import { parseLocation, toUrl } from './lib/url'
import { DEFAULT_NAV, MailAppShell, type Layout } from './components/AppShell'
import { TopBar } from './components/TopBar'
import { FolderNav, sortFolders } from './components/FolderNav'
import { MessageList } from './components/MessageList'
import { Reader } from './components/Reader'
import { SearchSpotlight } from './components/SearchSpotlight'
import { SearchFilters } from './components/SearchFilters'
import type { ColorSchemeSetting } from './components/Settings'
import { RawMessageModal } from './components/RawMessageModal'
import { ShortcutsHelp } from './components/ShortcutsHelp'
import { EarlierMessage, EarlierMessages } from './components/Conversation'
import { toMoveTargets } from './components/MoveMenu'

// Tiptap only loads when someone writes or opens settings.
const Composer = lazy(() => import('./components/Composer').then((m) => ({ default: m.Composer })))
const Settings = lazy(() => import('./components/Settings').then((m) => ({ default: m.Settings })))

const SEND_DELAY_S = 5

type ComposeSession = { key: number; mode: ComposeMode; initial: DraftInput; quotedLabel?: string }

const EMPTY_SEARCH: Omit<Filters, 'query'> = {
  unread: false,
  flagged: false,
  hasAttachments: false,
  scope: 'all',
  range: { preset: 'any' },
}

function flatten(folders: Folder[]): Folder[] {
  return folders.flatMap((f) => [f, ...flatten(f.children ?? [])])
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

export type MailAppProps = {
  /** Where attachments are served from. Defaults to the proxy's REST shape. */
  attachmentUrl?: (ref: MessageRef, a: Attachment, disposition: 'inline' | 'download') => string
}

export function MailApp({
  attachmentUrl = (ref, a, d) =>
    `/api/folders/${encodeURIComponent(ref.folder)}/messages/${ref.uid}/attachments/${encodeURIComponent(a.id)}?disposition=${d}`,
}: MailAppProps) {
  const hooks = useMailHooks()
  const { settings, update: updateSettings } = hooks.useSettings()
  const { recent, push: pushRecent } = hooks.useRecentSearches()
  const session = hooks.useSession()
  const actions = hooks.useMailActions()
  const foldersQuery = hooks.useFolders()

  const t = STRINGS[settings.language]
  const locale = settings.language === 'fr' ? 'fr-FR' : 'en-GB'
  const i18n = useMemo(() => ({ t, locale }), [t, locale])

  /* ---------- layout ---------- */
  const isDesktop = useMediaQuery('(min-width: 75em)', true, { getInitialValueInEffect: false })
  const isMobile = useMediaQuery('(max-width: 47.99em)', false, { getInitialValueInEffect: false })
  const layout: Layout = isDesktop ? 'desktop' : isMobile ? 'mobile' : 'tablet'
  // Layout preferences belong to this screen, so this browser remembers them
  const [navCollapsed, setNavCollapsed] = useLocalStorage({
    key: 'webmail.nav-collapsed',
    defaultValue: false,
  })
  const [navWidth, setNavWidth] = useLocalStorage({
    key: 'webmail.nav-width',
    defaultValue: DEFAULT_NAV,
  })
  const [drawerOpened, setDrawerOpened] = useState(false)
  const [listWidth, setListWidth] = useLocalStorage({
    key: 'webmail.list-width',
    defaultValue: 380,
  })

  /* ---------- theme ---------- */
  const { colorScheme, setColorScheme } = useMantineColorScheme()
  const computed = useComputedColorScheme('light')

  /* ---------- navigation state ---------- */
  const [initial] = useState(() => parseLocation(window.location.pathname, window.location.search))
  const [folderId, setFolderId] = useState(initial.folderId)
  const [search, setSearch] = useState<Filters | null>(initial.search)
  const [activeUid, setActiveUid] = useState<number | null>(initial.uid)
  const [mobileReader, setMobileReader] = useState(initial.uid !== null)
  const [selected, setSelected] = useState<Set<number>>(() => new Set())
  const anchor = useRef<number | null>(null)
  const [view, setView] = useState<'mail' | 'settings'>(initial.view)
  const [helpOpen, setHelpOpen] = useState(false)
  const [sourceRef, setSourceRef] = useState<MessageRef | null>(null)
  const sourceQuery = hooks.useRawMessage(sourceRef)
  const [compose, setCompose] = useState<ComposeSession | null>(null)
  const composeKey = useRef(0)

  const allFolders = useMemo(() => flatten(foldersQuery.data ?? []), [foldersQuery.data])
  const folderById = useMemo(() => new Map(allFolders.map((f) => [f.id, f])), [allFolders])
  const labelOf = useCallback((f: Folder) => (f.role ? t.folderRole[f.role] : f.name), [t])
  const labelOfId = (id: string) => {
    const f = folderById.get(id)
    return f ? labelOf(f) : id
  }
  const roleId = (role: Folder['role']) => allFolders.find((f) => f.role === role)?.id
  const currentFolder = folderById.get(folderId)

  /* ---------- data ---------- */
  const messagesQuery = hooks.useMessages({ folder: folderId, search })
  const rows = useMemo(
    () => messagesQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [messagesQuery.data],
  )
  const total = messagesQuery.data?.pages[0]?.total ?? 0
  const rowByUid = useMemo(() => new Map(rows.map((r) => [r.uid, r])), [rows])
  const refOf = (uid: number): MessageRef | null => {
    const r = rowByUid.get(uid)
    return r ? { folder: r.folder, uid: r.uid } : null
  }

  const readerUid =
    layout === 'mobile' ? (mobileReader ? activeUid : null) : selected.size > 1 ? null : activeUid
  const readerRef = readerUid !== null ? refOf(readerUid) : null
  const messageQuery = hooks.useMessage(readerRef)
  const readerRow = readerUid !== null ? rowByUid.get(readerUid) : undefined
  const threadQuery = hooks.useThread(
    readerRow && (readerRow.threadSize ?? 1) > 1 ? readerRef : null,
  )
  const earlierRows = (threadQuery.data ?? []).filter((row) => row.uid !== readerRow?.uid)
  const message = messageQuery.data

  // Opening marks as read (silently, no toast).
  useEffect(() => {
    if (message && !message.seen)
      void actions
        .setFlags([{ folder: message.folder, uid: message.uid }], { seen: true })
        .catch(() => {})
  }, [message, actions])

  // Reset per-folder state when the folder or search really changes, unless the address
  // bar changed it: then it brings its own message. Comparing values, not counting runs,
  // keeps React's double effects in development from eating the message of a shared link.
  const fromUrl = useRef(false)
  const shownPlace = useRef(JSON.stringify({ folderId, search }))
  useEffect(() => {
    const current = JSON.stringify({ folderId, search })
    if (current === shownPlace.current) return
    shownPlace.current = current
    if (fromUrl.current) {
      fromUrl.current = false
      return
    }
    setSelected(new Set())
    setActiveUid(null)
    setMobileReader(false)
  }, [folderId, search])

  // The address bar follows the app: a new place is a new history entry, opening a message replaces it.
  const lastUrl = useRef(toUrl(initial))
  useEffect(() => {
    const url = toUrl({ view, folderId, uid: search ? null : activeUid, search })
    if (url === lastUrl.current) return
    const samePlace =
      url.split('?')[0]!.split('/').slice(0, 3).join('/') ===
      lastUrl.current.split('?')[0]!.split('/').slice(0, 3).join('/')
    if (samePlace && !url.startsWith('/search')) window.history.replaceState(null, '', url)
    else window.history.pushState(null, '', url)
    lastUrl.current = url
  }, [view, folderId, activeUid, search])

  // Back and forward: the app follows the address bar.
  const place = useRef({ folderId, search })
  useEffect(() => {
    place.current = { folderId, search }
  }, [folderId, search])
  useEffect(() => {
    const onPop = () => {
      const location = parseLocation(window.location.pathname, window.location.search)
      lastUrl.current = toUrl(location)
      // Only a new folder or search triggers the reset that this flag skips
      fromUrl.current =
        location.folderId !== place.current.folderId ||
        JSON.stringify(location.search) !== JSON.stringify(place.current.search)
      setMobileReader(location.uid !== null)
      setView(location.view)
      setFolderId(location.folderId)
      setSearch(location.search)
      setActiveUid(location.uid)
      setSelected(new Set())
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  /* ---------- feedback ---------- */
  const notifyUndo = useCallback(
    (message: string, undo?: Undo) => {
      const id = notifications.show({
        message: (
          <Group gap={12} justify="space-between" wrap="nowrap">
            <Text size="sm">{message}</Text>
            {undo && (
              <Button
                variant="subtle"
                color="gray"
                size="compact-sm"
                onClick={() => {
                  notifications.hide(id)
                  undo().catch(() => notifications.show({ color: 'red', message: t.actionFailed }))
                }}
              >
                {t.undo}
              </Button>
            )}
          </Group>
        ),
        icon: <IconCheck size={18} />,
        color: 'gray',
        autoClose: 6000,
      })
    },
    [t],
  )
  const notifyError = useCallback(
    () =>
      notifications.show({
        color: 'red',
        icon: <IconAlertCircle size={18} />,
        message: t.actionFailed,
      }),
    [t],
  )

  const { online } = useNetwork()
  const wasOnline = useRef(true)
  useEffect(() => {
    if (!online) {
      notifications.show({
        id: 'offline',
        message: t.offline,
        icon: <IconWifiOff size={18} />,
        color: 'gray',
        autoClose: false,
        withCloseButton: false,
      })
    } else if (!wasOnline.current) {
      notifications.hide('offline')
      notifications.show({ message: t.backOnline, color: 'gray', autoClose: 3000 })
    }
    wasOnline.current = online
  }, [online, t])

  /* ---------- compose ---------- */
  const openCompose = useCallback(
    (mode: ComposeMode, source?: Message, draft?: DraftInput) => {
      composeKey.current += 1
      const empty: DraftInput = {
        to: [],
        cc: [],
        bcc: [],
        subject: '',
        html: '',
        attachmentIds: [],
      }
      if (mode === 'draft' && source) {
        setCompose({
          key: composeKey.current,
          mode,
          initial: {
            ...empty,
            to: source.to,
            cc: source.cc,
            bcc: source.bcc ?? [],
            subject: source.subject,
            html: source.html ?? (source.text ? `<pre>${escapeHtml(source.text)}</pre>` : ''),
            draftUid: realUid(source.uid),
          },
        })
        return
      }
      if (draft || !source) {
        setCompose({ key: composeKey.current, mode, initial: draft ?? empty })
        return
      }
      const self = session.email.toLowerCase()
      const notSelf = (a: { email: string }) => a.email.toLowerCase() !== self
      const prefix = mode === 'forward' ? 'Fwd: ' : 'Re: '
      const subject = source.subject.toLowerCase().startsWith(prefix.toLowerCase())
        ? source.subject
        : prefix + source.subject
      const header = `${absoluteDate(source.date, locale)}, ${escapeHtml(displayName(source.from))} &lt;${escapeHtml(source.from.email)}&gt;`
      const body = source.html ?? `<pre>${escapeHtml(source.text ?? '')}</pre>`
      const replyTo = source.replyTo?.length ? source.replyTo : [source.from]
      setCompose({
        key: composeKey.current,
        mode,
        quotedLabel: `${displayName(source.from)}, ${new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(source.date))}`,
        initial: {
          ...empty,
          to:
            mode === 'forward'
              ? []
              : mode === 'replyAll'
                ? [...replyTo, ...source.to.filter(notSelf)]
                : replyTo,
          cc: mode === 'replyAll' ? source.cc.filter(notSelf) : [],
          subject,
          ...(mode === 'forward'
            ? { forwardOf: { folder: source.folder, uid: source.uid } }
            : { inReplyTo: { folder: source.folder, uid: source.uid } }),
          quotedHtml: `<p>${header}</p><blockquote type="cite">${body}</blockquote>`,
        },
      })
    },
    [session.email, locale],
  )

  const [pendingCompose, setPendingCompose] = useState<{ mode: ComposeMode; uid: number } | null>(
    null,
  )
  useEffect(() => {
    if (pendingCompose && message?.uid === pendingCompose.uid) {
      openCompose(pendingCompose.mode, message)
      setPendingCompose(null)
    }
  }, [pendingCompose, message, openCompose])

  const sendWithUndo = (draft: DraftInput) => {
    setCompose(null)
    const id = `send-${Date.now()}`
    let left = SEND_DELAY_S
    let cancelled = false
    const render = () => (
      <Group gap={12} justify="space-between" wrap="nowrap">
        <Text size="sm">{t.sendingIn(left)}</Text>
        <Button
          variant="subtle"
          color="gray"
          size="compact-sm"
          onClick={() => {
            cancelled = true
            window.clearInterval(timer)
            notifications.hide(id)
            openCompose('draft', undefined, draft)
          }}
        >
          {t.undo}
        </Button>
      </Group>
    )
    notifications.show({
      id,
      message: render(),
      icon: <IconSend size={18} />,
      color: 'gray',
      autoClose: false,
    })
    const timer = window.setInterval(() => {
      left -= 1
      if (cancelled) return
      if (left > 0) {
        notifications.update({
          id,
          message: render(),
          icon: <IconSend size={18} />,
          color: 'gray',
          autoClose: false,
        })
        return
      }
      window.clearInterval(timer)
      actions
        .send(draft)
        .then(() =>
          notifications.update({
            id,
            message: t.sent,
            icon: <IconCheck size={18} />,
            color: 'gray',
            autoClose: 3000,
          }),
        )
        .catch(() => {
          notifications.update({
            id,
            message: t.sendFailed,
            icon: <IconAlertCircle size={18} />,
            color: 'red',
            autoClose: 6000,
          })
          void actions.saveDraft(draft)
        })
    }, 1000)
  }

  /* ---------- actions ---------- */
  const moveActiveAfter = (removed: number[]) => {
    if (activeUid === null || !removed.includes(activeUid)) return
    const idx = rows.findIndex((r) => r.uid === activeUid)
    const next =
      rows.slice(idx + 1).find((r) => !removed.includes(r.uid)) ??
      rows
        .slice(0, idx)
        .reverse()
        .find((r) => !removed.includes(r.uid))
    setActiveUid(next?.uid ?? null)
    if (layout === 'mobile') setMobileReader(false)
  }

  const runAction = async (action: RowAction, uids: number[]) => {
    const refs = uids.map(refOf).filter((r): r is MessageRef => r !== null)
    if (!refs.length) return
    const n = refs.length
    const first = refs[0]!
    const sourceMessage = message && message.uid === first.uid ? message : undefined

    try {
      if (action === 'open') {
        setActiveUid(first.uid)
        if (layout === 'mobile') setMobileReader(true)
        // A draft opens in the composer
        if (first.folder === roleId('drafts')) {
          if (sourceMessage) openCompose('draft', sourceMessage)
          else setPendingCompose({ mode: 'draft', uid: first.uid })
        }
        return
      }
      if (action === 'reply' || action === 'replyAll' || action === 'forward') {
        if (sourceMessage) openCompose(action, sourceMessage)
        else {
          // Load it in the reader first; the effect below opens the composer once it arrives.
          setActiveUid(first.uid)
          if (layout === 'mobile') setMobileReader(true)
          setPendingCompose({ mode: action, uid: first.uid })
        }
        return
      }
      if (action === 'read' || action === 'unread') {
        await actions.setFlags(refs, { seen: action === 'read' })
        return
      }
      if (action === 'star' || action === 'unstar') {
        await actions.setFlags(refs, { flagged: action === 'star' })
        return
      }
      setSelected(new Set())
      moveActiveAfter(uids)
      if (action === 'delete') {
        notifyUndo(t.deleted(n), await actions.remove(refs))
        return
      }
      const target =
        action === 'archive'
          ? roleId('archive')
          : action === 'junk'
            ? roleId('junk')
            : typeof action === 'object'
              ? action.moveTo
              : undefined
      if (!target) return
      const undo = await actions.move(refs, target)
      notifyUndo(
        action === 'archive'
          ? t.archived(n)
          : action === 'junk'
            ? t.markedJunk(n)
            : t.moved(n, labelOfId(target)),
        undo,
      )
    } catch {
      notifyError()
    }
  }

  const targetUids = () => (selected.size ? [...selected] : activeUid !== null ? [activeUid] : [])

  const step = (delta: 1 | -1) => {
    if (!rows.length) return
    const idx = activeUid === null ? -1 : rows.findIndex((r) => r.uid === activeUid)
    const next = rows[Math.min(rows.length - 1, Math.max(0, idx + delta))]
    if (next) setActiveUid(next.uid)
  }

  const toggleSelect = (uid: number, range: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (range && anchor.current !== null) {
        const a = rows.findIndex((r) => r.uid === anchor.current)
        const b = rows.findIndex((r) => r.uid === uid)
        const [lo, hi] = a < b ? [a, b] : [b, a]
        rows.slice(lo, hi + 1).forEach((r) => next.add(r.uid))
      } else if (next.has(uid)) next.delete(uid)
      else next.add(uid)
      anchor.current = uid
      return next
    })
  }

  const goFolder = (id: string) => {
    setFolderId(id)
    setSearch(null)
    setView('mail')
    setDrawerOpened(false)
  }

  const runSearch = (query: string) => {
    pushRecent(query)
    setSearch({ query, ...EMPTY_SEARCH })
    setView('mail')
  }

  const toggleTheme = () => setColorScheme(computed === 'dark' ? 'light' : 'dark')

  /* ---------- keyboard ---------- */
  useMailShortcuts(
    {
      next: () => step(1),
      prev: () => step(-1),
      open: () => activeUid !== null && runAction('open', [activeUid]),
      close: () => {
        if (selected.size) setSelected(new Set())
        else if (layout === 'mobile' && mobileReader) setMobileReader(false)
        else if (view === 'settings') setView('mail')
        else if (search) setSearch(null)
      },
      reply: () => message && openCompose('reply', message),
      replyAll: () => message && openCompose('replyAll', message),
      forward: () => message && openCompose('forward', message),
      archive: () => void runAction('archive', targetUids()),
      delete: () => void runAction('delete', targetUids()),
      star: () => {
        const uids = targetUids()
        const allStarred = uids.every((u) => rowByUid.get(u)?.flagged)
        void runAction(allStarred ? 'unstar' : 'star', uids)
      },
      unread: () => void runAction('unread', targetUids()),
      compose: () => openCompose('new'),
      search: () => spotlight.open(),
      goInbox: () => goFolder(roleId('inbox') ?? 'INBOX'),
      help: () => setHelpOpen(true),
    },
    compose === null && !helpOpen,
  )

  /* ---------- derived props ---------- */
  const { system, custom } = sortFolders(foldersQuery.data ?? [])
  const moveTargets = toMoveTargets(system, custom, labelOf, search ? undefined : folderId)
  const inboxUnread = allFolders.find((f) => f.role === 'inbox')?.unread ?? 0
  const folderTitle = currentFolder ? labelOf(currentFolder) : ''
  const remoteAllowed =
    !!message &&
    (settings.remoteImages === 'always' ||
      settings.allowedSenders.includes(message.from.email.toLowerCase()))

  const list = (
    <MessageList
      title={search ? t.resultsFor(search.query) : folderTitle}
      subtitle={
        search
          ? t.messagesCount(total)
          : currentFolder?.unread
            ? t.unreadBadge(currentFolder.unread)
            : undefined
      }
      headerExtra={
        search ? (
          <SearchFilters
            value={search}
            compact={layout === 'mobile'}
            onChange={(patch) => setSearch({ ...search, ...patch })}
          />
        ) : undefined
      }
      onCloseSearch={search ? () => setSearch(null) : undefined}
      rows={rows}
      total={total}
      status={messagesQuery.status}
      onRetry={() => void messagesQuery.refetch()}
      hasNextPage={messagesQuery.hasNextPage}
      isFetchingNextPage={messagesQuery.isFetchingNextPage}
      onLoadMore={() => void messagesQuery.fetchNextPage()}
      activeUid={activeUid}
      selected={selected}
      density={settings.density}
      isTouch={layout === 'mobile'}
      emptyLabel={search ? t.noResults : t.noMessagesIn(folderTitle)}
      endLabel={t.endOfList(
        search ? t.allFolders : folderTitle,
        new Intl.NumberFormat(locale).format(total),
      )}
      highlight={search?.query || undefined}
      folderLabelFor={search?.scope === 'all' ? (r: MessageRow) => labelOfId(r.folder) : undefined}
      moveTargets={moveTargets}
      onActivate={setActiveUid}
      onOpen={(uid) => void runAction('open', [uid])}
      onToggleSelect={toggleSelect}
      onSelectAll={(all) => setSelected(all ? new Set(rows.map((r) => r.uid)) : new Set())}
      onClearSelection={() => setSelected(new Set())}
      onToggleStar={(r) => void runAction(r.flagged ? 'unstar' : 'star', [r.uid])}
      onAction={(a, uids) => void runAction(a, uids)}
      onSwipe={(r, a) => void runAction(a, [r.uid])}
      onRefresh={() => actions.refresh(folderId)}
      topOffset={layout === 'mobile' ? 56 : 0}
    />
  )

  const reader = (
    <Reader
      earlier={
        earlierRows.length > 0 ? (
          <EarlierMessages
            key={readerUid}
            rows={earlierRows}
            renderMessage={(row, onFold) => <OpenedEarlier row={row} onFold={onFold} />}
          />
        ) : undefined
      }
      message={message}
      status={readerRef === null ? 'idle' : messageQuery.status}
      onRetry={() => void messageQuery.refetch()}
      selectedCount={selected.size}
      remoteAllowedByDefault={remoteAllowed}
      isMobile={layout === 'mobile'}
      selfEmail={session.email}
      moveTargets={moveTargets}
      urlFor={(a, d) =>
        message ? attachmentUrl({ folder: message.folder, uid: message.uid }, a, d) : '#'
      }
      onAction={(a) => {
        if (!message) return
        if (a === 'source') setSourceRef({ folder: message.folder, uid: message.uid })
        else if (a === 'reply' || a === 'replyAll' || a === 'forward') openCompose(a, message)
        else void runAction(a, [message.uid])
      }}
      onBack={() => setMobileReader(false)}
      onAlwaysShowImages={(email) => void actions.allowRemoteImages(email)}
    />
  )

  const page =
    view === 'settings' ? (
      <Suspense fallback={null}>
        <Settings
          settings={settings}
          onChange={updateSettings}
          colorScheme={colorScheme as ColorSchemeSetting}
          onColorSchemeChange={setColorScheme}
          onClose={() => setView('mail')}
          onShowShortcuts={() => setHelpOpen(true)}
          isMobile={layout === 'mobile'}
        />
      </Suspense>
    ) : undefined

  return (
    <I18nContext value={i18n}>
      <MailAppShell
        layout={layout}
        showHeader={layout !== 'mobile' || (!mobileReader && view === 'mail')}
        header={
          <TopBar
            layout={layout}
            unreadCount={inboxUnread}
            title={search ? t.resultsFor(search.query) : folderTitle}
            navOpened={layout === 'desktop' ? !navCollapsed : drawerOpened}
            onNavToggle={() =>
              layout === 'desktop' ? setNavCollapsed((v) => !v) : setDrawerOpened((v) => !v)
            }
            onSearch={() => spotlight.open()}
            onCompose={() => openCompose('new')}
            session={session}
            isDark={computed === 'dark'}
            onToggleTheme={toggleTheme}
            onSettings={() => setView('settings')}
            onShortcuts={() => setHelpOpen(true)}
            onSignOut={session.signOut}
          />
        }
        navCollapsed={navCollapsed}
        drawerOpened={drawerOpened}
        onDrawerClose={() => setDrawerOpened(false)}
        renderNav={(collapsed) => (
          <FolderNav
            folders={foldersQuery.data}
            status={foldersQuery.status}
            onRetry={() => void foldersQuery.refetch()}
            activeId={search ? null : folderId}
            collapsed={collapsed}
            onSelect={goFolder}
            onToggleCollapsed={layout === 'desktop' ? () => setNavCollapsed((v) => !v) : undefined}
            onCompose={layout === 'desktop' ? () => openCompose('new') : undefined}
          />
        )}
        list={list}
        reader={reader}
        page={page}
        mobilePane={mobileReader ? 'reader' : 'list'}
        listWidth={listWidth}
        onListWidthChange={setListWidth}
        navWidth={navWidth}
        onNavWidthChange={setNavWidth}
      />

      {layout === 'mobile' && view === 'mail' && !mobileReader && (
        <Button
          aria-label={t.compose}
          pos="fixed"
          right={16}
          bottom={24}
          w={56}
          h={56}
          p={0}
          radius="xl"
          style={{ zIndex: 150 }}
          onClick={() => openCompose('new')}
        >
          <IconPencil size={24} stroke={1.75} />
        </Button>
      )}

      {compose && (
        <Suspense fallback={null}>
          <Composer
            key={compose.key}
            mode={compose.mode}
            initial={compose.initial}
            quotedLabel={compose.quotedLabel}
            signatureHtml={compose.mode === 'draft' ? '' : settings.signatureHtml}
            isMobile={layout === 'mobile'}
            useContacts={hooks.useContacts}
            onUpload={actions.upload}
            onSaveDraft={actions.saveDraft}
            onSend={sendWithUndo}
            onDiscard={(uid) => {
              setCompose(null)
              if (uid) void actions.discardDraft(uid)
              notifications.show({ message: t.draftDiscarded, color: 'gray', autoClose: 3000 })
            }}
            onClose={() => setCompose(null)}
          />
        </Suspense>
      )}

      <SearchSpotlight
        recent={recent}
        folders={allFolders.map((f) => ({ id: f.id, label: labelOf(f), unread: f.unread }))}
        commands={[
          {
            id: 'compose',
            label: t.compose,
            icon: <IconPencil size={16} stroke={1.75} />,
            shortcut: 'compose',
          },
          {
            id: 'theme',
            label: computed === 'dark' ? t.lightTheme : t.darkTheme,
            icon: <IconMoon size={16} stroke={1.75} />,
          },
          {
            id: 'settings',
            label: t.settings,
            icon: <IconAdjustmentsHorizontal size={16} stroke={1.75} />,
          },
          {
            id: 'shortcuts',
            label: t.shortcuts,
            icon: <IconKeyboard size={16} stroke={1.75} />,
            shortcut: 'help',
          },
        ]}
        onSearch={runSearch}
        onGoToFolder={goFolder}
        onCommand={(id) => {
          if (id === 'compose') openCompose('new')
          if (id === 'theme') toggleTheme()
          if (id === 'settings') setView('settings')
          if (id === 'shortcuts') setHelpOpen(true)
        }}
      />

      <ShortcutsHelp opened={helpOpen} onClose={() => setHelpOpen(false)} />

      <RawMessageModal
        opened={sourceRef !== null}
        onClose={() => setSourceRef(null)}
        status={sourceRef === null ? 'idle' : sourceQuery.status}
        source={sourceQuery.data}
        downloadUrl={sourceRef ? rawUrl(sourceRef, true) : '#'}
      />
    </I18nContext>
  )
}

/** An earlier message of the conversation, loaded when opened. */
function OpenedEarlier({ row, onFold }: { row: MessageRow; onFold: () => void }) {
  const hooks = useMailHooks()
  const { settings } = hooks.useSettings()
  const { data: message } = hooks.useMessage({ folder: row.folder, uid: row.uid })
  if (!message) return null
  const allowRemote =
    settings.remoteImages === 'always' ||
    settings.allowedSenders.includes(message.from.email.toLowerCase())
  return <EarlierMessage message={message} allowRemote={allowRemote} onFold={onFold} />
}
