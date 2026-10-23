import { Button, CopyButton, Group, Loader, Modal, ScrollArea, Text } from '@mantine/core'
import { IconCheck, IconCopy, IconDownload } from '@tabler/icons-react'

import { formatSize } from '../lib/format'
import { useI18n } from '../lib/i18n'
import classes from './RawMessageModal.module.css'

/** Past this, the modal shows the start and the download carries the rest. */
const MAX_SHOWN = 512 * 1024

type Props = {
  opened: boolean
  onClose: () => void
  status: 'idle' | 'pending' | 'error' | 'success'
  source: string | undefined
  downloadUrl: string
}

export function RawMessageModal({ opened, onClose, status, source, downloadUrl }: Props) {
  const { t, locale } = useI18n()
  const truncated = (source?.length ?? 0) > MAX_SHOWN
  const shown = truncated ? source!.slice(0, MAX_SHOWN) : source

  return (
    <Modal opened={opened} onClose={onClose} title={t.original} size="xl" centered>
      <Group gap={8} mb={12}>
        <Button
          component="a"
          href={downloadUrl}
          download
          variant="default"
          size="xs"
          leftSection={<IconDownload size={14} />}
        >
          {t.downloadEml}
        </Button>
        <CopyButton value={source ?? ''}>
          {({ copied, copy }) => (
            <Button
              variant="default"
              size="xs"
              disabled={!source}
              leftSection={copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
              onClick={copy}
            >
              {copied ? t.copied : t.copy}
            </Button>
          )}
        </CopyButton>
      </Group>
      {truncated && (
        <Text size="sm" c="dimmed" mb={8}>
          {t.originalTruncated(formatSize(MAX_SHOWN, locale))}
        </Text>
      )}
      {status === 'pending' ? (
        <Group justify="center" py={40}>
          <Loader size="sm" />
        </Group>
      ) : status === 'error' ? (
        <Text size="sm" c="red">
          {t.actionFailed}
        </Text>
      ) : (
        <ScrollArea.Autosize mah="65vh" type="auto" className={classes.box}>
          <pre className={classes.source}>{shown}</pre>
        </ScrollArea.Autosize>
      )}
    </Modal>
  )
}
