import { createContext, type ReactNode, useContext, useMemo, useState } from 'react'

import { DEFAULT_SETTINGS, useSettings } from '../../api/settings'
import { SettingsModal } from '../settings/SettingsModal'
import { ShortcutsModal } from './ShortcutsModal'

type AppActions = {
  openSettings: () => void
  openShortcuts: () => void
}

const Context = createContext<AppActions | null>(null)

/** Screens that can be opened from anywhere: the user menu, Spotlight, a shortcut. */
export function AppActionsProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<'settings' | 'shortcuts' | null>(null)
  const { data: settings } = useSettings()
  const value = useMemo(
    () => ({
      openSettings: () => setOpen('settings'),
      openShortcuts: () => setOpen('shortcuts'),
    }),
    [],
  )

  return (
    <Context.Provider value={value}>
      {children}
      <SettingsModal
        settings={settings ?? DEFAULT_SETTINGS}
        opened={open === 'settings'}
        onClose={() => setOpen(null)}
      />
      <ShortcutsModal opened={open === 'shortcuts'} onClose={() => setOpen(null)} />
    </Context.Provider>
  )
}

export function useAppActions(): AppActions {
  const actions = useContext(Context)
  if (!actions) throw new Error('useAppActions needs an AppActionsProvider')
  return actions
}
