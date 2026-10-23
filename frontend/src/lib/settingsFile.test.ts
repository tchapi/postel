import { describe, expect, it } from 'vitest'

import type { Settings } from '../api/settings'
import { buildSettingsFile, parseSettingsFile } from './settingsFile'

const settings: Settings = {
  fromName: 'Alice',
  signature: '<p>Cheers</p>',
  loadRemoteImages: true,
  density: 'compact',
  threads: false,
  updatedAt: '2026-10-23T10:00:00+00:00',
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
  it('keeps the settings and drops updatedAt', () => {
    expect(buildSettingsFile(settings)).toEqual({
      version: 1,
      settings: {
        fromName: 'Alice',
        signature: '<p>Cheers</p>',
        loadRemoteImages: true,
        density: 'compact',
        threads: false,
      },
    })
  })

  it('reads back what it writes', () => {
    const { updatedAt: _, ...expected } = settings
    expect(parseSettingsFile(JSON.stringify(buildSettingsFile(settings)))).toEqual(expected)
  })
})

describe('parseSettingsFile', () => {
  it('accepts a null name and signature', () => {
    expect(parseSettingsFile(file({}))).toEqual({
      fromName: null,
      signature: null,
      loadRemoteImages: false,
      density: 'comfortable',
      threads: true,
    })
  })

  it('drops unknown fields', () => {
    expect(parseSettingsFile(file({ updatedAt: 'x', theme: 'dark' }))).toEqual({
      fromName: null,
      signature: null,
      loadRemoteImages: false,
      density: 'comfortable',
      threads: true,
    })
  })

  it('rejects invalid JSON', () => {
    expect(() => parseSettingsFile('{nope')).toThrow('The file is not valid JSON')
  })

  it('rejects a document that is not an object', () => {
    expect(() => parseSettingsFile('[1, 2]')).toThrow('The file is not a settings export')
  })

  it('rejects a wrong or missing version', () => {
    expect(() => parseSettingsFile(JSON.stringify({ version: 2, settings: {} }))).toThrow(
      'Unsupported version 2, expected 1',
    )
    expect(() => parseSettingsFile(JSON.stringify({ settings: {} }))).toThrow(
      'Unsupported version null, expected 1',
    )
  })

  it('rejects a missing settings object', () => {
    expect(() => parseSettingsFile(JSON.stringify({ version: 1 }))).toThrow(
      'Missing "settings" object',
    )
  })

  it.each(['fromName', 'signature', 'loadRemoteImages', 'density'])(
    'rejects a missing %s',
    (field) => {
      const document = JSON.parse(file({}))
      delete document.settings[field]
      expect(() => parseSettingsFile(JSON.stringify(document))).toThrow(`Missing field "${field}"`)
    },
  )

  it('rejects wrongly typed fields', () => {
    expect(() => parseSettingsFile(file({ fromName: 42 }))).toThrow(
      '"fromName" must be a string or null',
    )
    expect(() => parseSettingsFile(file({ signature: ['a'] }))).toThrow(
      '"signature" must be a string or null',
    )
    expect(() => parseSettingsFile(file({ loadRemoteImages: 'yes' }))).toThrow(
      '"loadRemoteImages" must be true or false',
    )
  })

  it('rejects an unknown density', () => {
    expect(() => parseSettingsFile(file({ density: 'cosy' }))).toThrow(
      'Unknown density "cosy", expected "comfortable" or "compact"',
    )
  })
})

describe('parseSettingsFile and conversations', () => {
  it('defaults to conversations for files written before the setting existed', () => {
    expect(parseSettingsFile(file({})).threads).toBe(true)
  })

  it('rejects a non boolean', () => {
    expect(() => parseSettingsFile(file({ threads: 'yes' }))).toThrow(
      '"threads" must be true or false',
    )
  })
})
