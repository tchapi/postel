import { describe, expect, it } from 'vitest'

import type { ContactInput } from '../types'
import { fromInput } from './contactsHooks'

const input = (patch: Partial<ContactInput> = {}): ContactInput => ({
  firstName: 'Émile',
  lastName: 'Durand',
  org: '',
  title: '',
  emails: [],
  phones: [],
  addresses: [],
  urls: [],
  birthday: '',
  note: '',
  ...patch,
})

describe('what a save sends', () => {
  it('sends the empty parts of an address as empty text', () => {
    // The server refuses null there, and the whole save with it
    const sent = fromInput(
      input({
        addresses: [
          {
            key: 0,
            type: 'home',
            street: ' 12 rue des Lilas ',
            city: 'Lyon',
            region: '',
            postalCode: '69001',
            country: '',
          },
        ],
      }),
    )

    expect(sent.addresses).toEqual([
      {
        key: 0,
        type: 'home',
        street: '12 rue des Lilas',
        city: 'Lyon',
        region: '',
        postalCode: '69001',
        country: '',
      },
    ])
  })

  it('leaves out the lines with nothing typed in', () => {
    const empty = {
      type: 'home' as const,
      street: '',
      city: ' ',
      region: '',
      postalCode: '',
      country: '',
    }
    const sent = fromInput(
      input({
        emails: [{ value: ' ', type: 'home' }],
        phones: [{ value: '', type: 'cell' }],
        addresses: [empty],
        urls: [{ value: '' }],
      }),
    )

    expect([sent.emails, sent.phones, sent.addresses, sent.urls]).toEqual([[], [], [], []])
  })
})
