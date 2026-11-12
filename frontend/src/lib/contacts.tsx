import { createContext, use, useMemo, type ReactNode } from 'react'
import { Tooltip } from '@mantine/core'
import { BookUserIcon } from 'lucide-react'
import type { Addr } from '../types'
import { useI18n } from './i18n'

/**
 * An address found in the user's address books, with the name on its card and its picture's URL.
 * `id` is the card's, to open it; older backends do not send it.
 */
export type KnownContact = { email: string; id?: string; name?: string; photo?: string }

const KnownContactsContext = createContext<ReadonlyMap<string, KnownContact>>(new Map())
export const KnownContactsProvider = KnownContactsContext.Provider

/** Opens a card in the address book; absent when there is none to open. */
const OpenContactContext = createContext<((id: string) => void) | undefined>(undefined)
export const OpenContactProvider = OpenContactContext.Provider

/**
 * The address as the user knows it: the name on the contact card replaces the one
 * the mail carried, and `known` says there is a card at all.
 */
export function useKnownAddr(addr: Addr): {
  addr: Addr
  known: boolean
  photo?: string
  /** Opens the person's card, when there is one and an address book to open it in. */
  open?: () => void
} {
  const contacts = use(KnownContactsContext)
  const openContact = use(OpenContactContext)
  const contact = contacts.get(addr.email.toLowerCase())
  const id = contact?.id
  return useMemo(
    () => ({
      addr: contact?.name ? { ...addr, name: contact.name } : addr,
      known: contact !== undefined,
      photo: contact?.photo,
      open: id && openContact ? () => openContact(id) : undefined,
    }),
    [addr, contact, id, openContact],
  )
}

/** Resolves a list the same way, for recipient lines. */
export function useKnownAddrs(list: Addr[]): Addr[] {
  const contacts = use(KnownContactsContext)
  return useMemo(
    () =>
      list.map((a) => {
        const name = contacts.get(a.email.toLowerCase())?.name
        return name ? { ...a, name } : a
      }),
    [list, contacts],
  )
}

/**
 * An avatar with a small address-book badge in its corner when the person has a card.
 * The badge lives on the avatar so the name line keeps its rhythm.
 */
export function KnownAvatar({
  known,
  size,
  children,
}: {
  known: boolean
  /** The avatar's size in px: the badge scales with it */
  size: number
  children: ReactNode
}) {
  const { t } = useI18n()
  if (!known) return <>{children}</>
  const badge = Math.round(size * 0.46)
  return (
    <span
      role="img"
      aria-label={t.knownContact}
      style={{ position: 'relative', display: 'inline-flex', flex: 'none' }}
    >
      {children}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          right: -2,
          bottom: -2,
          width: badge,
          height: badge,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '50%',
          background: 'var(--mantine-color-body)',
          boxShadow: '0 0 0 1px var(--mantine-color-default-border)',
          color: 'var(--mantine-color-dimmed)',
        }}
      >
        <BookUserIcon size={Math.round(badge * 0.62)} strokeWidth={2.25} />
      </span>
    </span>
  )
}

/** The little book beside a name that comes from the address book. */
export function KnownContactIcon({ size = 13 }: { size?: number }) {
  const { t } = useI18n()
  return (
    <Tooltip label={t.knownContact} withinPortal>
      <BookUserIcon
        size={size}
        strokeWidth={2}
        aria-label={t.knownContact}
        role="img"
        style={{ flex: 'none', color: 'var(--mantine-color-dimmed)', verticalAlign: '-2px' }}
      />
    </Tooltip>
  )
}
