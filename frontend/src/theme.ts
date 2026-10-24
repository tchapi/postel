import {
  createTheme,
  type CSSVariablesResolver,
  type MantineColorsTuple,
  type MantineThemeOverride,
} from '@mantine/core'

/**
 * Accent palettes, muted on purpose: each is generated on an OKLCH lightness ramp with a
 * moderate chroma, so they only differ in hue. Shade 6 carries white text at ≥ 4.6:1.
 * Iris is first: it is the default and the picker follows this order.
 */
export const ACCENTS = {
  iris: [
    '#f6f6fe',
    '#e9e9fe',
    '#d3d3fb',
    '#b7b6f3',
    '#9e9be3',
    '#8783ce',
    '#6e6ab2',
    '#5e599c',
    '#4e4a84',
    '#3e3b6d',
  ],
  ocean: [
    '#eff8ff',
    '#dbeefc',
    '#b8ddf9',
    '#8ac6f0',
    '#64addf',
    '#4494c8',
    '#277aad',
    '#166897',
    '#0c5780',
    '#044668',
  ],
  teal: [
    '#edfaf9',
    '#d7f1f1',
    '#aee3e3',
    '#76cfcf',
    '#43b9b9',
    '#039f9f',
    '#0a8282',
    '#056f6f',
    '#035c5c',
    '#044a4a',
  ],
  sage: [
    '#f1f9f2',
    '#dff1e2',
    '#bfe2c5',
    '#96cea1',
    '#73b782',
    '#559d66',
    '#3b834e',
    '#2c713f',
    '#215e33',
    '#174c27',
  ],
  olive: [
    '#f6f8ee',
    '#eaeed9',
    '#d6dcb3',
    '#bcc584',
    '#a2ac5e',
    '#8a943f',
    '#717a22',
    '#606812',
    '#505708',
    '#404602',
  ],
  amber: [
    '#fcf6ed',
    '#f6e9d7',
    '#edd3b0',
    '#deb67f',
    '#cb9b56',
    '#b58337',
    '#9a6a17',
    '#855903',
    '#704a00',
    '#5b3b01',
  ],
  clay: [
    '#fef4f1',
    '#fde6de',
    '#f9ccbd',
    '#eeab94',
    '#dc8e73',
    '#c67559',
    '#aa5c40',
    '#944c32',
    '#7d3e27',
    '#67311d',
  ],
  rose: [
    '#fef4f6',
    '#fde4e9',
    '#f9c9d2',
    '#eea7b6',
    '#db899c',
    '#c57085',
    '#a9576c',
    '#93475b',
    '#7d3a4b',
    '#662d3c',
  ],
} satisfies Record<string, MantineColorsTuple>

export type AccentName = keyof typeof ACCENTS
export const ACCENT_NAMES = Object.keys(ACCENTS) as AccentName[]
export const DEFAULT_ACCENT: AccentName = 'iris'

// Warm neutrals instead of Mantine's cool blue-greys: the biggest step away from the "enterprise chat" look.
const gray: MantineColorsTuple = [
  '#fdfaf6',
  '#f6f3ef',
  '#ece8e3',
  '#e0dcd6',
  '#c0bdb9',
  '#a4a19d',
  '#82807c',
  '#65635f',
  '#4c4a47',
  '#302d2b',
]
const dark: MantineColorsTuple = [
  '#d4d0ca',
  '#b3b1ad',
  '#888682',
  '#6e6b68',
  '#4a4744',
  '#403e3b',
  '#363431',
  '#2c2a27',
  '#252220',
  '#1a1815',
]

// Figtree: friendly, open shapes, holds up at 13–14px. Self-hosted via @fontsource-variable/figtree
// (imported in main.tsx) so a private mail server never calls Google Fonts.
const uiFont =
  '"Figtree Variable", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"'

export const theme = createTheme({
  primaryColor: DEFAULT_ACCENT,
  primaryShade: 6,
  colors: { ...ACCENTS, gray, dark },
  white: '#fffefb',
  black: '#1f1d1a',
  fontFamily: uiFont,
  fontFamilyMonospace: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  // 14px base: md drives body text and most component defaults.
  fontSizes: {
    xs: '0.75rem',
    sm: '0.8125rem',
    md: '0.875rem',
    lg: '1rem',
    xl: '1.25rem',
  },
  lineHeights: { md: '1.45' },
  headings: {
    fontFamily: uiFont,
    fontWeight: '600',
    sizes: {
      // Figtree reads light at 600: titles go one step up.
      h1: { fontSize: '1.375rem', lineHeight: '1.3', fontWeight: '700' },
      h2: { fontSize: '1rem', lineHeight: '1.35', fontWeight: '700' },
      h3: { fontSize: '0.875rem', lineHeight: '1.4' },
    },
  },
  // Softer corners: 8px controls, pills for chips and the compose button.
  defaultRadius: 'md',
  // Checkboxes, radios and switches get the hand like every other control
  cursorType: 'pointer',
  focusRing: 'auto',
  respectReducedMotion: true,
  components: {
    ActionIcon: { defaultProps: { variant: 'subtle', color: 'gray' } },
    Tooltip: { defaultProps: { openDelay: 400, withArrow: false, radius: 'sm' } },
    Menu: {
      defaultProps: {
        shadow: 'md',
        withinPortal: true,
        // Overlaps the bar it opens from instead of lining up with its bottom edge
        offset: 4,
        transitionProps: { transition: 'pop-top-right', duration: 120 },
      },
      classNames: { dropdown: 'mail-menu-dropdown' },
    },
    Notification: { defaultProps: { withBorder: true } },
  },
})

/** The theme with the user's accent as primary color. */
export function themeWithAccent(accent: AccentName): MantineThemeOverride {
  return { ...theme, primaryColor: ACCENTS[accent] ? accent : DEFAULT_ACCENT }
}

/**
 * - `dimmed`: Mantine's defaults (~3.3:1 light, ~4.0:1 dark) fail AA; these are ≥ 4.6:1 on every surface.
 * - light-variant text uses shade 7 in light mode so the active folder label passes AA on its tint for every accent.
 * - `--mail-star`: starred is amber, the one colour besides the accent.
 */
export const cssVariablesResolver: CSSVariablesResolver = (t) => ({
  variables: {},
  light: {
    '--mantine-color-dimmed': '#67625c',
    [`--mantine-color-${t.primaryColor}-light-color`]: `var(--mantine-color-${t.primaryColor}-7)`,
    '--mail-star': '#d97706',
    '--mail-control-border': '#b8b4af',
    '--mail-raised': '#ffffff',
    '--mail-raised-shadow': '0 1px 2px rgb(31 29 26 / 6%), 0 10px 28px -6px rgb(31 29 26 / 18%)',
  },
  dark: {
    '--mantine-color-dimmed': '#a8a39c',
    '--mail-star': '#f5b83d',
    '--mail-control-border': '#5d5a56',
    '--mail-raised': '#363431',
    '--mail-raised-shadow': '0 1px 2px rgb(0 0 0 / 30%), 0 12px 32px -6px rgb(0 0 0 / 55%)',
  },
})
