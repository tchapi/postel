import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button, Group, Modal, Select, Stack, Text } from '@mantine/core'
import { useLocalStorage } from '@mantine/hooks'
import { notifications } from '@mantine/notifications'
import { CheckIcon, CircleAlertIcon, UploadIcon } from 'lucide-react'
import { ContactError, useMailHooks, type ContactUrls } from './hooks'
import type { Addr, ContactCard, ContactInput, ContactSummary, Density, Undo } from './types'
import { matchesFilter } from './lib/addressBook'
import { useI18n } from './lib/i18n'
import { useMailShortcuts } from './lib/shortcuts'
import type { Layout } from './components/AppShell'
import { SplitPanes } from './components/SplitPanes'
import { ContactList } from './components/contacts/ContactList'
import { ContactDetail } from './components/contacts/ContactDetail'
import {
  ContactEditor,
  type ContactSave,
  type SaveOutcome,
} from './components/contacts/ContactEditor'

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

type Editing =
  { kind: 'edit'; id: string } | { kind: 'new'; key: number; prefill?: Partial<ContactInput> }

const problemOf = (error: unknown) => (error instanceof ContactError ? error.problem : 'failed')

/**
 * The address book: the list of cards on the left, the open card (or the editor) on the right.
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
  const { t } = useI18n()
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
  const [editing, setEditing] = useState<Editing | null>(null)
  const newKey = useRef(0)
  const [importBook, setImportBook] = useState<string | null>(null)
  const [askBook, setAskBook] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const data = bookQuery.data
  const books = useMemo(() => data?.books ?? [], [data])
  // A book that is gone, or a single book: show everything
  const bookId = books.length > 1 && books.some((b) => b.id === storedBook) ? storedBook : 'all'
  const inBook = useMemo(
    () => (data?.cards ?? []).filter((c) => bookId === 'all' || c.book === bookId),
    [data, bookId],
  )
  const cards = useMemo(() => inBook.filter((c) => matchesFilter(c, filter)), [inBook, filter])
  // New cards and imports go to the picked book, else the first one
  const targetBook = bookId === 'all' ? (books[0]?.id ?? '') : bookId

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

  /* ---------- feedback ---------- */
  const notifyDone = useCallback(
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
        icon: <CheckIcon size={18} />,
        color: 'gray',
        autoClose: undo ? 6000 : 3000,
      })
    },
    [t],
  )
  const notifyProblem = (error: unknown) =>
    notifications.show({
      color: 'red',
      icon: <CircleAlertIcon size={18} />,
      message: problemOf(error) === 'unavailable' ? t.contact.unreachableNothing : t.actionFailed,
    })

  /* ---------- navigation ---------- */
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

  /* ---------- writes ---------- */
  const canWrite = reachable && books.length > 0

  const startNew = (prefill?: Partial<ContactInput>) => {
    newKey.current += 1
    setEditing({ kind: 'new', key: newKey.current, prefill })
    if (isMobile) setMobileDetail(true)
  }

  const startEdit = () => {
    if (card) setEditing({ kind: 'edit', id: card.id })
  }

  const save = async ({
    book,
    input,
    fieldsChanged,
    photo,
    etag,
  }: ContactSave): Promise<SaveOutcome> => {
    let saved: ContactCard | undefined
    try {
      // Fields first, then the picture, each with the ETag the previous answer gave
      if (editing?.kind === 'new') saved = await actions.create(book, input)
      else if (card && fieldsChanged)
        saved = await actions.update(card.id, etag ?? card.etag, input)
      const target = saved ?? card
      if (target && photo) {
        const tag = saved?.etag ?? etag ?? target.etag
        saved =
          photo === 'remove'
            ? await actions.removePhoto(target.id, tag)
            : await actions.setPhoto(target.id, tag, photo)
      }
    } catch (error) {
      const problem = problemOf(error)
      if (editing?.kind === 'new' && saved) {
        // The card exists, only its picture failed: open it rather than create it twice
        setEditing(null)
        open(saved.id)
        notifications.show({
          color: 'red',
          icon: <CircleAlertIcon size={18} />,
          message: t.contact.saveFailed,
        })
        return { ok: true }
      }
      if (problem === 'changed' && card) {
        // Someone else's version is the base from now on; the user's input stays in the form
        const fresh = await cardQuery.refetch()
        return { ok: false, problem, etag: fresh.data?.etag }
      }
      return { ok: false, problem, etag: saved?.etag }
    }
    setEditing(null)
    if (saved) {
      open(saved.id)
      notifyDone(editing?.kind === 'new' ? t.contact.created(saved.name) : t.contact.saved)
    }
    return { ok: true }
  }

  const remove = async () => {
    if (!card) return
    const idx = cards.findIndex((c) => c.id === card.id)
    const next = cards[idx + 1] ?? cards[idx - 1]
    try {
      const undo = await actions.remove(card)
      onContactChange(next && next.id !== card.id ? next.id : null)
      if (isMobile) setMobileDetail(false)
      notifyDone(t.contact.deleted(card.name), undo)
    } catch (error) {
      notifyProblem(error)
    }
  }

  const importInto = async (book: string, file: File) => {
    const id = notifications.show({
      loading: true,
      message: t.contact.importing,
      autoClose: false,
      withCloseButton: false,
    })
    try {
      const { imported, failed } = await actions.importFile(book, file)
      notifications.update({
        id,
        loading: false,
        color: failed ? 'yellow' : 'gray',
        icon: failed ? <CircleAlertIcon size={18} /> : <CheckIcon size={18} />,
        message: failed
          ? `${t.contact.imported(imported)}. ${t.contact.importFailed(failed)}`
          : t.contact.imported(imported),
        autoClose: 6000,
        withCloseButton: true,
      })
    } catch (error) {
      notifications.update({
        id,
        loading: false,
        color: 'red',
        icon: <CircleAlertIcon size={18} />,
        message: problemOf(error) === 'unavailable' ? t.contact.unreachableNothing : t.actionFailed,
        autoClose: 6000,
        withCloseButton: true,
      })
    }
  }

  const chooseImport = () => {
    // With several books and none picked, ask which one first
    if (books.length > 1 && bookId === 'all') {
      setImportBook(books[0]!.id)
      setAskBook(true)
    } else {
      setImportBook(targetBook)
      fileRef.current?.click()
    }
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
      editContact: canWrite ? startEdit : undefined,
      delete: canWrite ? () => void remove() : undefined,
      goInbox: onGoInbox,
      help: onShowShortcuts,
    },
    // The editor has its own keys
    shortcutsEnabled && editing === null,
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
      onNew={canWrite ? () => startNew() : undefined}
      onImport={canWrite ? chooseImport : undefined}
      onRefresh={() => actions.refresh().catch(() => undefined)}
      onActivate={(id) => {
        if (editing === null) onContactChange(id)
      }}
      onOpen={(id) => {
        if (editing === null) open(id)
      }}
      onBack={isMobile ? onClose : undefined}
    />
  )

  let detail
  if (editing && (editing.kind === 'new' || card?.id === editing.id))
    detail = (
      <ContactEditor
        key={editing.kind === 'new' ? `new-${editing.key}` : editing.id}
        card={editing.kind === 'edit' ? card : undefined}
        prefill={editing.kind === 'new' ? editing.prefill : undefined}
        books={bookId === 'all' ? books : []}
        defaultBook={targetBook}
        isMobile={isMobile}
        photoUrl={editing.kind === 'edit' && card ? photoUrl(card) : undefined}
        onSave={save}
        onCancel={() => {
          setEditing(null)
          if (isMobile && editing.kind === 'new') setMobileDetail(false)
        }}
      />
    )
  else
    detail = (
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
        onEdit={canWrite ? startEdit : undefined}
        onDelete={canWrite ? () => void remove() : undefined}
      />
    )

  const showDetail = editing !== null || (mobileDetail && contactId !== null)

  return (
    <>
      <SplitPanes
        layout={layout}
        list={list}
        reader={detail}
        mobilePane={showDetail ? 'reader' : 'list'}
        listWidth={listWidth}
        onListWidthChange={setListWidth}
      />

      <input
        ref={fileRef}
        type="file"
        accept=".vcf,.vcard,text/vcard,text/x-vcard"
        hidden
        onChange={(e) => {
          const file = e.currentTarget.files?.[0]
          e.currentTarget.value = ''
          if (file && importBook) void importInto(importBook, file)
        }}
      />

      <Modal
        opened={askBook}
        onClose={() => setAskBook(false)}
        title={t.contact.importTitle}
        centered
        size="sm"
      >
        <Stack gap={16}>
          <Select
            label={t.contact.importInto}
            data={books.map((b) => ({ value: b.id, label: b.name }))}
            value={importBook}
            allowDeselect={false}
            onChange={setImportBook}
            comboboxProps={{ withinPortal: true }}
            data-autofocus
          />
          <Group justify="flex-end" gap={8}>
            <Button variant="default" onClick={() => setAskBook(false)}>
              {t.contact.cancel}
            </Button>
            <Button
              leftSection={<UploadIcon size={16} strokeWidth={1.75} />}
              onClick={() => {
                setAskBook(false)
                fileRef.current?.click()
              }}
            >
              {t.contact.import}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  )
}
