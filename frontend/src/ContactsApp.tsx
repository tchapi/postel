import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocalStorage } from '@mantine/hooks'
import { ContactError, useMailHooks, type ContactUrls } from './hooks'
import type { Addr, ContactSummary, Density } from './types'
import { matchesFilter } from './lib/addressBook'
import { useMailShortcuts } from './lib/shortcuts'
import type { Layout } from './components/AppShell'
import { SplitPanes } from './components/SplitPanes'
import { ContactList } from './components/contacts/ContactList'
import { ContactDetail } from './components/contacts/ContactDetail'

export type ContactsAppProps = {
  layout: Layout
  density: Density
  urls: ContactUrls
  /** The open contact lives in the address bar, so MailApp owns it. */
  contactId: string | null
  onContactChange: (id: string | null) => void
  /** Back to mail */
  onClose: () => void
  /** Undefined while nothing can be sent */
  onCompose?: (to?: Addr) => void
  onShowMessages: (email: string) => void
  onGoInbox: () => void
  onShowShortcuts: () => void
  /** False while a dialog or the composer has the keyboard */
  shortcutsEnabled: boolean
  /** The backend answers */
  reachable: boolean
}

/**
 * The address book: the list of cards on the left, the open card on the right.
 * Lazy-loaded with its components; MailApp only knows the view and the open card's id.
 */
export function ContactsApp({
  layout,
  density,
  urls,
  contactId,
  onContactChange,
  onClose,
  onCompose,
  onShowMessages,
  onGoInbox,
  onShowShortcuts,
  shortcutsEnabled,
  reachable,
}: ContactsAppProps) {
  const hooks = useMailHooks()
  const actions = hooks.useContactActions()
  const bookQuery = hooks.useAddressBook(true)
  const cardQuery = hooks.useContactCard(contactId)
  const isMobile = layout === 'mobile'

  const [listWidth, setListWidth] = useLocalStorage({
    key: 'postel.contacts-list-width',
    defaultValue: 340,
  })
  // Which address book the user looks at, remembered by this browser
  const [storedBook, setStoredBook] = useLocalStorage({
    key: 'postel.contacts-book',
    defaultValue: 'all',
  })
  const [filter, setFilter] = useState('')
  const filterRef = useRef<HTMLInputElement>(null)
  const [mobileDetail, setMobileDetail] = useState(contactId !== null)

  const data = bookQuery.data
  const books = useMemo(() => data?.books ?? [], [data])
  // A book that is gone, or a single book: show everything
  const bookId = books.length > 1 && books.some((b) => b.id === storedBook) ? storedBook : 'all'
  const inBook = useMemo(
    () => (data?.cards ?? []).filter((c) => bookId === 'all' || c.book === bookId),
    [data, bookId],
  )
  const cards = useMemo(() => inBook.filter((c) => matchesFilter(c, filter)), [inBook, filter])

  // On open: show the copy at once, and ask the backend to look for changes behind it
  const refreshed = useRef(false)
  useEffect(() => {
    if (refreshed.current) return
    refreshed.current = true
    actions.refresh().catch(() => undefined)
  }, [actions])

  const card = cardQuery.data
  const photoUrl = (c: Pick<ContactSummary, 'id' | 'etag' | 'photo'>) =>
    c.photo ? urls.photo(c) : undefined

  const open = (id: string) => {
    onContactChange(id)
    if (isMobile) setMobileDetail(true)
  }

  const step = (delta: 1 | -1) => {
    if (!cards.length) return
    const idx = contactId === null ? -1 : cards.findIndex((c) => c.id === contactId)
    const next = cards[Math.min(cards.length - 1, Math.max(0, idx + delta))]
    if (next) onContactChange(next.id)
  }

  const write = (email?: string) => {
    if (!onCompose) return
    onCompose(email ? { email, name: card?.name } : undefined)
  }

  useMailShortcuts(
    {
      next: () => step(1),
      prev: () => step(-1),
      open: () => contactId !== null && open(contactId),
      close: () => {
        if (isMobile && mobileDetail) setMobileDetail(false)
        else onClose()
      },
      search: () => filterRef.current?.focus(),
      compose: () => write(card?.emails[0]?.value),
      goInbox: onGoInbox,
      help: onShowShortcuts,
    },
    shortcutsEnabled,
  )

  const downloadUrl = bookId === 'all' ? urls.allVcf() : urls.bookVcf(bookId)
  const bookName = books.length > 1 ? books.find((b) => b.id === card?.book)?.name : undefined
  const problem = cardQuery.error instanceof ContactError ? cardQuery.error.problem : undefined

  const list = (
    <ContactList
      cards={cards}
      total={inBook.length}
      status={bookQuery.status}
      onRetry={() => void bookQuery.refetch()}
      unreachable={!reachable}
      stale={data ? !data.available : false}
      books={books}
      bookId={bookId}
      onBookChange={setStoredBook}
      filter={filter}
      onFilterChange={setFilter}
      filterRef={filterRef}
      activeId={contactId}
      density={density}
      isMobile={isMobile}
      photoUrl={photoUrl}
      downloadUrl={downloadUrl}
      onRefresh={() => actions.refresh().catch(() => undefined)}
      onActivate={onContactChange}
      onOpen={open}
      onBack={isMobile ? onClose : undefined}
    />
  )

  const detail = (
    <ContactDetail
      card={card}
      status={contactId === null ? 'idle' : cardQuery.status}
      problem={problem}
      onRetry={() => void cardQuery.refetch()}
      isMobile={isMobile}
      photoUrl={card ? photoUrl(card) : undefined}
      vcfUrl={contactId ? urls.cardVcf(contactId) : '#'}
      bookName={bookName}
      onBack={() => setMobileDetail(false)}
      onWrite={onCompose ? write : undefined}
      onShowMessages={onShowMessages}
    />
  )

  return (
    <SplitPanes
      layout={layout}
      list={list}
      reader={detail}
      mobilePane={mobileDetail && contactId !== null ? 'reader' : 'list'}
      listWidth={listWidth}
      onListWidthChange={setListWidth}
    />
  )
}
