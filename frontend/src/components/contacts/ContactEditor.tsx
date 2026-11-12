import { useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  ActionIcon,
  Alert,
  Avatar,
  Box,
  Button,
  FileButton,
  Group,
  Kbd,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
  UnstyledButton,
} from '@mantine/core'
import { modals } from '@mantine/modals'
import { ArrowLeftIcon, CircleAlertIcon, ImageIcon, PlusIcon, XIcon } from 'lucide-react'
import type { ContactProblem } from '../../hooks'
import type {
  AddressBook,
  ContactAddress,
  ContactCard,
  ContactInput,
  ContactType,
  ContactValue,
} from '../../types'
import { formatBirthday } from '../../lib/addressBook'
import { initials } from '../../lib/format'
import { useI18n } from '../../lib/i18n'
import { keyLabel } from '../../lib/shortcuts'
import { PhotoCropper } from './PhotoCropper'
import classes from './ContactEditor.module.css'

/** What a save asks the container to do, in this order: the fields, then the picture. */
export type ContactSave = {
  book: string
  input: ContactInput
  /** Only changed fields are sent; a new card always is. */
  fieldsChanged: boolean
  /** A new picture, `remove`, or null to leave it */
  photo: Blob | 'remove' | null
  /** The ETag the user's edits are based on; none for a new card. */
  etag?: string
}

export type SaveOutcome = { ok: true } | { ok: false; problem: ContactProblem; etag?: string }

export type ContactEditorProps = {
  /** The card being edited; none for a new one. */
  card?: ContactCard
  /** Values a new card starts with, e.g. a sender's name and address. */
  prefill?: Partial<ContactInput>
  /** Shows a book field when there is a choice to make. */
  books: AddressBook[]
  defaultBook: string
  isMobile: boolean
  photoUrl?: string
  onSave: (save: ContactSave) => Promise<SaveOutcome>
  onCancel: () => void
}

const EMAIL_TYPES: ContactType[] = ['home', 'work', 'other']
const PHONE_TYPES: ContactType[] = ['cell', 'home', 'work', 'other']
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const blank = (): ContactInput => ({
  firstName: '',
  lastName: '',
  org: '',
  title: '',
  emails: [],
  phones: [],
  addresses: [],
  urls: [],
  birthday: '',
  note: '',
})

function fromCard(card: ContactCard): ContactInput {
  return {
    firstName: card.firstName,
    lastName: card.lastName,
    org: card.org,
    title: card.title,
    emails: card.emails,
    phones: card.phones,
    addresses: card.addresses,
    urls: card.urls,
    birthday: card.birthday,
    note: card.note,
  }
}

/** An empty line to type into, so a new card does not start with buttons only. */
function withEmptyLines(input: ContactInput): ContactInput {
  return {
    ...input,
    emails: input.emails.length ? input.emails : [{ value: '', type: 'home' }],
    phones: input.phones.length ? input.phones : [{ value: '', type: 'cell' }],
  }
}

/** Empty lines do not count as a change: they are dropped when saving. */
const meaningful = (input: ContactInput) =>
  JSON.stringify({
    ...input,
    emails: input.emails.filter((e) => e.value.trim()),
    phones: input.phones.filter((p) => p.value.trim()),
    urls: input.urls.filter((u) => u.value.trim()),
  })

const noYear = (birthday: string) => birthday.startsWith('--')

/**
 * Edits a card in place of the detail pane. Keeps the user's input whatever the save says:
 * a conflict or an unreachable address book only adds a message above the form.
 */
export function ContactEditor({
  card,
  prefill,
  books,
  defaultBook,
  isMobile,
  photoUrl,
  onSave,
  onCancel,
}: ContactEditorProps) {
  const { t, locale } = useI18n()
  const [start] = useState<ContactInput>(() => (card ? fromCard(card) : { ...blank(), ...prefill }))
  const [draft, setDraft] = useState<ContactInput>(() => withEmptyLines(start))
  // Empty until the user picks one: the default may arrive after the editor opens
  const [pickedBook, setBook] = useState(card?.book ?? '')
  const book = pickedBook || defaultBook
  const [etag, setEtag] = useState(card?.etag)
  const [photo, setPhoto] = useState<Blob | 'remove' | null>(null)
  const [cropFile, setCropFile] = useState<File | null>(null)
  const [problem, setProblem] = useState<ContactProblem | 'badImage' | null>(null)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<{ name?: boolean; emails?: number[] }>({})
  const [dropping, setDropping] = useState(false)
  const confirming = useRef(false)
  const firstField = useRef<HTMLInputElement>(null)
  const resetFile = useRef<() => void>(null)

  const fieldsChanged = !card || meaningful(draft) !== meaningful(start)
  const dirty =
    fieldsChanged || photo !== null || (!card && pickedBook !== '' && pickedBook !== defaultBook)

  // The new picture, shown before it is saved
  const preview = useMemo(
    () => (photo instanceof Blob ? URL.createObjectURL(photo) : null),
    [photo],
  )
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview])
  const shownPhoto = photo === 'remove' ? undefined : (preview ?? photoUrl)

  // Straight to typing, except on a phone where the keyboard would cover the form
  useEffect(() => {
    if (!isMobile) firstField.current?.focus()
  }, [isMobile])

  const set = (patch: Partial<ContactInput>) => setDraft((d) => ({ ...d, ...patch }))

  const validate = (): boolean => {
    const emails = draft.emails.flatMap((e, i) =>
      e.value.trim() && !EMAIL.test(e.value.trim()) ? [i] : [],
    )
    const name =
      ![draft.firstName, draft.lastName, draft.org].some((v) => v.trim()) &&
      !draft.emails.some((e) => e.value.trim())
    setErrors({ name, emails })
    return !name && emails.length === 0
  }

  const save = async () => {
    if (saving || !validate()) return
    if (card && !dirty) {
      onCancel()
      return
    }
    setSaving(true)
    setProblem(null)
    const outcome = await onSave({ book, input: draft, fieldsChanged, photo, etag })
    setSaving(false)
    if (outcome.ok) return
    setProblem(outcome.problem)
    // The next attempt starts from what the server has now
    if (outcome.etag) setEtag(outcome.etag)
  }

  const cancel = () => {
    if (!dirty) {
      onCancel()
      return
    }
    confirming.current = true
    modals.openConfirmModal({
      title: t.contact.discardTitle,
      children: <Text size="sm">{t.contact.discardBody}</Text>,
      labels: { confirm: t.contact.discardChanges, cancel: t.contact.keepEditing },
      confirmProps: { color: 'red' },
      centered: true,
      onConfirm: onCancel,
      onClose: () => (confirming.current = false),
    })
  }

  // Save and cancel work from inside the fields too
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.defaultPrevented || cropFile || confirming.current) return
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      void save()
    } else if (e.key === 'Escape') {
      // An open dropdown closes first
      if (e.target instanceof HTMLElement && e.target.getAttribute('aria-expanded') === 'true')
        return
      e.preventDefault()
      cancel()
    }
  })
  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKey(e)
    document.addEventListener('keydown', listener)
    return () => document.removeEventListener('keydown', listener)
  }, [])

  const choose = (file: File | null) => {
    resetFile.current?.()
    if (file) setCropFile(file)
  }

  const typeOptions = (types: ContactType[], current: ContactType) =>
    [...new Set([...types, current])].map((type) => ({
      value: type,
      label: t.contact.types[type],
    }))

  /** One editable line: value, type, remove. */
  const valueRows = (
    kind: 'emails' | 'phones',
    label: string,
    types: ContactType[],
    add: string,
    blankType: ContactType,
  ) => {
    const list = draft[kind]
    const update = (i: number, patch: Partial<ContactValue>) =>
      set({ [kind]: list.map((v, j) => (j === i ? { ...v, ...patch } : v)) })
    return (
      <Section label={label}>
        {list.map((v, i) => (
          <Group key={i} gap={8} wrap="nowrap" align="flex-start">
            <TextInput
              style={{ flex: 1, minWidth: 0 }}
              aria-label={label}
              type={kind === 'emails' ? 'email' : 'tel'}
              value={v.value}
              maxLength={kind === 'emails' ? 254 : 64}
              error={
                kind === 'emails' && errors.emails?.includes(i) ? t.contact.badEmail : undefined
              }
              onChange={(e) => update(i, { value: e.currentTarget.value })}
            />
            {v.label ? (
              // A label from another app: shown as it is, it cannot be changed here
              <Text size="sm" c="dimmed" className={classes.label} title={v.label}>
                {v.label}
              </Text>
            ) : (
              <Select
                w={isMobile ? 104 : 120}
                aria-label={t.contact.type}
                data={typeOptions(types, v.type)}
                value={v.type}
                allowDeselect={false}
                onChange={(type) => type && update(i, { type: type as ContactType })}
              />
            )}
            <RemoveButton
              label={t.contact.removeLine(label)}
              onClick={() => set({ [kind]: list.filter((_, j) => j !== i) })}
            />
          </Group>
        ))}
        <AddButton onClick={() => set({ [kind]: [...list, { value: '', type: blankType }] })}>
          {add}
        </AddButton>
      </Section>
    )
  }

  const updateAddress = (i: number, patch: Partial<ContactAddress>) =>
    set({ addresses: draft.addresses.map((a, j) => (j === i ? { ...a, ...patch } : a)) })

  const problemText =
    problem === 'changed'
      ? t.contact.changed
      : problem === 'unavailable'
        ? t.contact.unreachable
        : problem === 'badImage'
          ? t.contact.badImage
          : problem
            ? t.contact.saveFailed
            : null

  const title = card ? t.contact.editTitle : t.contact.newContact
  const avatarName =
    [draft.firstName, draft.lastName].filter((v) => v.trim()).join(' ') || draft.org

  return (
    <Stack gap={0} h="100%" className={classes.root}>
      <div className={classes.bar}>
        <Group
          gap={isMobile ? 4 : 8}
          px={isMobile ? 4 : 16}
          pr={isMobile ? 8 : 10}
          wrap="nowrap"
          className={classes.toolbar}
        >
          {isMobile && (
            <ActionIcon size={44} aria-label={t.contact.cancel} onClick={cancel}>
              <ArrowLeftIcon size={22} strokeWidth={1.75} />
            </ActionIcon>
          )}
          <Title order={2} size="h2" lineClamp={1} style={{ flex: 1 }}>
            {title}
          </Title>
          {!isMobile && (
            <Button
              variant="default"
              size="xs"
              onClick={cancel}
              rightSection={<Kbd size="xs">{keyLabel('Escape')}</Kbd>}
            >
              {t.contact.cancel}
            </Button>
          )}
          <Tooltip
            label={
              <Group gap={6} wrap="nowrap">
                <span>{t.contact.save}</span>
                <Kbd size="xs">{keyLabel('mod')}</Kbd>
                <Kbd size="xs">{keyLabel('Enter')}</Kbd>
              </Group>
            }
            disabled={isMobile}
          >
            <Button size="xs" onClick={() => void save()} loading={saving}>
              {t.contact.save}
            </Button>
          </Tooltip>
        </Group>
      </div>

      <ScrollArea
        style={{ flex: 1, minHeight: 0 }}
        type="hover"
        scrollbars="y"
        classNames={{ viewport: classes.viewport, scrollbar: classes.scrollbar }}
      >
        <Stack gap={22} className={classes.form} px={isMobile ? 16 : 48} py={isMobile ? 16 : 28}>
          {problemText && (
            <Alert
              variant="light"
              color={problem === 'changed' ? 'yellow' : 'red'}
              icon={<CircleAlertIcon size={18} strokeWidth={2} />}
              role="alert"
              radius="md"
            >
              <Text size="sm">{problemText}</Text>
            </Alert>
          )}

          {!card && books.length > 1 && (
            <Select
              label={t.contact.book}
              data={books.map((b) => ({ value: b.id, label: b.name }))}
              value={book}
              allowDeselect={false}
              onChange={(value) => value && setBook(value)}
              maw={320}
            />
          )}

          <Group gap={18} wrap="nowrap" align="center">
            <UnstyledButton
              className={classes.photo}
              data-dropping={dropping || undefined}
              aria-label={t.contact.choosePicture}
              title={t.contact.dropPicture}
              onClick={() => document.getElementById('contact-photo-input')?.click()}
              onDragOver={(e) => {
                if (![...e.dataTransfer.items].some((item) => item.type.startsWith('image/')))
                  return
                e.preventDefault()
                setDropping(true)
              }}
              onDragLeave={() => setDropping(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDropping(false)
                const file = [...e.dataTransfer.files].find((f) => f.type.startsWith('image/'))
                if (file) setCropFile(file)
              }}
            >
              <Avatar
                radius="xl"
                size={72}
                color="initials"
                name={avatarName}
                src={shownPhoto}
                alt=""
              >
                {avatarName ? (
                  initials({ name: avatarName, email: '' })
                ) : (
                  <ImageIcon size={24} strokeWidth={1.5} />
                )}
              </Avatar>
            </UnstyledButton>
            <Stack gap={6} align="flex-start">
              <Text size="sm" fw={500}>
                {t.contact.picture}
              </Text>
              <Group gap={6}>
                <FileButton
                  onChange={choose}
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  resetRef={resetFile}
                  inputProps={{ id: 'contact-photo-input' }}
                >
                  {(props) => (
                    <Button variant="default" size="xs" {...props}>
                      {shownPhoto ? t.contact.replacePicture : t.contact.choosePicture}
                    </Button>
                  )}
                </FileButton>
                {shownPhoto && (
                  <Button
                    variant="subtle"
                    color="gray"
                    size="xs"
                    onClick={() => setPhoto(card?.photo ? 'remove' : null)}
                  >
                    {t.contact.removePicture}
                  </Button>
                )}
              </Group>
            </Stack>
          </Group>

          <Stack gap={10}>
            <SimpleGrid cols={isMobile ? 1 : 2} spacing={12} verticalSpacing={10}>
              <TextInput
                ref={firstField}
                label={t.contact.firstName}
                value={draft.firstName}
                maxLength={200}
                autoComplete="off"
                onChange={(e) => set({ firstName: e.currentTarget.value })}
              />
              <TextInput
                label={t.contact.lastName}
                value={draft.lastName}
                maxLength={200}
                autoComplete="off"
                onChange={(e) => set({ lastName: e.currentTarget.value })}
              />
              <TextInput
                label={t.contact.org}
                value={draft.org}
                maxLength={200}
                autoComplete="off"
                onChange={(e) => set({ org: e.currentTarget.value })}
              />
              <TextInput
                label={t.contact.jobTitle}
                value={draft.title}
                maxLength={200}
                autoComplete="off"
                onChange={(e) => set({ title: e.currentTarget.value })}
              />
            </SimpleGrid>
            {errors.name && (
              <Text size="sm" c="red" role="alert">
                {t.contact.needName}
              </Text>
            )}
          </Stack>

          {valueRows('emails', t.contact.email, EMAIL_TYPES, t.contact.addEmail, 'home')}
          {valueRows('phones', t.contact.phone, PHONE_TYPES, t.contact.addPhone, 'cell')}

          <Section label={t.contact.url}>
            {draft.urls.map((u, i) => (
              <Group key={i} gap={8} wrap="nowrap">
                <TextInput
                  style={{ flex: 1, minWidth: 0 }}
                  aria-label={t.contact.url}
                  type="url"
                  placeholder="https://"
                  value={u.value}
                  maxLength={500}
                  onChange={(e) => {
                    const value = e.currentTarget.value
                    set({ urls: draft.urls.map((x, j) => (j === i ? { ...x, value } : x)) })
                  }}
                />
                <RemoveButton
                  label={t.contact.removeLine(t.contact.url)}
                  onClick={() => set({ urls: draft.urls.filter((_, j) => j !== i) })}
                />
              </Group>
            ))}
            <AddButton onClick={() => set({ urls: [...draft.urls, { value: '' }] })}>
              {t.contact.addUrl}
            </AddButton>
          </Section>

          <Section label={t.contact.address}>
            {draft.addresses.map((a, i) => (
              <div key={i} className={classes.address}>
                <Group gap={8} wrap="nowrap" justify="space-between">
                  <Select
                    w={isMobile ? 120 : 140}
                    size="xs"
                    aria-label={t.contact.type}
                    data={typeOptions(['home', 'work', 'other'], a.type)}
                    value={a.type}
                    allowDeselect={false}
                    onChange={(type) => type && updateAddress(i, { type: type as ContactType })}
                  />
                  <RemoveButton
                    label={t.contact.removeLine(t.contact.address)}
                    onClick={() => set({ addresses: draft.addresses.filter((_, j) => j !== i) })}
                  />
                </Group>
                <Textarea
                  label={t.contact.street}
                  autosize
                  minRows={1}
                  maxRows={4}
                  value={a.street}
                  maxLength={500}
                  onChange={(e) => updateAddress(i, { street: e.currentTarget.value })}
                />
                <Group gap={8} wrap="nowrap" grow preventGrowOverflow={false}>
                  <TextInput
                    label={t.contact.postalCode}
                    value={a.postalCode}
                    maxLength={32}
                    style={{ flex: '0 0 32%' }}
                    onChange={(e) => updateAddress(i, { postalCode: e.currentTarget.value })}
                  />
                  <TextInput
                    label={t.contact.city}
                    value={a.city}
                    maxLength={200}
                    onChange={(e) => updateAddress(i, { city: e.currentTarget.value })}
                  />
                </Group>
                <Group gap={8} wrap="nowrap" grow>
                  <TextInput
                    label={t.contact.region}
                    value={a.region}
                    maxLength={200}
                    onChange={(e) => updateAddress(i, { region: e.currentTarget.value })}
                  />
                  <TextInput
                    label={t.contact.country}
                    value={a.country}
                    maxLength={200}
                    onChange={(e) => updateAddress(i, { country: e.currentTarget.value })}
                  />
                </Group>
              </div>
            ))}
            <AddButton
              onClick={() =>
                set({
                  addresses: [
                    ...draft.addresses,
                    { type: 'home', street: '', city: '', region: '', postalCode: '', country: '' },
                  ],
                })
              }
            >
              {t.contact.addAddress}
            </AddButton>
          </Section>

          <Section label={t.contact.birthdayLabel}>
            {noYear(draft.birthday) ? (
              // A date the input cannot hold: kept as it is unless the user sets a full one
              <Group gap={10}>
                <Text size="sm">
                  {formatBirthday(draft.birthday, locale)}
                  <Text span size="sm" c="dimmed">
                    {' · '}
                    {t.contact.noYear}
                  </Text>
                </Text>
                <Button variant="subtle" size="compact-sm" onClick={() => set({ birthday: '' })}>
                  {t.contact.setDate}
                </Button>
              </Group>
            ) : (
              <TextInput
                type="date"
                aria-label={t.contact.birthdayLabel}
                value={draft.birthday}
                maw={200}
                onChange={(e) => set({ birthday: e.currentTarget.value })}
              />
            )}
          </Section>

          <Section label={t.contact.noteLabel}>
            <Textarea
              aria-label={t.contact.noteLabel}
              autosize
              minRows={3}
              maxRows={12}
              maxLength={5000}
              value={draft.note}
              onChange={(e) => set({ note: e.currentTarget.value })}
            />
          </Section>
        </Stack>
      </ScrollArea>

      <PhotoCropper
        file={cropFile}
        onApply={(jpeg) => {
          setPhoto(jpeg)
          setCropFile(null)
          if (problem === 'badImage') setProblem(null)
        }}
        onCancel={() => setCropFile(null)}
        onUnreadable={() => {
          setCropFile(null)
          setProblem('badImage')
        }}
      />
    </Stack>
  )
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box component="section" className={classes.section}>
      <Text className={classes.heading}>{label}</Text>
      <Stack gap={8}>{children}</Stack>
    </Box>
  )
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Tooltip label={label}>
      <ActionIcon size={36} aria-label={label} onClick={onClick} className={classes.remove}>
        <XIcon size={16} strokeWidth={1.75} />
      </ActionIcon>
    </Tooltip>
  )
}

function AddButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <Button
      variant="subtle"
      size="compact-sm"
      leftSection={<PlusIcon size={15} strokeWidth={2} />}
      onClick={onClick}
      className={classes.add}
    >
      {children}
    </Button>
  )
}
