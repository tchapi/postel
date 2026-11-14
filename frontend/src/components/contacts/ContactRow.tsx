import { memo, type CSSProperties } from 'react'
import { Avatar, Text } from '@mantine/core'
import type { ContactSummary, Density } from '../../types'
import { secondLine } from '../../lib/addressBook'
import { initials } from '../../lib/format'
import { phoneLabel, usePhoneReader } from '../../lib/phone'
import classes from './ContactRow.module.css'

// Slot per row, the highlight inset 2px top and bottom like the message rows
export const CONTACT_ROW_HEIGHT: Record<Density, number> = { comfortable: 60, compact: 46 }
export const AVATAR_SIZE: Record<Density, number> = { comfortable: 36, compact: 28 }

export type ContactRowProps = {
  card: ContactSummary
  domId: string
  active: boolean
  density: Density
  photoUrl?: string
  style?: CSSProperties
  onActivate: (id: string) => void
}

function ContactRowImpl({
  card,
  domId,
  active,
  density,
  photoUrl,
  style,
  onActivate,
}: ContactRowProps) {
  const readPhone = usePhoneReader()
  const detail = secondLine(card, (raw) => phoneLabel(readPhone(raw)))
  const size = AVATAR_SIZE[density]
  return (
    <div style={style} className={classes.slot} data-density={density}>
      <div
        id={domId}
        role="option"
        aria-selected={active}
        className={classes.row}
        data-active={active || undefined}
        onClick={() => onActivate(card.id)}
      >
        <Avatar
          radius="xl"
          size={size}
          color="initials"
          name={card.name}
          src={photoUrl}
          imageProps={{ loading: 'lazy' }}
          aria-hidden
        >
          {initials({ name: card.name, email: card.emails[0] ?? '' })}
        </Avatar>
        <div className={classes.text}>
          <Text span className={classes.name} truncate>
            {card.name}
          </Text>
          {detail && (
            <Text span size="sm" c="dimmed" truncate className={classes.detail}>
              {detail}
            </Text>
          )}
        </div>
      </div>
    </div>
  )
}

export const ContactRow = memo(ContactRowImpl)
