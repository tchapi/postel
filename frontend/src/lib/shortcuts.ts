import { useEffect, useEffectEvent, useRef } from 'react'

export type ShortcutId =
  | 'next'
  | 'prev'
  | 'open'
  | 'close'
  | 'goInbox'
  | 'search'
  | 'palette'
  | 'reply'
  | 'replyAll'
  | 'forward'
  | 'archive'
  | 'delete'
  | 'star'
  | 'unread'
  | 'compose'
  | 'send'
  | 'help'

type ShortcutDef = { keys: string[]; group: 'move' | 'act' | 'app'; sequence?: boolean }

/** Single source for the global handler, tooltips, ShortcutsHelp and the cheat sheet. */
export const SHORTCUTS: Record<ShortcutId, ShortcutDef> = {
  next: { keys: ['j'], group: 'move' },
  prev: { keys: ['k'], group: 'move' },
  open: { keys: ['Enter'], group: 'move' },
  close: { keys: ['Escape'], group: 'move' },
  goInbox: { keys: ['g', 'i'], group: 'move', sequence: true },
  search: { keys: ['/'], group: 'move' },
  palette: { keys: ['mod', 'K'], group: 'move' }, // handled by Spotlight's own `shortcut`
  reply: { keys: ['r'], group: 'act' },
  replyAll: { keys: ['a'], group: 'act' },
  forward: { keys: ['f'], group: 'act' },
  archive: { keys: ['e'], group: 'act' },
  delete: { keys: ['#'], group: 'act' },
  star: { keys: ['s'], group: 'act' },
  unread: { keys: ['u'], group: 'act' },
  compose: { keys: ['c'], group: 'app' },
  send: { keys: ['mod', 'Enter'], group: 'app' }, // handled inside the composer
  help: { keys: ['?'], group: 'app' },
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

export function keyLabel(key: string): string {
  switch (key) {
    case 'mod':
      return isMac ? '⌘' : 'Ctrl'
    case 'Enter':
      return '↵'
    case 'Escape':
      return 'Esc'
    default:
      return key
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

type Handlers = Partial<Record<ShortcutId, () => void>>

/**
 * Global single-key shortcuts. Mantine's useHotkeys matches modifiers exactly, so `#` and `?`
 * (Shift on QWERTY, AltGr/Shift on AZERTY) and `g i` sequences need this small matcher on `event.key`.
 */
export function useMailShortcuts(handlers: Handlers, enabled: boolean) {
  const pendingG = useRef<number | null>(null)

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || isTypingTarget(event.target)) return
    const altGraph = event.getModifierState?.('AltGraph') ?? false
    if ((event.ctrlKey || event.metaKey || event.altKey) && !altGraph) return

    const key = event.key
    // Let Enter activate a focused button or link instead of opening the message.
    if (
      key === 'Enter' &&
      event.target instanceof HTMLElement &&
      event.target.closest('button, a, [role="menuitem"], [role="radio"], [role="tab"]')
    )
      return

    if (pendingG.current !== null) {
      window.clearTimeout(pendingG.current)
      pendingG.current = null
      if (key === 'i' && handlers.goInbox) {
        event.preventDefault()
        handlers.goInbox()
      }
      return
    }
    if (key === 'g') {
      pendingG.current = window.setTimeout(() => (pendingG.current = null), 1000)
      return
    }

    const match = (Object.keys(SHORTCUTS) as ShortcutId[]).find((id) => {
      const def = SHORTCUTS[id]
      return !def.sequence && def.keys.length === 1 && def.keys[0] === key
    })
    const handler = match ? handlers[match] : undefined
    if (handler) {
      event.preventDefault()
      handler()
    }
  })

  useEffect(() => {
    if (!enabled) return
    const listener = (e: KeyboardEvent) => onKeyDown(e)
    document.addEventListener('keydown', listener)
    return () => {
      document.removeEventListener('keydown', listener)
      if (pendingG.current !== null) window.clearTimeout(pendingG.current)
    }
  }, [enabled])
}
