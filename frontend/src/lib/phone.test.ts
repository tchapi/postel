import { describe, expect, it } from 'vitest'

import { flagOf, homeCallingCode, readPhone } from './phone'

describe('reading phone numbers', () => {
  it.each([
    ['+33612345678', '+33 6 12 34 56 78', 'FR'],
    ['+33 6 12 34 56 78', '+33 6 12 34 56 78', 'FR'],
    ['0033 6.12.34.56.78', '+33 6 12 34 56 78', 'FR'],
    ['+33 (0)6 12 34 56 78', '+33 6 12 34 56 78', 'FR'],
    ['+1 (415) 555-0142', '+1 415 555 0142', 'US'],
    ['+1 514 555 0142', '+1 514 555 0142', 'CA'],
    ['+1 876 555 0142', '+1 876 555 0142', 'JM'],
    ['+44 7700 900142', '+44 7700 900142', 'GB'],
    ['+41 79 555 01 42', '+41 79 555 01 42', 'CH'],
    ['+351 912 555 018', '+351 912 555 018', 'PT'],
    ['+49 151 555 0142', '+49 151 555 01 42', 'DE'],
    ['+7 701 555 01 42', '+7 701 555 01 42', 'KZ'],
    ['+262 692 12 34 56', '+262 692 123 456', 'RE'],
  ])('%s', (typed, text, country) => {
    expect(readPhone(typed)).toMatchObject({ text, country })
  })

  it('gives the number to dial', () => {
    expect(readPhone('+33 (0)6 12 34 56 78').dial).toBe('+33612345678')
    expect(readPhone('06 12 34 56 78', '33').dial).toBe('+33612345678')
    expect(readPhone('06 12 34 56 78').dial).toBe('0612345678')
  })

  it('takes a number without a country to be from home', () => {
    expect(readPhone('06 12 34 56 78', '33')).toMatchObject({
      text: '+33 6 12 34 56 78',
      country: 'FR',
    })
    expect(readPhone('020 7946 0142', '44')).toMatchObject({
      text: '+44 207 946 01 42',
      country: 'GB',
    })
    // No leading 0 to drop in the United States or in Italy
    expect(readPhone('0612345678', '1').country).toBeUndefined()
    expect(readPhone('06 1234 5678', '39').country).toBeUndefined()
  })

  it('leaves alone what it cannot read', () => {
    expect(readPhone('  06 12  34 56 78 ')).toEqual({ text: '06 12 34 56 78', dial: '0612345678' })
    expect(readPhone('3615')).toEqual({ text: '3615', dial: '3615' })
    expect(readPhone('+33 6 12 34 56 78 ext. 12').country).toBeUndefined()
    expect(readPhone('+999 123 456 789').country).toBeUndefined()
    expect(readPhone('').text).toBe('')
  })

  it('draws the flag of a country', () => {
    expect(flagOf('FR')).toBe('🇫🇷')
    expect(flagOf('gb')).toBe('🇬🇧')
  })
})

describe('the home country of an address book', () => {
  it('is the one most of its numbers are from', () => {
    const phones = [
      '+33 6 00 00 00 01',
      '+33600000002',
      '0033 6 00 00 00 03',
      '+44 7700 900142',
      '06 00 00 00 04',
    ]
    expect(homeCallingCode(phones)).toBe('33')
  })

  it('falls back on the language of the browser when the book does not say', () => {
    expect(homeCallingCode(['+33 6 00 00 00 01', '+44 7700 900142'], ['en', 'fr-FR'])).toBe('33')
    expect(homeCallingCode([], ['en-CA'])).toBe('1')
    expect(homeCallingCode(['06 00 00 00 04'], ['en'])).toBeUndefined()
  })
})
