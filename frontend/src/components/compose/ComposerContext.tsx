import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react'

import type { MessageRef } from '../../api/compose'
import type { Address, Attachment } from '../../api/types'

/** What a composer opens with: empty, a reply, a forward or an existing draft. */
export type ComposerInitial = {
  to?: Address[]
  cc?: Address[]
  bcc?: Address[]
  subject?: string
  html?: string
  inReplyTo?: MessageRef
  forwardOf?: MessageRef
  /** Attachments carried over from a draft being edited. */
  attachmentsFrom?: MessageRef
  carried?: Attachment[]
  replaces?: MessageRef
}

type ComposerState = {
  initial: ComposerInitial | null
  open: (initial?: ComposerInitial) => void
  close: () => void
}

const Context = createContext<ComposerState | null>(null)

export function ComposerProvider({ children }: { children: ReactNode }) {
  const [initial, setInitial] = useState<ComposerInitial | null>(null)
  const open = useCallback((next: ComposerInitial = {}) => setInitial(next), [])
  const close = useCallback(() => setInitial(null), [])
  const value = useMemo(() => ({ initial, open, close }), [initial, open, close])
  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useComposer(): ComposerState {
  const state = useContext(Context)
  if (!state) throw new Error('useComposer needs a ComposerProvider')
  return state
}
