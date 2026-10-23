export type Shortcut = { keys: string[]; label: string }

export const SHORTCUTS: { title: string; items: Shortcut[] }[] = [
  {
    title: 'Navigation',
    items: [
      { keys: ['j'], label: 'Next message' },
      { keys: ['k'], label: 'Previous message' },
      { keys: ['Esc'], label: 'Close the message, clear the selection' },
      { keys: ['/'], label: 'Search' },
      { keys: ['⌘', 'K'], label: 'Go to a folder, run a command' },
      { keys: ['?'], label: 'This list' },
    ],
  },
  {
    title: 'Message',
    items: [
      { keys: ['c'], label: 'Compose' },
      { keys: ['r'], label: 'Reply' },
      { keys: ['a'], label: 'Reply all' },
      { keys: ['f'], label: 'Forward' },
      { keys: ['e'], label: 'Archive' },
      { keys: ['#'], label: 'Delete' },
      { keys: ['!'], label: 'Junk' },
      { keys: ['s'], label: 'Star' },
      { keys: ['u'], label: 'Mark as unread' },
      { keys: ['x'], label: 'Select' },
    ],
  },
]
