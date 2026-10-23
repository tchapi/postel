import { Anchor, Group, Paper, Text } from '@mantine/core'
import { IconFile, IconFileTypePdf, IconFileZip, IconPhoto } from '@tabler/icons-react'

import { partUrl } from '../../api/queries'
import type { Attachment } from '../../api/types'
import { formatBytes } from '../../lib/format'

function iconFor(mime: string) {
  if (mime.startsWith('image/')) return IconPhoto
  if (mime === 'application/pdf') return IconFileTypePdf
  if (mime.includes('zip') || mime.includes('compressed')) return IconFileZip
  return IconFile
}

type Props = {
  folderId: string
  uid: number
  attachments: Attachment[]
}

export function AttachmentList({ folderId, uid, attachments }: Props) {
  const files = attachments.filter((a) => !a.inline)
  if (files.length === 0) return null

  return (
    <Group gap="xs">
      {files.map((file) => {
        const Icon = iconFor(file.mime)
        return (
          <Paper key={file.id} withBorder px="sm" py={6} radius="sm">
            <Group gap={6} wrap="nowrap">
              <Icon size={16} stroke={1.5} />
              <Anchor
                href={partUrl(folderId, uid, file.id)}
                download={file.name}
                size="sm"
                fw={500}
              >
                {file.name}
              </Anchor>
              <Text size="xs" c="dimmed">
                {formatBytes(file.size)}
              </Text>
            </Group>
          </Paper>
        )
      })}
    </Group>
  )
}
