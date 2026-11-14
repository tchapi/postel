import { describe, expect, it } from 'vitest'

import type { ContactSummary } from '../types'
import {
  formatBirthday,
  letterOf,
  matchesFilter,
  refusedFields,
  secondLine,
  sortCards,
  withLetters,
} from './addressBook'

const card = (patch: Partial<ContactSummary>): ContactSummary => ({
  id: patch.name ?? 'x',
  book: 'b',
  etag: '"1"',
  name: '',
  org: '',
  emails: [],
  phones: [],
  photo: false,
  ...patch,
})

const emile = card({
  name: 'Émile Durand',
  org: 'Société Générale',
  emails: ['emile@example.test'],
  phones: ['+33 6 12 34 56 78'],
})

describe('contact filter', () => {
  it('matches everything when empty', () => {
    expect(matchesFilter(emile, '  ')).toBe(true)
  })

  it('ignores accents and case, both ways', () => {
    expect(matchesFilter(emile, 'emile')).toBe(true)
    expect(matchesFilter(emile, 'ÉMILE')).toBe(true)
    expect(matchesFilter(card({ name: 'Emile' }), 'émile')).toBe(true)
  })

  it('needs every word, anywhere', () => {
    expect(matchesFilter(emile, 'durand generale')).toBe(true)
    expect(matchesFilter(emile, 'durand martin')).toBe(false)
  })

  it('looks in emails', () => {
    expect(matchesFilter(emile, 'example.test')).toBe(true)
  })

  it('finds phones whatever the spacing', () => {
    // Typed the way it is dialled at home, stored with the country
    expect(matchesFilter(emile, '0612')).toBe(true)
    expect(matchesFilter(emile, '0712')).toBe(false)
    expect(matchesFilter(emile, '612 34')).toBe(true)
    expect(matchesFilter(emile, '+33612345678')).toBe(true)
  })

  it('does not match a phone on a word without digits', () => {
    expect(matchesFilter(card({ phones: ['555'] }), 'abc')).toBe(false)
  })
})

describe('contact order', () => {
  it('sorts by name, accents and case ignored, other characters last', () => {
    const names = sortCards(
      ['zoé', 'Émile', '42 Club', 'adam', 'Ölaf', 'Беляев', 'Eve'].map((name) => card({ name })),
    ).map((c) => c.name)
    expect(names).toEqual(['adam', 'Émile', 'Eve', 'Ölaf', 'zoé', '42 Club', 'Беляев'])
  })

  it('files names under their first letter', () => {
    expect(letterOf('Émile')).toBe('E')
    expect(letterOf(' zoé')).toBe('Z')
    expect(letterOf('42 Club')).toBe('#')
    expect(letterOf('')).toBe('#')
  })

  it('puts one heading before each letter', () => {
    const rows = withLetters(
      sortCards(['Bob', 'alice', 'Anna', '1st'].map((name) => card({ name }))),
    )
    expect(rows.map((r) => (r.kind === 'letter' ? r.letter : r.card.name))).toEqual([
      'A',
      'alice',
      'Anna',
      'B',
      'Bob',
      '#',
      '1st',
    ])
  })
})

describe('second line', () => {
  it('prefers the company, then an email, then a phone', () => {
    expect(secondLine(emile)).toBe('Société Générale')
    expect(secondLine(card({ name: 'A', emails: ['a@x.test'], phones: ['1'] }))).toBe('a@x.test')
    expect(secondLine(card({ name: 'A', phones: ['1'] }))).toBe('1')
    expect(secondLine(card({ name: 'A' }))).toBe('')
  })

  it('does not repeat what the name already says', () => {
    expect(secondLine(card({ name: 'Acme', org: 'Acme', emails: ['hi@acme.test'] }))).toBe(
      'hi@acme.test',
    )
  })
})

describe('birthday', () => {
  it('shows a full date', () => {
    expect(formatBirthday('1984-03-12', 'en-GB')).toBe('12 March 1984')
  })

  it('leaves the year out when the card does not know it', () => {
    expect(formatBirthday('--03-12', 'en-GB')).toBe('12 March')
    expect(formatBirthday('--0312', 'fr-FR')).toBe('12 mars')
  })
})

describe('the fields a save was refused for', () => {
  it('names each field once, with the part of an address', () => {
    expect(
      refusedFields(['emails[1].value', 'emails[2].value', 'addresses[0].region', 'birthday']),
    ).toEqual(['emails', 'addresses.region', 'birthday'])
  })

  it('names the address alone when no part is given', () => {
    expect(refusedFields(['addresses', ''])).toEqual(['addresses'])
  })
})
