import {
  createTheme,
  type CSSVariablesResolver,
  type MantineColorsTuple,
  type MantineThemeOverride,
} from '@mantine/core'

/**
 * Accent palettes. Each is generated on an OKLCH lightness ramp so that shade 6 carries
 * white text at ≥ 4.6:1 and shade 1 reads on the dark surfaces at ≥ 13:1.
 * Violet is first: it is the default and the picker follows this order.
 */
export const ACCENTS = {
  violet: [
    '#f8f5fe',
    '#eee7ff',
    '#decefe',
    '#c9adfe',
    '#b688fe',
    '#a664fe',
    '#934fe8',
    '#803fce',
    '#6c33b0',
    '#592893',
  ],
  persimmon: [
    '#fef5f2',
    '#fee5dc',
    '#ffcab7',
    '#fea484',
    '#fe7745',
    '#ea5b1e',
    '#ce4702',
    '#b23c01',
    '#963201',
    '#7c2801',
  ],
  berry: [
    '#fef4f5',
    '#ffe3e7',
    '#ffc6cf',
    '#ff9daf',
    '#f67491',
    '#de5778',
    '#b9345a',
    '#a1244b',
    '#871a3d',
    '#6e102f',
  ],
  plum: [
    '#fef3fd',
    '#ffe0fb',
    '#f9c3f3',
    '#ec9fe5',
    '#d97fd1',
    '#c063ba',
    '#9e4398',
    '#893484',
    '#72296e',
    '#5c1d59',
  ],
  ocean: [
    '#eff8ff',
    '#d9efff',
    '#b1deff',
    '#76c7ff',
    '#48aeef',
    '#1a95d8',
    '#0275ac',
    '#056392',
    '#00517a',
    '#004061',
  ],
  jade: [
    '#ebfbf5',
    '#d3f4e8',
    '#a9e7d2',
    '#74d3b6',
    '#41bc9c',
    '#07a484',
    '#038066',
    '#056c56',
    '#015947',
    '#024738',
  ],
} satisfies Record<string, MantineColorsTuple>

export type AccentName = keyof typeof ACCENTS
export const ACCENT_NAMES = Object.keys(ACCENTS) as AccentName[]
export const DEFAULT_ACCENT: AccentName = 'violet'

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
    '--mail-control-border': '#a9a5a0',
    '--mail-raised': '#ffffff',
    '--mail-raised-shadow': '0 1px 2px rgb(31 29 26 / 6%), 0 10px 28px -6px rgb(31 29 26 / 18%)',
  },
  dark: {
    '--mantine-color-dimmed': '#a8a39c',
    '--mail-star': '#f5b83d',
    '--mail-control-border': '#6a6763',
    '--mail-raised': '#363431',
    '--mail-raised-shadow': '0 1px 2px rgb(0 0 0 / 30%), 0 12px 32px -6px rgb(0 0 0 / 55%)',
  },
})
