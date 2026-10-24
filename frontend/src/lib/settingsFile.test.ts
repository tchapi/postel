import { describe, expect, it } from 'vitest'

import type { Settings } from '../types'
import { buildSettingsFile, parseSettingsFile } from './settingsFile'

const settings: Settings = {
  fromName: 'Alice',
  signatureHtml: '<p>Cheers</p>',
  remoteImages: 'always',
  density: 'compact',
  threads: false,
  language: 'fr',
  accent: 'teal',
  allowedSenders: ['news@shop.example'],
}

const file = (overrides: Record<string, unknown>) =>
  JSON.stringify({
    version: 1,
    settings: {
      fromName: null,
      signature: null,
      loadRemoteImages: false,
      density: 'comfortable',
      ...overrides,
    },
  })

describe('buildSettingsFile', () => {
  it('writes the API field names and leaves the sender list out', () => {
    expect(buildSettingsFile(settings)).toEqual({
      version: 1,
      settings: {
        fromName: 'Alice',
        signature: '<p>Cheers</p>',
        loadRemoteImages: true,
        density: 'compact',
        threads: false,
        language: 'fr',
        accent: 'teal',
      },
    })
  })

  it('reads back what it writes', () => {
    const { allowedSenders: _, ...expected } = settings
    expect(parseSettingsFile(JSON.stringify(buildSettingsFile(settings)))).toEqual(expected)
  })
})

describe('parseSettingsFile', () => {
  it('reads files written before threads, language and accent existed', () => {
    expect(parseSettingsFile(file({}))).toEqual({
      fromName: '',
      signatureHtml: '',
      remoteImages: 'block',
      density: 'comfortable',
    })
  })

  it('maps the accents of older files to the new ones', () => {
    expect(parseSettingsFile(file({ accent: 'violet' }))).toMatchObject({ accent: 'iris' })
    expect(parseSettingsFile(file({ accent: 'jade' }))).toMatchObject({ accent: 'teal' })
    expect(() => parseSettingsFile(file({ accent: 'neon' }))).toThrow('Unknown accent')
  })

  it('drops unknown fields', () => {
    expect(parseSettingsFile(file({ updatedAt: 'x', theme: 'dark' }))).not.toHaveProperty('theme')
  })

  it.each([
    ['not json', 'The file is not valid JSON'],
    ['[]', 'The file is not a settings export'],
    [JSON.stringify({ version: 2, settings: {} }), 'Unsupported version 2, expected 1'],
    [JSON.stringify({ version: 1 }), 'Missing "settings" object'],
    [file({ fromName: 3 }), '"fromName" must be a string or null'],
    [file({ loadRemoteImages: 'yes' }), '"loadRemoteImages" must be true or false'],
    [file({ density: 'cosy' }), 'Unknown density "cosy", expected "comfortable" or "compact"'],
    [file({ threads: 'yes' }), '"threads" must be true or false'],
    [file({ language: 'de' }), 'Unknown language "de", expected "en" or "fr"'],
    [file({ accent: 'chartreuse' }), 'Unknown accent "chartreuse"'],
  ])('rejects %s', (text, message) => {
    expect(() => parseSettingsFile(text)).toThrow(message)
  })

  it('rejects a missing field', () => {
    const text = JSON.stringify({
      version: 1,
      settings: { signature: null, loadRemoteImages: false, density: 'compact' },
    })
    expect(() => parseSettingsFile(text)).toThrow('Missing field "fromName"')
  })
})
