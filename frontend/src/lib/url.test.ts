import { describe, expect, it } from 'vitest'

import { parseLocation, placeOf, toUrl } from './url'

const roundTrip = (url: string) => {
  const [path, query = ''] = url.split('?')
  return toUrl(parseLocation(path!, query))
}

describe('app urls', () => {
  it.each([
    '/folders/INBOX',
    '/folders/INBOX/1234',
    '/folders/Projects.Webmail',
    '/folders/R%C3%A9ception%20%26%20co',
    '/settings',
    '/contacts',
    '/contacts/3f2a9c0d1e8b4a7f9c6d5e4b3a2f1e0d',
    '/search?q=invoice',
    '/search?q=invoice&in=Receipts&unread=1&attachments=1&range=30d',
    '/search?q=x&range=custom&from=2026-10-01&to=2026-10-20',
  ])('reads back %s', (url) => {
    expect(roundTrip(url)).toBe(url)
  })

  it('lands on the inbox for anything else', () => {
    expect(parseLocation('/whatever', '')).toEqual({
      view: 'mail',
      folderId: 'INBOX',
      uid: null,
      search: null,
      contactId: null,
    })
  })

  it('ignores a uid that is not one', () => {
    expect(parseLocation('/folders/INBOX/abc', '').uid).toBeNull()
  })

  it('opens a contact', () => {
    expect(parseLocation('/contacts/abc123', '')).toMatchObject({
      view: 'contacts',
      contactId: 'abc123',
    })
  })

  it('ignores a contact id that is not one', () => {
    expect(parseLocation('/contacts/..%2F..%2Fetc', '').contactId).toBeNull()
  })

  it('opening a message or a contact stays in the same place', () => {
    expect(placeOf('/folders/INBOX/12')).toBe(placeOf('/folders/INBOX'))
    expect(placeOf('/contacts/abc')).toBe(placeOf('/contacts'))
    expect(placeOf('/contacts')).not.toBe(placeOf('/settings'))
  })

  it('decodes folder names', () => {
    expect(parseLocation('/folders/R%C3%A9ception%20%26%20co', '').folderId).toBe('Réception & co')
  })
})
