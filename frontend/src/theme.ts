import {
  ActionIcon,
  createTheme,
  Drawer,
  Kbd,
  Menu,
  Modal,
  Notification,
  Tooltip,
} from '@mantine/core'

// One accent, system fonts, quiet chrome. Unread is weight, not colour.
export const theme = createTheme({
  primaryColor: 'indigo',
  primaryShade: { light: 6, dark: 5 },
  respectReducedMotion: true,
  cursorType: 'pointer',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  fontFamilyMonospace: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  defaultRadius: 'sm',
  fontSizes: {
    xs: '0.75rem',
    sm: '0.8125rem',
    md: '0.875rem',
    lg: '1rem',
    xl: '1.125rem',
  },
  headings: {
    fontWeight: '600',
    sizes: {
      h3: { fontSize: '1.25rem', lineHeight: '1.35' },
    },
  },
  components: {
    ActionIcon: ActionIcon.extend({ defaultProps: { variant: 'subtle', color: 'gray' } }),
    Tooltip: Tooltip.extend({ defaultProps: { openDelay: 400 } }),
    Menu: Menu.extend({ defaultProps: { shadow: 'md', radius: 'md' } }),
    Modal: Modal.extend({
      defaultProps: { centered: true, radius: 'md', overlayProps: { backgroundOpacity: 0.4 } },
    }),
    Drawer: Drawer.extend({ defaultProps: { overlayProps: { backgroundOpacity: 0.25 } } }),
    Notification: Notification.extend({ defaultProps: { radius: 'md' } }),
    Kbd: Kbd.extend({ defaultProps: { size: 'xs' } }),
  },
})
