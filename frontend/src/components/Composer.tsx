import { useRef, useState } from 'react'
import {
  ActionIcon,
  Box,
  Button,
  Drawer,
  Group,
  Kbd,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core'
import { Dropzone, type FileRejection } from '@mantine/dropzone'
import { getHotkeyHandler, useDebouncedCallback, useInterval } from '@mantine/hooks'
import { Link, RichTextEditor } from '@mantine/tiptap'
import { useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {
  EllipsisIcon,
  Maximize2Icon,
  Minimize2Icon,
  PaperclipIcon,
  SendIcon,
  Trash2Icon,
  UploadIcon,
  XIcon,
} from 'lucide-react'
import type { Addr, ComposeMode, Contact, DraftInput } from '../types'
import { formatSize, timeAgo } from '../lib/format'
import { useI18n } from '../lib/i18n'
import { keyLabel } from '../lib/shortcuts'
import { AttachmentList, type UploadItem } from './AttachmentList'
import { MessageFrame } from './MessageFrame'
import { RecipientInput } from './RecipientInput'
import classes from './Composer.module.css'

const MAX_SIZE = 25 * 1024 * 1024

export type ComposerProps = {
  mode: ComposeMode
  initial: DraftInput
  /** "Tom Lefèvre, 23 Oct" for the collapsed quote toggle. */
  quotedLabel?: string
  signatureHtml: string
  isMobile: boolean
  useContacts: (q: string) => { data?: Contact[]; isFetching?: boolean }
  onUpload: (
    file: File,
    opts: { onProgress: (r: number) => void; signal: AbortSignal },
  ) => Promise<{ id: string }>
  onSaveDraft: (draft: DraftInput) => Promise<{ draftUid: number }>
  /** The container delays the real send and offers Undo. */
  onSend: (draft: DraftInput) => void
  onDiscard: (draftUid: number | undefined) => void
  /** Esc / close: the draft is kept. */
  onClose: (draft: DraftInput) => void
}

/** Mount with a `key` per compose session; `opened` is driven by mounting. */
export function Composer(props: ComposerProps) {
  const {
    mode,
    initial,
    quotedLabel,
    signatureHtml,
    isMobile,
    useContacts,
    onUpload,
    onSaveDraft,
    onSend,
    onDiscard,
    onClose,
  } = props
  const { t, locale } = useI18n()

  const [to, setTo] = useState<Addr[]>(initial.to)
  const [cc, setCc] = useState<Addr[]>(initial.cc)
  const [bcc, setBcc] = useState<Addr[]>(initial.bcc)
  const [showCc, setShowCc] = useState(initial.cc.length > 0)
  const [showBcc, setShowBcc] = useState(initial.bcc.length > 0)
  const [subject, setSubject] = useState(initial.subject)
  const [expanded, setExpanded] = useState(false)
  const [showQuoted, setShowQuoted] = useState(false)
  const [uploads, setUploads] = useState<UploadItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [draftUid, setDraftUid] = useState(initial.draftUid)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [, setTick] = useState(0)
  useInterval(() => setTick((n) => n + 1), 5000, { autoInvoke: true })

  const files = useRef(new Map<string, File>())
  const aborts = useRef(new Map<string, AbortController>())
  const ids = useRef(new Map<string, string>())

  const editor = useEditor({
    extensions: [StarterKit.configure({ link: false }), Link],
    content: initial.html || `<p></p>${signatureHtml ? `<p></p>${signatureHtml}` : ''}`,
    immediatelyRender: true,
    // Replies start in the body; new messages start in To (see RecipientInput autoFocus).
    editorProps: { attributes: initial.to.length ? { 'data-autofocus': 'true' } : {} },
    onUpdate: () => scheduleSave(),
  })

  const draft = (): DraftInput => ({
    to,
    cc,
    bcc,
    subject,
    html: editor?.getHTML() ?? '',
    attachmentIds: uploads
      .filter((u) => u.status === 'done')
      .map((u) => ids.current.get(u.key)!)
      .filter(Boolean),
    inReplyTo: initial.inReplyTo,
    quotedHtml: initial.quotedHtml,
    draftUid,
  })

  const save = async () => {
    setSaving(true)
    try {
      const res = await onSaveDraft(draft())
      setDraftUid(res.draftUid)
      setSavedAt(Date.now())
    } finally {
      setSaving(false)
    }
  }
  const scheduleSave = useDebouncedCallback(() => void save(), 2000)

  const send = () => {
    if (!to.length && !cc.length && !bcc.length) {
      setError(t.needRecipient)
      return
    }
    scheduleSave.cancel()
    onSend(draft())
  }

  const startUpload = (file: File, key: string = crypto.randomUUID()) => {
    files.current.set(key, file)
    const ctrl = new AbortController()
    aborts.current.set(key, ctrl)
    setUploads((u) => [
      ...u.filter((x) => x.key !== key),
      { key, name: file.name, size: file.size, mime: file.type, status: 'uploading', progress: 0 },
    ])
    const patch = (p: Partial<UploadItem>) =>
      setUploads((u) => u.map((x) => (x.key === key ? { ...x, ...p } : x)))
    onUpload(file, { signal: ctrl.signal, onProgress: (progress) => patch({ progress }) })
      .then(({ id }) => {
        ids.current.set(key, id)
        patch({ status: 'done', progress: 1 })
        scheduleSave()
      })
      .catch(() => {
        if (!ctrl.signal.aborted) patch({ status: 'error' })
      })
  }

  const onReject = (rejections: FileRejection[]) =>
    setUploads((u) => [
      ...u,
      ...rejections.map((r) => ({
        key: crypto.randomUUID(),
        name: r.file.name,
        size: r.file.size,
        mime: r.file.type,
        status: 'rejected' as const,
        progress: 0,
        error: t.tooLarge(formatSize(r.file.size, locale)),
      })),
    ])

  const removeUpload = (key: string) => {
    aborts.current.get(key)?.abort()
    aborts.current.delete(key)
    files.current.delete(key)
    ids.current.delete(key)
    setUploads((u) => u.filter((x) => x.key !== key))
    scheduleSave()
  }

  const title =
    mode === 'new'
      ? t.newMessage
      : mode === 'forward'
        ? t.forwardTitle
        : mode === 'draft'
          ? t.editDraft
          : t.reply
  const fullScreen = isMobile || expanded

  const savedHint = saving ? t.saving : savedAt ? t.savedAgo(timeAgo(savedAt, locale)) : t.notSaved

  const ccToggles = (
    <Group gap={0} wrap="nowrap">
      {!showCc && (
        <Button
          variant="subtle"
          color="gray"
          size="compact-sm"
          fw={400}
          onClick={() => setShowCc(true)}
        >
          {t.ccLabel}
        </Button>
      )}
      {!showBcc && (
        <Button
          variant="subtle"
          color="gray"
          size="compact-sm"
          fw={400}
          onClick={() => setShowBcc(true)}
        >
          {t.bccLabel}
        </Button>
      )}
    </Group>
  )

  return (
    <Drawer.Root
      opened
      onClose={() => onClose(draft())}
      position="right"
      size={fullScreen ? '100%' : 720}
      closeOnClickOutside={false}
      trapFocus
      returnFocus
    >
      <Drawer.Overlay backgroundOpacity={0.35} />
      <Drawer.Content onKeyDown={getHotkeyHandler([['mod+Enter', send]])}>
        <Stack gap={0} h="100%">
          <Drawer.Header className={classes.header}>
            {isMobile && (
              <ActionIcon size={44} aria-label={t.closeComposer} onClick={() => onClose(draft())}>
                <XIcon size={22} strokeWidth={1.75} />
              </ActionIcon>
            )}
            <Drawer.Title fw={600} fz="lg" style={{ flex: 1 }}>
              {title}
            </Drawer.Title>
            {isMobile ? (
              <Button leftSection={<SendIcon size={18} strokeWidth={1.75} />} onClick={send}>
                {t.send}
              </Button>
            ) : (
              <Group gap={4}>
                <Tooltip label={expanded ? t.shrink : t.expand}>
                  <ActionIcon
                    size="lg"
                    aria-label={expanded ? t.shrink : t.expand}
                    onClick={() => setExpanded((v) => !v)}
                  >
                    {expanded ? (
                      <Minimize2Icon size={18} strokeWidth={1.75} />
                    ) : (
                      <Maximize2Icon size={18} strokeWidth={1.75} />
                    )}
                  </ActionIcon>
                </Tooltip>
                <Drawer.CloseButton aria-label={t.closeComposer} />
              </Group>
            )}
          </Drawer.Header>

          <ScrollArea style={{ flex: 1, minHeight: 0 }} type="hover" scrollbars="y">
            <Box px={isMobile ? 16 : 20} className={classes.form}>
              <RecipientInput
                label={t.toLabel}
                value={to}
                onChange={(v) => {
                  setTo(v)
                  setError(null)
                  scheduleSave()
                }}
                useContacts={useContacts}
                autoFocus={!initial.to.length}
                rightSection={ccToggles}
              />
              {showCc && (
                <RecipientInput
                  label={t.ccLabel}
                  value={cc}
                  onChange={(v) => {
                    setCc(v)
                    scheduleSave()
                  }}
                  useContacts={useContacts}
                />
              )}
              {showBcc && (
                <RecipientInput
                  label={t.bccLabel}
                  value={bcc}
                  onChange={(v) => {
                    setBcc(v)
                    scheduleSave()
                  }}
                  useContacts={useContacts}
                />
              )}
              <Group gap={10} wrap="nowrap" className={classes.field}>
                <Text
                  component="label"
                  htmlFor="composer-subject"
                  size="sm"
                  c="dimmed"
                  className={classes.fieldLabel}
                >
                  {t.subject}
                </Text>
                <TextInput
                  id="composer-subject"
                  variant="unstyled"
                  style={{ flex: 1 }}
                  value={subject}
                  onChange={(e) => {
                    setSubject(e.currentTarget.value)
                    scheduleSave()
                  }}
                />
              </Group>
              {error && (
                <Text size="sm" c="red" role="alert" pt={8}>
                  {error}
                </Text>
              )}

              <RichTextEditor
                editor={editor}
                variant="subtle"
                className={classes.editor}
                labels={editorLabels(t)}
              >
                <RichTextEditor.Toolbar className={classes.toolbar}>
                  <RichTextEditor.ControlsGroup>
                    <RichTextEditor.Bold />
                    <RichTextEditor.Italic />
                    <RichTextEditor.Underline />
                  </RichTextEditor.ControlsGroup>
                  <RichTextEditor.ControlsGroup>
                    <RichTextEditor.Link />
                    <RichTextEditor.BulletList />
                    <RichTextEditor.Blockquote />
                  </RichTextEditor.ControlsGroup>
                  <RichTextEditor.ControlsGroup>
                    <RichTextEditor.ClearFormatting />
                  </RichTextEditor.ControlsGroup>
                </RichTextEditor.Toolbar>
                <RichTextEditor.Content aria-label={t.messageBody} />
              </RichTextEditor>

              {initial.quotedHtml && (
                <Stack gap={8} pb={8}>
                  <Button
                    variant="default"
                    radius="xl"
                    size="compact-xs"
                    c="dimmed"
                    leftSection={<EllipsisIcon size={14} strokeWidth={2} />}
                    aria-expanded={showQuoted}
                    onClick={() => setShowQuoted((v) => !v)}
                    className={classes.quoteToggle}
                  >
                    {showQuoted ? t.hideQuoted : t.quotedFrom(quotedLabel ?? '')}
                  </Button>
                  {showQuoted && (
                    // Read-only, in the same sandboxed frame as the reader. Appended on send.
                    <div className={classes.quoted}>
                      <MessageFrame
                        html={initial.quotedHtml}
                        allowRemote={false}
                        showQuoted
                        title={t.quotedFrom(quotedLabel ?? '')}
                      />
                    </div>
                  )}
                </Stack>
              )}

              <Stack gap={6} py={12}>
                <Dropzone
                  onDrop={(dropped) => dropped.forEach((f) => startUpload(f))}
                  onReject={onReject}
                  maxSize={MAX_SIZE}
                  multiple
                  className={classes.dropzone}
                >
                  <Group gap={10} justify="center" c="dimmed" mih={36}>
                    <Dropzone.Accept>
                      <UploadIcon size={18} strokeWidth={1.75} />
                    </Dropzone.Accept>
                    <Dropzone.Idle>
                      <PaperclipIcon size={18} strokeWidth={1.75} />
                    </Dropzone.Idle>
                    <Text size="sm">{t.dropFiles}</Text>
                  </Group>
                </Dropzone>
                <AttachmentList
                  mode="compose"
                  items={uploads}
                  onRemove={removeUpload}
                  onRetry={(key) => {
                    const f = files.current.get(key)
                    if (f) startUpload(f, key)
                  }}
                />
              </Stack>
            </Box>
          </ScrollArea>

          <Group gap={10} px={isMobile ? 16 : 20} className={classes.footer} wrap="nowrap">
            {!isMobile && (
              <Button
                onClick={send}
                rightSection={
                  <Kbd size="xs" className={classes.sendKbd}>{`${keyLabel('mod')}↵`}</Kbd>
                }
              >
                {t.send}
              </Button>
            )}
            <Button variant="default" onClick={() => void save()} loading={saving}>
              {t.saveDraft}
            </Button>
            <Text size="xs" c="dimmed" aria-live="polite" style={{ flex: 1 }}>
              {savedHint}
            </Text>
            {isMobile ? (
              <ActionIcon size={44} aria-label={t.discard} onClick={() => onDiscard(draftUid)}>
                <Trash2Icon size={20} strokeWidth={1.75} />
              </ActionIcon>
            ) : (
              <Button
                variant="subtle"
                color="gray"
                leftSection={<Trash2Icon size={16} strokeWidth={1.75} />}
                onClick={() => onDiscard(draftUid)}
              >
                {t.discard}
              </Button>
            )}
          </Group>
        </Stack>
      </Drawer.Content>
    </Drawer.Root>
  )
}

function editorLabels(t: ReturnType<typeof useI18n>['t']) {
  return {
    boldControlLabel: t.editor.bold,
    italicControlLabel: t.editor.italic,
    underlineControlLabel: t.editor.underline,
    linkControlLabel: t.editor.link,
    bulletListControlLabel: t.editor.bulletList,
    blockquoteControlLabel: t.editor.quote,
    clearFormattingControlLabel: t.editor.clear,
  }
}
