import type { Density, Settings } from '../api/settings'

export const SETTINGS_FILE_VERSION = 1
export const SETTINGS_FILE_NAME = 'webmail-settings.json'

type FileSettings = Omit<Settings, 'updatedAt'>

export type SettingsFile = {
  version: typeof SETTINGS_FILE_VERSION
  settings: FileSettings
}

const DENSITIES: readonly Density[] = ['comfortable', 'compact']

export function buildSettingsFile(settings: Settings): SettingsFile {
  const { fromName, signature, loadRemoteImages, density, threads } = settings
  return {
    version: SETTINGS_FILE_VERSION,
    settings: { fromName, signature, loadRemoteImages, density, threads },
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function stringOrNull(settings: Record<string, unknown>, field: string): string | null {
  if (!(field in settings)) throw new Error(`Missing field "${field}"`)
  const value = settings[field]
  if (value !== null && typeof value !== 'string') {
    throw new Error(`"${field}" must be a string or null`)
  }
  return value
}

export function parseSettingsFile(text: string): FileSettings {
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
  const loadRemoteImages = settings.loadRemoteImages
  if (typeof loadRemoteImages !== 'boolean') {
    throw new Error('"loadRemoteImages" must be true or false')
  }

  if (!('density' in settings)) throw new Error('Missing field "density"')
  const density = settings.density as Density
  if (!DENSITIES.includes(density)) {
    throw new Error(
      `Unknown density ${JSON.stringify(density)}, expected "comfortable" or "compact"`,
    )
  }

  // Added after the first exports went out, so it may be missing
  const threads = settings.threads ?? true
  if (typeof threads !== 'boolean') throw new Error('"threads" must be true or false')

  return { fromName, signature, loadRemoteImages, density, threads }
}
