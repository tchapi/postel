import { useState, type ReactNode } from 'react'
import {
  ActionIcon,
  Anchor,
  Avatar,
  Box,
  Button,
  CopyButton,
  Group,
  Menu,
  ScrollArea,
  Stack,
  Text,
  Title,
  Tooltip,
  UnstyledButton,
} from '@mantine/core'
import {
  ArrowLeftIcon,
  BookUserIcon,
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  EllipsisIcon,
  EllipsisVerticalIcon,
  InboxIcon,
  SquarePenIcon,
  Trash2Icon,
  UserPenIcon,
  UsersIcon,
  UserXIcon,
} from 'lucide-react'
import type { ContactCard, ContactType } from '../../types'
import type { ContactProblem } from '../../hooks'
import { formatBirthday } from '../../lib/addressBook'
import { initials } from '../../lib/format'
import { useI18n } from '../../lib/i18n'
import { KeyCombo, ShortcutTooltip } from '../ShortcutTooltip'
import { ErrorState, ReaderSkeleton, StateMessage } from '../States'
import classes from './ContactDetail.module.css'

export type ContactDetailProps = {
  card: ContactCard | undefined
  status: 'idle' | 'pending' | 'error' | 'success'
  problem?: ContactProblem
  onRetry: () => void
  isMobile: boolean
  photoUrl?: string
  vcfUrl: string
  /** Shown under the name when there are several address books. */
  bookName?: string
  onBack?: () => void
  /** Opens the composer to this address. Omit when nothing can be sent. */
  onWrite?: (email: string) => void
  onShowMessages: (email: string) => void
  /** Omit when the card cannot be changed. */
  onEdit?: () => void
  onDelete?: () => void
  /** Cards that may be the same person. Shown with `onMerge` only. */
  duplicates?: { id: string; name: string }[]
  onMerge?: (id: string) => void
}

const isWebLink = (url: string) => /^https?:\/\//i.test(url.trim())

export function ContactDetail(props: ContactDetailProps) {
  const { t } = useI18n()
  const { card, status, problem } = props
  // The toolbar's shadow shows once the card scrolls under it; a new card starts unscrolled
  const [scrolledId, setScrolledId] = useState<string | null>(null)
  const scrolled = scrolledId !== null && scrolledId === card?.id

  if (status === 'idle') {
    return (
      <StateMessage
        icon={<BookUserIcon size={28} strokeWidth={1.5} />}
        title={t.contact.noneSelected}
      >
        <Group gap={6} fz="xs">
          <KeyCombo id="next" />
          <KeyCombo id="prev" />
          <span>{t.readerHint}</span>
        </Group>
      </StateMessage>
    )
  }

  return (
    <Stack gap={0} h="100%" className={classes.root}>
      <div className={classes.bar} data-scrolled={scrolled || undefined}>
        <Toolbar {...props} />
      </div>
      <ScrollArea
        style={{ flex: 1, minHeight: 0 }}
        type="hover"
        scrollbars="y"
        classNames={{ viewport: classes.viewport, scrollbar: classes.scrollbar }}
        onScrollPositionChange={({ y }) => setScrolledId(y > 0 && card ? card.id : null)}
      >
        {status === 'pending' && <ReaderSkeleton />}
        {status === 'error' &&
          (problem === 'notFound' ? (
            <StateMessage icon={<UserXIcon size={24} strokeWidth={1.5} />} title={t.contact.gone} />
          ) : (
            <ErrorState title={t.contact.openError} onRetry={props.onRetry} />
          ))}
        {status === 'success' && card && <Body key={card.id} {...props} card={card} />}
      </ScrollArea>
    </Stack>
  )
}

function Toolbar({
  card,
  isMobile,
  vcfUrl,
  onBack,
  onWrite,
  onEdit,
  onDelete,
  onShowMessages,
}: ContactDetailProps) {
  const { t } = useI18n()
  const email = card?.emails[0]?.value
  const size = isMobile ? 44 : 'lg'
  const iconSize = isMobile ? 21 : 18
  const stroke = isMobile ? 1.75 : 2

  const more = (
    <Menu position="bottom-end">
      <Menu.Target>
        <ActionIcon size={size} aria-label={t.moreActions} disabled={!card}>
          {isMobile ? (
            <EllipsisVerticalIcon size={20} strokeWidth={1.75} />
          ) : (
            <EllipsisIcon size={18} strokeWidth={2} />
          )}
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown miw={220}>
        <Menu.Item component="a" href={vcfUrl} leftSection={<DownloadIcon size={16} />}>
          {t.contact.downloadCard}
        </Menu.Item>
        {email && (
          <Menu.Item leftSection={<InboxIcon size={16} />} onClick={() => onShowMessages(email)}>
            {t.contact.showMessages}
          </Menu.Item>
        )}
        {onDelete && (
          <>
            <Menu.Divider />
            <Menu.Item
              color="red"
              leftSection={<Trash2Icon size={16} />}
              rightSection={<KeyCombo id="delete" />}
              onClick={onDelete}
            >
              {t.contact.delete}
            </Menu.Item>
          </>
        )}
      </Menu.Dropdown>
    </Menu>
  )

  return (
    <Group
      gap={2}
      px={isMobile ? 4 : 16}
      wrap="nowrap"
      className={classes.toolbar}
      role="toolbar"
      aria-label={t.moreActions}
    >
      {isMobile && onBack && (
        <ActionIcon size={44} aria-label={t.back} onClick={onBack}>
          <ArrowLeftIcon size={22} strokeWidth={1.75} />
        </ActionIcon>
      )}
      {isMobile && <Box style={{ flex: 1 }} />}
      {onWrite && (
        <ShortcutTooltip label={t.contact.write} shortcut="compose">
          <ActionIcon
            size={size}
            aria-label={t.contact.write}
            disabled={!email}
            onClick={() => email && onWrite(email)}
          >
            <SquarePenIcon size={iconSize} strokeWidth={stroke} />
          </ActionIcon>
        </ShortcutTooltip>
      )}
      {onEdit && (
        <ShortcutTooltip label={t.contact.edit} shortcut="editContact">
          <ActionIcon size={size} aria-label={t.contact.edit} disabled={!card} onClick={onEdit}>
            <UserPenIcon size={iconSize} strokeWidth={stroke} />
          </ActionIcon>
        </ShortcutTooltip>
      )}
      {more}
    </Group>
  )
}

/** One line of the card: its kind or type on the left, the value, a copy button on hover. */
function Field({ label, copy, children }: { label: string; copy?: string; children: ReactNode }) {
  const { t } = useI18n()
  return (
    <div className={classes.field}>
      <Text size="sm" c="dimmed" className={classes.fieldLabel}>
        {label}
      </Text>
      <div className={classes.fieldValue}>{children}</div>
      {copy && (
        <CopyButton value={copy} timeout={1500}>
          {({ copied, copy: run }) => (
            <Tooltip label={copied ? t.copied : t.copy} withinPortal>
              <ActionIcon
                size="sm"
                className={classes.copy}
                data-copied={copied || undefined}
                aria-label={copied ? t.copied : t.contact.copy(label)}
                onClick={run}
              >
                {copied ? (
                  <CheckIcon size={14} strokeWidth={2} />
                ) : (
                  <CopyIcon size={14} strokeWidth={1.75} />
                )}
              </ActionIcon>
            </Tooltip>
          )}
        </CopyButton>
      )}
    </div>
  )
}

function Body({
  card,
  isMobile,
  photoUrl,
  bookName,
  onWrite,
  duplicates,
  onMerge,
}: ContactDetailProps & { card: ContactCard }) {
  const { t, locale } = useI18n()
  const typeLabel = (type: ContactType, label?: string) => label || t.contact.types[type]
  const meta = [card.org !== card.name ? card.org : '', card.title].filter(Boolean).join(' · ')
  const avatar = isMobile ? 64 : 72

  const address = (a: ContactCard['addresses'][number]) =>
    [a.street, [a.postalCode, a.city].filter(Boolean).join(' '), a.region, a.country]
      .filter((line) => line.trim())
      .join('\n')

  const groups: ReactNode[] = []
  if (card.emails.length)
    groups.push(
      card.emails.map((e) => (
        <Field key={`e${e.key}`} label={typeLabel(e.type, e.label)} copy={e.value}>
          {onWrite ? (
            <UnstyledButton className={classes.link} onClick={() => onWrite(e.value)}>
              {e.value}
            </UnstyledButton>
          ) : (
            <Text size="sm">{e.value}</Text>
          )}
        </Field>
      )),
    )
  if (card.phones.length)
    groups.push(
      card.phones.map((p) => (
        <Field key={`p${p.key}`} label={typeLabel(p.type, p.label)} copy={p.value}>
          <Anchor
            size="sm"
            className={classes.link}
            href={`tel:${p.value.replace(/[^\d+#*,;]/g, '')}`}
          >
            {p.value}
          </Anchor>
        </Field>
      )),
    )
  if (card.addresses.length)
    groups.push(
      card.addresses.map((a) => (
        <Field key={`a${a.key}`} label={typeLabel(a.type)} copy={address(a)}>
          <Text size="sm" className={classes.multiline}>
            {address(a)}
          </Text>
        </Field>
      )),
    )
  if (card.urls.length)
    groups.push(
      card.urls.map((u) => (
        <Field key={`u${u.key}`} label={t.contact.website} copy={u.value}>
          {isWebLink(u.value) ? (
            <Anchor
              size="sm"
              className={classes.link}
              href={u.value.trim()}
              target="_blank"
              rel="noopener noreferrer"
            >
              {u.value}
            </Anchor>
          ) : (
            <Text size="sm" className={classes.multiline}>
              {u.value}
            </Text>
          )}
        </Field>
      )),
    )
  if (card.birthday)
    groups.push(
      <Field key="birthday" label={t.contact.birthday}>
        <Text size="sm">{formatBirthday(card.birthday, locale)}</Text>
      </Field>,
    )
  if (card.note)
    groups.push(
      <Field key="note" label={t.contact.note}>
        <Text size="sm" className={classes.multiline}>
          {card.note}
        </Text>
      </Field>,
    )

  return (
    <Stack gap={8} className={classes.body} px={isMobile ? 20 : 48} py={isMobile ? 20 : 32}>
      <header className={classes.header}>
        <Avatar radius="xl" size={avatar} color="initials" name={card.name} src={photoUrl} alt="">
          {initials({ name: card.name, email: card.emails[0]?.value ?? '' })}
        </Avatar>
        <Stack gap={2} style={{ minWidth: 0 }}>
          <Title order={1} className={classes.name}>
            {card.name}
          </Title>
          {meta && (
            <Text size="sm" c="dimmed">
              {meta}
            </Text>
          )}
          {bookName && (
            <Text size="xs" c="dimmed">
              {bookName}
            </Text>
          )}
        </Stack>
      </header>
      {onMerge &&
        duplicates?.slice(0, 3).map((duplicate) => (
          <div key={duplicate.id} className={classes.duplicate}>
            <UsersIcon size={15} strokeWidth={1.75} />
            <Text size="sm" truncate style={{ flex: 1, minWidth: 0 }}>
              {t.contact.possibleDuplicate(duplicate.name)}
            </Text>
            <Button
              variant="subtle"
              color="gray"
              size="compact-sm"
              onClick={() => onMerge(duplicate.id)}
            >
              {t.contact.merge}
            </Button>
          </div>
        ))}
      {groups.length > 0 && (
        <Stack gap={0} className={classes.groups}>
          {groups.map((group, i) => (
            <div key={i} className={classes.group}>
              {group}
            </div>
          ))}
        </Stack>
      )}
    </Stack>
  )
}
