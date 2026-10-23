import { describe, expect, it } from 'vitest'

import { parseLocation, toUrl } from './url'

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
    })
  })

  it('ignores a uid that is not one', () => {
    expect(parseLocation('/folders/INBOX/abc', '').uid).toBeNull()
  })

  it('decodes folder names', () => {
    expect(parseLocation('/folders/R%C3%A9ception%20%26%20co', '').folderId).toBe('Réception & co')
  })
})
