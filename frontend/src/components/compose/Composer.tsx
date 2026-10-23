import {
  ActionIcon,
  Anchor,
  Box,
  Button,
  CloseButton,
  Drawer,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core'
import { Dropzone } from '@mantine/dropzone'
import { useMediaQuery } from '@mantine/hooks'
import { modals } from '@mantine/modals'
import { notifications } from '@mantine/notifications'
import { Link, RichTextEditor } from '@mantine/tiptap'
import {
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconPaperclip,
  IconSend,
  IconX,
} from '@tabler/icons-react'
import { useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useEffect, useRef, useState } from 'react'

import {
  deleteUpload,
  type MessageRef,
  type Upload,
  uploadFile,
  useSaveDraft,
  useSendMessage,
} from '../../api/compose'
import { useDeleteMessages } from '../../api/mutations'
import { useSettings } from '../../api/settings'
import type { Address, Attachment } from '../../api/types'
import { formatBytes } from '../../lib/format'
import { type ComposerInitial, useComposer } from './ComposerContext'
import { RecipientsInput } from './RecipientsInput'

const AUTOSAVE_MS = 30_000

type PendingUpload = { key: string; name: string; size: number; upload?: Upload; failed?: boolean }

export function Composer() {
  const { initial, close } = useComposer()
  const { data: settings } = useSettings()
  if (!initial) return null
  return (
    <ComposerDrawer
      key={initialKey(initial)}
      initial={withSignature(initial, settings?.signature ?? null)}
      onClose={close}
    />
  )
}

/** The signature goes under the cursor, above any quote. Drafts already have theirs. */
function withSignature(initial: ComposerInitial, signature: string | null): ComposerInitial {
  if (!signature || initial.replaces) return initial
  const block = `<p>-- </p>${signature}`
  if (!initial.html) return { ...initial, html: `<p></p>${block}` }
  // Replies and forwards start with an empty paragraph to type in
  return { ...initial, html: initial.html.replace(/^<p><\/p>/, `<p></p>${block}`) }
}

/** A new key remounts the form with fresh state, no reconciliation of a half-typed mail. */
function initialKey(initial: ComposerInitial): string {
  const ref = (r?: MessageRef) => (r ? `${r.folder}/${r.uid}` : '')
  return `${ref(initial.replaces)}|${ref(initial.inReplyTo)}|${ref(initial.forwardOf)}|${initial.subject ?? ''}`
}

function ComposerDrawer({ initial, onClose }: { initial: ComposerInitial; onClose: () => void }) {
  const mobile = useMediaQuery('(max-width: 48em)')
  const [full, setFull] = useState(false)
  const [to, setTo] = useState<Address[]>(initial.to ?? [])
  const [cc, setCc] = useState<Address[]>(initial.cc ?? [])
  const [bcc, setBcc] = useState<Address[]>(initial.bcc ?? [])
  const [showCc, setShowCc] = useState((initial.cc?.length ?? 0) + (initial.bcc?.length ?? 0) > 0)
  const [subject, setSubject] = useState(initial.subject ?? '')
  const [uploads, setUploads] = useState<PendingUpload[]>([])
  const [carried, setCarried] = useState<Attachment[]>(
    initial.carried?.filter((a) => !a.inline) ?? [],
  )
  const [replaces, setReplaces] = useState<MessageRef | undefined>(initial.replaces)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const dirty = useRef(false)
  const send = useSendMessage()
  const save = useSaveDraft()
  const remove = useDeleteMessages()

  const editor = useEditor({
    extensions: [StarterKit, Link.configure({ openOnClick: false })],
    content: initial.html ?? '<p></p>',
    autofocus: initial.to?.length ? 'start' : false,
    onUpdate: () => {
      dirty.current = true
    },
  })

  const markDirty =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      dirty.current = true
      set(value)
    }

  const payload = () => ({
    to,
    cc,
    bcc,
    subject,
    html: editor?.getHTML() ?? null,
    uploads: uploads.flatMap((u) => (u.upload ? [u.upload.id] : [])),
    inReplyTo: initial.inReplyTo,
    forwardOf: initial.forwardOf,
    attachmentsFrom:
      carried.length > 0 && initial.attachmentsFrom
        ? { ...initial.attachmentsFrom, sections: carried.map((a) => a.id) }
        : undefined,
    replaces,
  })

  const isEmpty = () =>
    to.length + cc.length + bcc.length === 0 &&
    subject.trim() === '' &&
    (editor?.getText().trim() ?? '') === '' &&
    uploads.length + carried.length === 0

  const saveDraft = async (silent = false): Promise<boolean> => {
    if (!dirty.current && silent) return true
    try {
      const saved = await save.mutateAsync(payload())
      setReplaces(saved)
      setSavedAt(new Date())
      dirty.current = false
      if (!silent) notifications.show({ message: 'Draft saved' })
      return true
    } catch {
      notifications.show({ color: 'red', message: 'Could not save the draft' })
      return false
    }
  }

  /** Closing keeps the draft: whatever was typed is saved first. */
  const closeKeepingDraft = async () => {
    if (isEmpty() && !replaces) {
      onClose()
      return
    }
    if (await saveDraft(true)) onClose()
  }

  useEffect(() => {
    const timer = setInterval(() => void saveDraft(true), AUTOSAVE_MS)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, cc, bcc, subject, uploads, carried, replaces, editor])

  const uploading = uploads.some((u) => !u.upload && !u.failed)

  const addFiles = async (files: File[]) => {
    dirty.current = true
    for (const file of files) {
      const key = `${file.name}-${file.size}-${Date.now()}-${Math.random()}`
      setUploads((list) => [...list, { key, name: file.name, size: file.size }])
      try {
        const upload = await uploadFile(file)
        setUploads((list) => list.map((u) => (u.key === key ? { ...u, upload } : u)))
      } catch {
        setUploads((list) => list.map((u) => (u.key === key ? { ...u, failed: true } : u)))
        notifications.show({ color: 'red', message: `Could not upload ${file.name}` })
      }
    }
  }

  const removeUpload = (pending: PendingUpload) => {
    dirty.current = true
    setUploads((list) => list.filter((u) => u.key !== pending.key))
    if (pending.upload) void deleteUpload(pending.upload.id).catch(() => undefined)
  }

  const doSend = () => {
    if (to.length + cc.length + bcc.length === 0) {
      notifications.show({ color: 'red', message: 'Add at least one recipient' })
      return
    }
    send.mutate(payload(), {
      onSuccess: () => {
        notifications.show({ message: 'Sent' })
        onClose()
      },
      onError: () => notifications.show({ color: 'red', message: 'Could not send the message' }),
    })
  }

  /** Discarding deletes: the saved draft, the uploads, the lot. */
  const discard = () => {
    const wipe = () => {
      uploads.forEach((u) => u.upload && void deleteUpload(u.upload.id).catch(() => undefined))
      if (replaces) remove.mutate({ folder: replaces.folder, uids: [replaces.uid] })
      onClose()
    }
    if (isEmpty() && !replaces) {
      onClose()
      return
    }
    modals.openConfirmModal({
      title: replaces ? 'Delete this draft?' : 'Discard this message?',
      children: (
        <Text size="sm">
          {replaces
            ? 'The draft will be removed from the Drafts folder.'
            : 'What you typed will be lost. Closing the window instead keeps it as a draft.'}
        </Text>
      ),
      labels: { confirm: replaces ? 'Delete draft' : 'Discard', cancel: 'Keep editing' },
      confirmProps: { color: 'red' },
      onConfirm: wipe,
    })
  }

  return (
    <Drawer
      opened
      onClose={() => void closeKeepingDraft()}
      position="right"
      size={mobile || full ? '100%' : 720}
      title={
        <Group gap="xs" wrap="nowrap">
          <Text fw={600} truncate maw={mobile ? 220 : 520}>
            {subject || 'New message'}
          </Text>
          {!mobile && (
            <Tooltip label={full ? 'Smaller' : 'Full screen'}>
              <ActionIcon
                size="sm"
                onClick={() => setFull((value) => !value)}
                aria-label={full ? 'Smaller' : 'Full screen'}
              >
                {full ? <IconArrowsMinimize size={14} /> : <IconArrowsMaximize size={14} />}
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      }
      padding="md"
      trapFocus={false}
      styles={{ body: { height: 'calc(100% - 60px)', display: 'flex', flexDirection: 'column' } }}
    >
      <Stack gap="xs" style={{ flex: 1, minHeight: 0 }}>
        <Group align="flex-end" gap="xs" wrap="nowrap">
          <Box style={{ flex: 1 }}>
            <RecipientsInput
              label="To"
              value={to}
              onChange={markDirty(setTo)}
              autoFocus={!initial.to?.length}
            />
          </Box>
          {!showCc && (
            <Anchor size="xs" c="dimmed" onClick={() => setShowCc(true)} pb={8}>
              Cc / Bcc
            </Anchor>
          )}
        </Group>
        {showCc && (
          <>
            <RecipientsInput label="Cc" value={cc} onChange={markDirty(setCc)} />
            <RecipientsInput label="Bcc" value={bcc} onChange={markDirty(setBcc)} />
          </>
        )}
        <TextInput
          label="Subject"
          size="sm"
          value={subject}
          onChange={(e) => markDirty(setSubject)(e.currentTarget.value)}
          styles={{ label: { fontWeight: 400, color: 'var(--mantine-color-dimmed)' } }}
        />

        <RichTextEditor
          editor={editor}
          style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
        >
          <RichTextEditor.Toolbar>
            <RichTextEditor.ControlsGroup>
              <RichTextEditor.Bold />
              <RichTextEditor.Italic />
              <RichTextEditor.Underline />
              <RichTextEditor.ClearFormatting />
            </RichTextEditor.ControlsGroup>
            <RichTextEditor.ControlsGroup>
              <RichTextEditor.BulletList />
              <RichTextEditor.OrderedList />
              <RichTextEditor.Blockquote />
            </RichTextEditor.ControlsGroup>
            <RichTextEditor.ControlsGroup>
              <RichTextEditor.Link />
              <RichTextEditor.Unlink />
            </RichTextEditor.ControlsGroup>
          </RichTextEditor.Toolbar>
          <RichTextEditor.Content style={{ flex: 1, overflowY: 'auto' }} />
        </RichTextEditor>

        {(uploads.length > 0 || carried.length > 0) && (
          <Group gap="xs">
            {carried.map((file) => (
              <AttachmentChip
                key={`c-${file.id}`}
                name={file.name}
                size={file.size}
                onRemove={() => markDirty(setCarried)(carried.filter((c) => c.id !== file.id))}
              />
            ))}
            {uploads.map((u) => (
              <AttachmentChip
                key={u.key}
                name={u.name}
                size={u.size}
                pending={!u.upload && !u.failed}
                failed={u.failed}
                onRemove={() => removeUpload(u)}
              />
            ))}
          </Group>
        )}

        <Group justify="space-between" pt="xs">
          <Group gap="xs">
            <Button
              leftSection={<IconSend size={16} />}
              onClick={doSend}
              loading={send.isPending}
              disabled={uploading}
            >
              Send
            </Button>
            <Dropzone
              onDrop={(files) => void addFiles(files)}
              activateOnClick
              multiple
              maxSize={50 * 1024 * 1024}
              styles={{ root: { border: 0, padding: 0, background: 'transparent' } }}
            >
              <Tooltip label="Attach files">
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  aria-label="Attach files"
                  component="span"
                >
                  <IconPaperclip size={18} />
                </ActionIcon>
              </Tooltip>
            </Dropzone>
            <Button
              variant="subtle"
              color="gray"
              size="xs"
              onClick={() => void saveDraft()}
              loading={save.isPending}
            >
              Save draft
            </Button>
            {savedAt && (
              <Text size="xs" c="dimmed">
                Saved{' '}
                {savedAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
              </Text>
            )}
          </Group>
          <Tooltip label="Closing the window keeps the draft, this deletes it">
            <Button
              variant="subtle"
              color="gray"
              size="xs"
              leftSection={<IconX size={14} />}
              onClick={discard}
              loading={remove.isPending}
            >
              Discard
            </Button>
          </Tooltip>
        </Group>
      </Stack>
    </Drawer>
  )
}

function AttachmentChip({
  name,
  size,
  pending,
  failed,
  onRemove,
}: {
  name: string
  size: number
  pending?: boolean
  failed?: boolean
  onRemove: () => void
}) {
  return (
    <Paper
      withBorder
      px="sm"
      py={4}
      radius="sm"
      style={failed ? { borderColor: 'var(--mantine-color-red-6)' } : undefined}
    >
      <Group gap={6} wrap="nowrap">
        {pending ? <Loader size={12} /> : <IconPaperclip size={14} stroke={1.5} />}
        <Text size="sm" truncate maw={220}>
          {name}
        </Text>
        <Text size="xs" c="dimmed">
          {formatBytes(size)}
        </Text>
        <CloseButton size="xs" aria-label={`Remove ${name}`} onClick={onRemove} />
      </Group>
    </Paper>
  )
}
