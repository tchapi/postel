import { ActionIcon, Button, Group, Paper, Progress, Stack, Text, Tooltip } from '@mantine/core'
import { useState } from 'react'
import {
  CalendarIcon,
  ContactIcon,
  DownloadIcon,
  EyeIcon,
  FileArchiveIcon,
  FileCodeIcon,
  FileHeadphoneIcon,
  FileIcon,
  FileImageIcon,
  FilePlayIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FileTypeIcon,
  MailIcon,
  PresentationIcon,
  XIcon,
  type LucideIcon,
} from 'lucide-react'
import type { Attachment } from '../types'
import { formatSize } from '../lib/format'
import { useI18n } from '../lib/i18n'
import classes from './AttachmentList.module.css'

type Kind = { icon: LucideIcon; color?: string }

const KINDS: { kind: Kind; mime: RegExp; ext: string[] }[] = [
  { kind: { icon: FileTextIcon, color: 'red' }, mime: /^application\/pdf$/, ext: ['pdf'] },
  { kind: { icon: FileImageIcon, color: 'grape' }, mime: /^image\//, ext: ['heic'] },
  {
    kind: { icon: FileSpreadsheetIcon, color: 'green' },
    mime: /spreadsheet|excel|^text\/csv$/,
    ext: ['xls', 'xlsx', 'ods', 'csv', 'numbers'],
  },
  {
    kind: { icon: FileTypeIcon, color: 'blue' },
    mime: /wordprocessing|msword|opendocument\.text|rtf/,
    ext: ['doc', 'docx', 'odt', 'rtf', 'pages'],
  },
  {
    kind: { icon: PresentationIcon, color: 'orange' },
    mime: /presentation|powerpoint/,
    ext: ['ppt', 'pptx', 'odp', 'key'],
  },
  {
    kind: { icon: FileArchiveIcon, color: 'yellow' },
    mime: /zip|compressed|x-tar|x-rar|x-bzip/,
    ext: ['zip', 'gz', 'tgz', 'tar', 'rar', '7z', 'bz2'],
  },
  { kind: { icon: FileHeadphoneIcon, color: 'cyan' }, mime: /^audio\//, ext: [] },
  { kind: { icon: FilePlayIcon, color: 'pink' }, mime: /^video\//, ext: [] },
  { kind: { icon: CalendarIcon, color: 'teal' }, mime: /^text\/calendar$/, ext: ['ics'] },
  { kind: { icon: ContactIcon, color: 'teal' }, mime: /vcard/, ext: ['vcf'] },
  { kind: { icon: MailIcon }, mime: /^message\//, ext: ['eml'] },
  {
    kind: { icon: FileCodeIcon },
    mime: /json|xml|^text\/(html|css|javascript)$/,
    ext: ['json', 'xml', 'html', 'js', 'ts', 'py', 'php', 'sh', 'sql', 'yaml', 'yml'],
  },
  { kind: { icon: FileTextIcon }, mime: /^text\//, ext: ['txt', 'md', 'log'] },
]

/** Many clients send application/octet-stream, so the extension gets a say too. */
function kindOf(mime: string, name: string): Kind {
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : ''
  const found =
    KINDS.find((k) => k.mime.test(mime.toLowerCase())) ?? KINDS.find((k) => k.ext.includes(ext))
  return found?.kind ?? { icon: FileIcon }
}

/** What the part endpoint agrees to serve inline. */
function previewable(a: Attachment): boolean {
  return (
    a.mime.startsWith('image/') ||
    a.mime === 'application/pdf' ||
    a.name.toLowerCase().endsWith('.pdf')
  )
}

function MimeIcon({ mime, name }: { mime: string; name: string }) {
  const { icon: Icon, color } = kindOf(mime, name)
  return (
    <span
      className={classes.icon}
      style={color ? { color: `var(--mantine-color-${color}-text)` } : undefined}
    >
      <Icon size={18} strokeWidth={1.75} />
    </span>
  )
}

/** The server's thumbnail for an image, the type icon when there is none. */
function Thumb({ mime, name, src }: { mime: string; name: string; src: string }) {
  const [failed, setFailed] = useState(false)
  if (!mime.startsWith('image/') || failed) return <MimeIcon mime={mime} name={name} />
  return (
    <img
      className={classes.thumb}
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}

export type UploadItem = {
  key: string
  name: string
  size: number
  mime: string
  status: 'uploading' | 'done' | 'error' | 'rejected'
  /** 0–1 while uploading */
  progress: number
  error?: string
}

type ReadProps = {
  mode: 'read'
  attachments: Attachment[]
  /** URL for an attachment, `inline` for preview, `download` for Content-Disposition: attachment. */
  urlFor: (a: Attachment, disposition: 'inline' | 'download' | 'thumb') => string
}

type ComposeProps = {
  mode: 'compose'
  items: UploadItem[]
  onRemove: (key: string) => void
  onRetry: (key: string) => void
}

export function AttachmentList(props: ReadProps | ComposeProps) {
  const { t, locale } = useI18n()

  if (props.mode === 'read') {
    const files = props.attachments.filter((a) => !a.inline)
    if (!files.length) return null
    const total = files.reduce((s, a) => s + a.size, 0)
    return (
      <Stack gap={8} component="section" aria-label={t.attachments}>
        <Text size="xs" c="dimmed">
          {t.attachmentsSummary(files.length, formatSize(total, locale))}
        </Text>
        <Group gap={8}>
          {files.map((a) => (
            <Paper key={a.id} withBorder radius="sm" className={classes.chip}>
              <Thumb mime={a.mime} name={a.name} src={props.urlFor(a, 'thumb')} />
              <Text size="sm" truncate className={classes.chipName} title={a.name}>
                {a.name}
              </Text>
              <Text size="xs" c="dimmed" className={classes.size}>
                {formatSize(a.size, locale)}
              </Text>
              {previewable(a) && (
                <Tooltip label={t.preview(a.name)}>
                  <ActionIcon
                    component="a"
                    href={props.urlFor(a, 'inline')}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t.preview(a.name)}
                  >
                    <EyeIcon size={16} strokeWidth={1.75} />
                  </ActionIcon>
                </Tooltip>
              )}
              <Tooltip label={t.download(a.name)}>
                <ActionIcon
                  component="a"
                  href={props.urlFor(a, 'download')}
                  download={a.name}
                  aria-label={t.download(a.name)}
                >
                  <DownloadIcon size={16} strokeWidth={1.75} />
                </ActionIcon>
              </Tooltip>
            </Paper>
          ))}
        </Group>
      </Stack>
    )
  }

  if (!props.items.length) return null
  return (
    <Stack gap={4} component="ul" aria-label={t.attachments} className={classes.list}>
      {props.items.map((f) => {
        const failed = f.status === 'error' || f.status === 'rejected'
        return (
          <Paper
            key={f.key}
            component="li"
            withBorder
            radius="sm"
            className={classes.row}
            data-failed={failed || undefined}
          >
            <MimeIcon mime={f.mime} name={f.name} />
            <Text size="sm" truncate className={classes.name}>
              {f.name}
            </Text>
            {f.status === 'uploading' && (
              <Progress
                value={f.progress * 100}
                size="sm"
                color="gray"
                className={classes.progress}
                aria-label={f.name}
              />
            )}
            {f.status === 'uploading' && (
              <Text size="xs" c="dimmed">
                {formatSize(f.size * f.progress, locale)} / {formatSize(f.size, locale)}
              </Text>
            )}
            {f.status === 'done' && (
              <Text size="xs" c="dimmed" ml="auto">
                {formatSize(f.size, locale)}
              </Text>
            )}
            {failed && (
              <Text size="xs" c="red" role="alert" className={classes.error}>
                {f.error ?? t.uploadFailed}
              </Text>
            )}
            {f.status === 'error' && (
              <Button
                variant="subtle"
                color="gray"
                size="compact-xs"
                onClick={() => props.onRetry(f.key)}
              >
                {t.retry}
              </Button>
            )}
            <Tooltip label={f.status === 'uploading' ? t.cancelUpload : t.remove(f.name)}>
              <ActionIcon
                aria-label={f.status === 'uploading' ? t.cancelUpload : t.remove(f.name)}
                onClick={() => props.onRemove(f.key)}
              >
                <XIcon size={14} strokeWidth={2} />
              </ActionIcon>
            </Tooltip>
          </Paper>
        )
      })}
    </Stack>
  )
}
