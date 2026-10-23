import { ActionIcon, Button, Group, Paper, Progress, Stack, Text, Tooltip } from '@mantine/core'
import { DownloadIcon, EyeIcon, FileIcon, FileTextIcon, ImageIcon, XIcon } from 'lucide-react'
import type { Attachment } from '../types'
import { formatSize } from '../lib/format'
import { useI18n } from '../lib/i18n'
import classes from './AttachmentList.module.css'

function MimeIcon({ mime }: { mime: string }) {
  if (mime.startsWith('image/')) return <ImageIcon size={18} strokeWidth={1.75} />
  if (mime === 'application/pdf') return <FileTextIcon size={18} strokeWidth={1.75} />
  return <FileIcon size={18} strokeWidth={1.75} />
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
  urlFor: (a: Attachment, disposition: 'inline' | 'download') => string
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
              <span className={classes.icon}>
                <MimeIcon mime={a.mime} />
              </span>
              <Text size="sm" truncate maw={260}>
                {a.name}
              </Text>
              <Text size="xs" c="dimmed">
                {formatSize(a.size, locale)}
              </Text>
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
            <span className={classes.icon}>
              <MimeIcon mime={f.mime} />
            </span>
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
