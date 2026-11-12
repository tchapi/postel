import { useRef, useState, type KeyboardEvent } from 'react'
import { Alert, Avatar, Button, Group, Modal, Skeleton, Stack, Text } from '@mantine/core'
import { CheckIcon, CircleAlertIcon, MergeIcon } from 'lucide-react'
import type { ContactCard } from '../../types'
import { initials } from '../../lib/format'
import { useI18n } from '../../lib/i18n'
import classes from './MergeDialog.module.css'

export type MergeDialogProps = {
  opened: boolean
  /** The open card, and the one it may be a duplicate of (undefined while it loads). */
  first: ContactCard | undefined
  second: ContactCard | undefined
  photoUrl: (card: ContactCard) => string | undefined
  /** `keep` stays and takes in the other, which is deleted. */
  onMerge: (keep: ContactCard, other: ContactCard) => Promise<void>
  onCancel: () => void
  /** What went wrong with the last attempt, in the user's words. */
  problem?: string | null
}

/** The few lines that tell one card from the other. */
function lines(card: ContactCard): string[] {
  const meta = [card.org !== card.name ? card.org : '', card.title].filter(Boolean).join(' · ')
  return [meta, ...card.emails.map((e) => e.value), ...card.phones.map((p) => p.value)].filter(
    Boolean,
  )
}

/**
 * Two cards that may be the same person, side by side. The user says which one is the
 * main one; the backend does the merge, so what is shown here never drifts from what
 * is written.
 */
export function MergeDialog({
  opened,
  first,
  second,
  photoUrl,
  onMerge,
  onCancel,
  problem,
}: MergeDialogProps) {
  const { t } = useI18n()
  const [keepSecond, setKeepSecond] = useState(false)
  const [busy, setBusy] = useState(false)
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const cards = [first, second]
  const ready = first !== undefined && second !== undefined

  const merge = async () => {
    if (!first || !second || busy) return
    setBusy(true)
    try {
      await (keepSecond ? onMerge(second, first) : onMerge(first, second))
    } finally {
      setBusy(false)
    }
  }

  // A radio group: the arrows move the choice and the focus together
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return
    e.preventDefault()
    const next = !keepSecond
    setKeepSecond(next)
    refs.current[next ? 1 : 0]?.focus()
  }

  return (
    <Modal
      opened={opened}
      onClose={busy ? () => undefined : onCancel}
      title={t.contact.mergeTitle}
      centered
      size="lg"
    >
      <Stack gap={16}>
        {problem && (
          <Alert color="red" icon={<CircleAlertIcon size={18} />} role="alert">
            {problem}
          </Alert>
        )}

        <Text size="sm" c="dimmed" id="merge-keep">
          {t.contact.mergeKeep}
        </Text>
        <div
          className={classes.choices}
          role="radiogroup"
          aria-labelledby="merge-keep"
          onKeyDown={onKeyDown}
        >
          {cards.map((card, i) => {
            const checked = keepSecond === (i === 1)
            if (!card) return <Skeleton key={i} className={classes.choice} height={132} />
            return (
              <button
                key={card.id}
                type="button"
                ref={(el) => {
                  refs.current[i] = el
                }}
                role="radio"
                aria-checked={checked}
                tabIndex={checked ? 0 : -1}
                className={classes.choice}
                data-checked={checked || undefined}
                disabled={busy}
                onClick={() => setKeepSecond(i === 1)}
              >
                <span className={classes.mark} aria-hidden>
                  {checked && <CheckIcon size={12} strokeWidth={3} />}
                </span>
                <Avatar
                  radius="xl"
                  size={44}
                  color="initials"
                  name={card.name}
                  src={photoUrl(card)}
                  alt=""
                >
                  {initials({ name: card.name, email: card.emails[0]?.value ?? '' })}
                </Avatar>
                <span className={classes.name}>{card.name}</span>
                {lines(card)
                  .slice(0, 4)
                  .map((line, n) => (
                    <span key={n} className={classes.line}>
                      {line}
                    </span>
                  ))}
              </button>
            )
          })}
        </div>

        <Stack gap={4}>
          <Text size="sm">{t.contact.mergeExplain}</Text>
          <Text size="sm" c="dimmed">
            {t.contact.mergeNoUndo}
          </Text>
        </Stack>

        <Group justify="flex-end" gap={8}>
          <Button variant="default" onClick={onCancel} disabled={busy}>
            {t.contact.cancel}
          </Button>
          <Button
            leftSection={<MergeIcon size={16} strokeWidth={1.75} />}
            onClick={() => void merge()}
            loading={busy}
            disabled={!ready}
            data-autofocus
          >
            {t.contact.mergeConfirm}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
