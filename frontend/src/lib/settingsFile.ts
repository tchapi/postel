import { ACCENTS } from '../theme'
import type { Density, Language, Settings } from '../types'

export const SETTINGS_FILE_VERSION = 1
export const SETTINGS_FILE_NAME = 'postel-settings.json'

/** What travels in the file. Field names are the API's, so files stay stable. */
type FileSettings = {
  fromName: string | null
  signature: string | null
  loadRemoteImages: boolean
  density: Density
  threads: boolean
  language: Language
  accent: string
}

export type SettingsFile = { version: typeof SETTINGS_FILE_VERSION; settings: FileSettings }

const DENSITIES: readonly Density[] = ['comfortable', 'compact']
const LANGUAGES: readonly Language[] = ['en', 'fr']

export function buildSettingsFile(settings: Settings): SettingsFile {
  return {
    version: SETTINGS_FILE_VERSION,
    settings: {
      fromName: settings.fromName || null,
      signature: settings.signatureHtml || null,
      loadRemoteImages: settings.remoteImages === 'always',
      density: settings.density,
      threads: settings.threads,
      language: settings.language,
      accent: settings.accent,
    },
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function stringOrNull(settings: Record<string, unknown>, field: string): string | null {
  if (!(field in settings)) throw new Error(`Missing field "${field}"`)
  const value = settings[field]
  if (value !== null && typeof value !== 'string')
    throw new Error(`"${field}" must be a string or null`)
  return value
}

/** A patch for the settings, or an error that says what is wrong with the file. */
export function parseSettingsFile(text: string): Partial<Settings> {
  let document: unknown
  try {
    document = JSON.parse(text)
  } catch {
    throw new Error('The file is not valid JSON')
  }
  if (!isObject(document)) throw new Error('The file is not a settings export')
  if (document.version !== SETTINGS_FILE_VERSION) {
    throw new Error(
      `Unsupported version ${JSON.stringify(document.version ?? null)}, expected ${SETTINGS_FILE_VERSION}`,
    )
  }
  const settings = document.settings
  if (!isObject(settings)) throw new Error('Missing "settings" object')

  const fromName = stringOrNull(settings, 'fromName')
  const signature = stringOrNull(settings, 'signature')

  if (!('loadRemoteImages' in settings)) throw new Error('Missing field "loadRemoteImages"')
  if (typeof settings.loadRemoteImages !== 'boolean') {
    throw new Error('"loadRemoteImages" must be true or false')
  }

  if (!('density' in settings)) throw new Error('Missing field "density"')
  const density = settings.density as Density
  if (!DENSITIES.includes(density)) {
    throw new Error(
      `Unknown density ${JSON.stringify(density)}, expected "comfortable" or "compact"`,
    )
  }

  const patch: Partial<Settings> = {
    fromName: fromName ?? '',
    signatureHtml: signature ?? '',
    remoteImages: settings.loadRemoteImages ? 'always' : 'block',
    density,
  }

  // Added after the first exports went out, so they may be missing
  if ('threads' in settings) {
    if (typeof settings.threads !== 'boolean') throw new Error('"threads" must be true or false')
    patch.threads = settings.threads
  }
  if ('language' in settings) {
    if (!LANGUAGES.includes(settings.language as Language)) {
      throw new Error(
        `Unknown language ${JSON.stringify(settings.language)}, expected "en" or "fr"`,
      )
    }
    patch.language = settings.language as Language
  }
  if ('accent' in settings) {
    if (typeof settings.accent !== 'string' || !(settings.accent in ACCENTS)) {
      throw new Error(`Unknown accent ${JSON.stringify(settings.accent)}`)
    }
    patch.accent = settings.accent as Settings['accent']
  }

  return patch
}
