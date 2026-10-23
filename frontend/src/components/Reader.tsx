import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import {
  ActionIcon,
  Alert,
  Avatar,
  Box,
  Button,
  Divider,
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
  IconArchive,
  IconCode,
  IconArrowBackUp,
  IconArrowBackUpDouble,
  IconArrowForwardUp,
  IconArrowLeft,
  IconBan,
  IconDots,
  IconDotsVertical,
  IconFolderShare,
  IconMail,
  IconMailOpened,
  IconPhotoOff,
  IconStack2,
  IconStar,
  IconStarFilled,
  IconTrash,
} from '@tabler/icons-react'
import type { Attachment, Message, RowAction } from '../types'
import {
  displayName,
  shortAbsoluteDate,
  formatAddrList,
  initials,
  relativeDate,
} from '../lib/format'
import { useI18n } from '../lib/i18n'
import { AttachmentList } from './AttachmentList'
import { MessageFrame, htmlHasQuote, splitTextQuote } from './MessageFrame'
import { MoveMenuItems, type MoveTarget } from './MoveMenu'
import { KeyCombo, ShortcutTooltip } from './ShortcutTooltip'
import type { ShortcutId } from '../lib/shortcuts'
import { ErrorState, ReaderSkeleton, StateMessage } from './States'
import classes from './Reader.module.css'

export type ReaderProps = {
  message: Message | undefined
  status: 'idle' | 'pending' | 'error' | 'success'
  onRetry: () => void
  /** Multi-selection count, shown instead of the empty state. */
  selectedCount: number
  /** Policy says show, or the sender is allow-listed. */
  remoteAllowedByDefault: boolean
  isMobile: boolean
  selfEmail: string
  moveTargets: MoveTarget[]
  urlFor: (a: Attachment, disposition: 'inline' | 'download') => string
  onAction: (action: RowAction) => void
  onBack?: () => void
  onAlwaysShowImages: (senderEmail: string) => void
  /** Earlier messages of the conversation, shown above this one */
  earlier?: ReactNode
}

export function Reader(props: ReaderProps) {
  const { t } = useI18n()
  const { message, status, selectedCount, isMobile } = props
  // The toolbar's shadow shows once the message scrolls under it; a new message starts unscrolled
  const messageKey = message ? `${message.folder}:${message.uid}` : null
  const [scrolledKey, setScrolledKey] = useState<string | null>(null)
  const scrolled = scrolledKey !== null && scrolledKey === messageKey

  if (status === 'idle' || (!message && status !== 'pending' && status !== 'error')) {
    return (
      <StateMessage
        icon={
          selectedCount > 1 ? (
            <IconStack2 size={28} stroke={1.5} />
          ) : (
            <IconMail size={28} stroke={1.5} />
          )
        }
        title={selectedCount > 1 ? t.nSelected(selectedCount) : t.noMessageSelected}
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
        <ReaderToolbar {...props} />
      </div>
      <ScrollArea
        style={{ flex: 1, minHeight: 0 }}
        type="hover"
        scrollbars="y"
        onScrollPositionChange={({ y }) => setScrolledKey(y > 0 ? messageKey : null)}
      >
        {status === 'pending' && <ReaderSkeleton />}
        {status === 'error' && <ErrorState title={t.openError} onRetry={props.onRetry} />}
        {status === 'success' && message && (
          <ReaderBody key={`${message.folder}:${message.uid}`} {...props} message={message} />
        )}
      </ScrollArea>
      {isMobile && message && (
        <Group grow gap={0} className={classes.mobileBar} role="toolbar" aria-label={t.reply}>
          <UnstyledButton className={classes.mobileAction} onClick={() => props.onAction('reply')}>
            <IconArrowBackUp size={20} stroke={1.75} />
            {t.reply}
          </UnstyledButton>
          <UnstyledButton
            className={classes.mobileAction}
            onClick={() => props.onAction('replyAll')}
          >
            <IconArrowBackUpDouble size={20} stroke={1.75} />
            {t.replyAll}
          </UnstyledButton>
          <UnstyledButton
            className={classes.mobileAction}
            onClick={() => props.onAction('forward')}
          >
            <IconArrowForwardUp size={20} stroke={1.75} />
            {t.forward}
          </UnstyledButton>
        </Group>
      )}
    </Stack>
  )
}

function ReaderToolbar({ message, isMobile, moveTargets, onAction, onBack }: ReaderProps) {
  const { t } = useI18n()
  const flagged = message?.flagged ?? false
  const disabled = !message

  const moreMenu = (
    <Menu position="bottom-end">
      <Menu.Target>
        <ActionIcon size={isMobile ? 44 : 'lg'} aria-label={t.moreActions} disabled={disabled}>
          {isMobile ? (
            <IconDotsVertical size={20} stroke={1.75} />
          ) : (
            <IconDots size={18} stroke={1.75} />
          )}
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown miw={220}>
        {isMobile && (
          <>
            <Menu.Item leftSection={<IconMail size={16} />} onClick={() => onAction('unread')}>
              {t.markUnread}
            </Menu.Item>
            <Menu.Item leftSection={<IconBan size={16} />} onClick={() => onAction('junk')}>
              {t.junk}
            </Menu.Item>
            <Menu.Divider />
            <Menu.Label>{t.moveTo}</Menu.Label>
            <MoveMenuItems targets={moveTargets} onMove={(id) => onAction({ moveTo: id })} />
          </>
        )}
        {!isMobile && (
          <Menu.Item leftSection={<IconMailOpened size={16} />} onClick={() => onAction('read')}>
            {t.markRead}
          </Menu.Item>
        )}
        <Menu.Divider />
        <Menu.Item leftSection={<IconCode size={16} />} onClick={() => onAction('source')}>
          {t.showOriginal}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  )

  if (isMobile) {
    return (
      <Group gap={2} px={4} className={classes.toolbar} role="toolbar" aria-label={t.moreActions}>
        <ActionIcon size={44} aria-label={t.back} onClick={onBack}>
          <IconArrowLeft size={22} stroke={1.75} />
        </ActionIcon>
        <Box style={{ flex: 1 }} />
        <ActionIcon
          size={44}
          aria-label={t.archive}
          onClick={() => onAction('archive')}
          disabled={disabled}
        >
          <IconArchive size={21} stroke={1.75} />
        </ActionIcon>
        <ActionIcon
          size={44}
          aria-label={t.delete}
          onClick={() => onAction('delete')}
          disabled={disabled}
        >
          <IconTrash size={21} stroke={1.75} />
        </ActionIcon>
        <ActionIcon
          size={44}
          aria-label={flagged ? t.unstar : t.star}
          aria-pressed={flagged}
          onClick={() => onAction(flagged ? 'unstar' : 'star')}
          disabled={disabled}
        >
          {flagged ? (
            <IconStarFilled size={20} style={{ color: 'var(--mail-star)' }} />
          ) : (
            <IconStar size={21} stroke={1.75} />
          )}
        </ActionIcon>
        {moreMenu}
      </Group>
    )
  }

  const btn = (label: string, icon: ReactNode, action: RowAction, shortcut?: ShortcutId) => (
    <ShortcutTooltip label={label} shortcut={shortcut}>
      <ActionIcon size="lg" aria-label={label} onClick={() => onAction(action)} disabled={disabled}>
        {icon}
      </ActionIcon>
    </ShortcutTooltip>
  )

  return (
    <Group
      gap={2}
      px={16}
      wrap="nowrap"
      className={classes.toolbar}
      role="toolbar"
      aria-label={t.moreActions}
    >
      {btn(t.reply, <IconArrowBackUp size={18} stroke={1.75} />, 'reply', 'reply')}
      {btn(t.replyAll, <IconArrowBackUpDouble size={18} stroke={1.75} />, 'replyAll', 'replyAll')}
      {btn(t.forward, <IconArrowForwardUp size={18} stroke={1.75} />, 'forward', 'forward')}
      <Divider orientation="vertical" mx={8} my={16} />
      {btn(t.archive, <IconArchive size={18} stroke={1.75} />, 'archive', 'archive')}
      {btn(t.delete, <IconTrash size={18} stroke={1.75} />, 'delete', 'delete')}
      {btn(t.junk, <IconBan size={18} stroke={1.75} />, 'junk')}
      <Menu position="bottom-start">
        <Tooltip label={t.moveTo}>
          <Menu.Target>
            <ActionIcon size="lg" aria-label={t.moveTo} disabled={disabled}>
              <IconFolderShare size={18} stroke={1.75} />
            </ActionIcon>
          </Menu.Target>
        </Tooltip>
        <Menu.Dropdown>
          <MoveMenuItems targets={moveTargets} onMove={(id) => onAction({ moveTo: id })} />
        </Menu.Dropdown>
      </Menu>
      <Divider orientation="vertical" mx={8} my={16} />
      {btn(
        flagged ? t.unstar : t.star,
        flagged ? (
          <IconStarFilled size={18} style={{ color: 'var(--mail-star)' }} />
        ) : (
          <IconStar size={18} stroke={1.75} />
        ),
        flagged ? 'unstar' : 'star',
        'star',
      )}
      {btn(t.markUnread, <IconMail size={18} stroke={1.75} />, 'unread', 'unread')}
      {moreMenu}
    </Group>
  )
}

function ReaderBody({
  earlier,
  message,
  remoteAllowedByDefault,
  selfEmail,
  isMobile,
  urlFor,
  onAlwaysShowImages,
}: ReaderProps & { message: Message }) {
  const { t, locale } = useI18n()
  const [showRemote, setShowRemote] = useState(false)
  const [showQuoted, setShowQuoted] = useState(false)
  const allowRemote = remoteAllowedByDefault || showRemote

  const hasQuote = useMemo(
    () =>
      message.html ? htmlHasQuote(message.html) : splitTextQuote(message.text ?? '').quote !== null,
    [message.html, message.text],
  )
  const textParts = useMemo(
    () => (message.html ? null : splitTextQuote(message.text ?? '')),
    [message.html, message.text],
  )

  const self = (a: { email: string }) => a.email.toLowerCase() === selfEmail.toLowerCase()
  const toLine = message.to.map((a) => (self(a) ? t.me : displayName(a))).join(', ')
  const ccLine = message.cc.length ? formatAddrList(message.cc) : ''

  return (
    <Stack
      gap={20}
      className={classes.body}
      px={isMobile ? 20 : 48}
      py={isMobile ? 20 : 32}
      style={{ '--reader-gutter': isMobile ? '20px' : '48px' } as CSSProperties}
    >
      {earlier}

      {/* Sender first, the date across from it, subject and recipients below, an inset rule to close the block */}
      <header className={classes.header}>
        <Group gap={12} align="flex-start" wrap="nowrap">
          <Avatar
            radius="xl"
            size={40}
            color="initials"
            name={displayName(message.from)}
            aria-hidden
          >
            {initials(message.from)}
          </Avatar>
          <Stack gap={3} style={{ flex: 1, minWidth: 0 }}>
            <Group gap={16} justify="space-between" align="baseline" wrap="nowrap">
              <Group gap={6} align="baseline" wrap="nowrap" style={{ minWidth: 0 }}>
                <Text fw={700} truncate style={{ flex: 'none', maxWidth: '60%' }}>
                  {displayName(message.from)}
                </Text>
                {message.from.name && (
                  <Text size="sm" c="dimmed" truncate>
                    {message.from.email}
                  </Text>
                )}
              </Group>
              <Tooltip label={relativeDate(message.date, locale)}>
                <Text
                  component="time"
                  dateTime={message.date}
                  size="sm"
                  c="dimmed"
                  className={classes.date}
                  tabIndex={0}
                >
                  {shortAbsoluteDate(message.date, locale)}
                </Text>
              </Tooltip>
            </Group>
            <Title order={1} className={classes.subject}>
              {message.subject}
            </Title>
            <Text size="sm" c="dimmed" truncate>
              <span className={classes.fieldLabel}>{t.toLabel}:</span> {toLine}
            </Text>
            {ccLine && (
              <Text size="sm" c="dimmed" truncate>
                <span className={classes.fieldLabel}>{t.ccLabel}:</span> {ccLine}
              </Text>
            )}
          </Stack>
        </Group>
      </header>

      {message.hasRemoteImages && !allowRemote && (
        <Alert
          variant="default"
          radius="sm"
          icon={<IconPhotoOff size={18} stroke={1.75} />}
          className={classes.banner}
          role="status"
        >
          <Group gap={8} justify="space-between" wrap={isMobile ? 'wrap' : 'nowrap'}>
            <Text size="sm">{t.remoteBlocked}</Text>
            <Group gap={4} wrap="wrap">
              <Button
                variant="subtle"
                color="gray"
                size="compact-sm"
                onClick={() => setShowRemote(true)}
              >
                {t.showImages}
              </Button>
              <Button
                variant="subtle"
                color="gray"
                size="compact-sm"
                onClick={() => {
                  setShowRemote(true)
                  onAlwaysShowImages(message.from.email)
                }}
              >
                {t.alwaysShowFrom}
              </Button>
            </Group>
          </Group>
        </Alert>
      )}

      <Box aria-label={t.messageBody} className={classes.content}>
        {message.html ? (
          <MessageFrame
            html={message.html}
            allowRemote={allowRemote}
            showQuoted={showQuoted}
            title={message.subject}
          />
        ) : (
          <Text className={classes.text}>{showQuoted ? message.text : textParts?.body}</Text>
        )}
      </Box>

      {hasQuote && (
        <Button
          variant="default"
          radius="xl"
          size="compact-xs"
          c="dimmed"
          leftSection={<IconDots size={14} stroke={2} />}
          aria-expanded={showQuoted}
          onClick={() => setShowQuoted((v) => !v)}
          className={classes.quoteToggle}
        >
          {showQuoted ? t.hideQuoted : t.showQuoted}
        </Button>
      )}

      <AttachmentList mode="read" attachments={message.attachments} urlFor={urlFor} />
    </Stack>
  )
}
