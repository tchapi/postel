import { describe, expect, it } from 'vitest'

import { findDuplicates, type DuplicateCandidate } from './duplicates'

const card = (id: string, fields: Partial<DuplicateCandidate> = {}): DuplicateCandidate => ({
  id,
  book: 'contacts',
  name: null,
  emails: [],
  phones: [],
  ...fields,
})

describe('possible duplicates', () => {
  it('finds two cards with the same address, whatever the case', () => {
    const found = findDuplicates([
      card('a', { name: 'Bob Martin', emails: ['bob@example.test'] }),
      card('b', { name: 'Robert M.', emails: [' Bob@Example.test '] }),
      card('c', { name: 'Carol Petit', emails: ['carol@example.test'] }),
    ])

    expect(found).toEqual(
      new Map([
        ['a', ['b']],
        ['b', ['a']],
      ]),
    )
  })

  it('finds the same name written with other accents, case or spacing', () => {
    const found = findDuplicates([
      card('a', { name: 'Émile  Durand' }),
      card('b', { name: 'emile durand' }),
    ])

    expect(found.get('a')).toEqual(['b'])
  })

  it('finds the same phone written with or without the country code', () => {
    const found = findDuplicates([
      card('a', { name: 'Alice', phones: ['+33 6 12 34 56 78'] }),
      card('b', { name: 'A. Martin', phones: ['06 12 34 56 78'] }),
      card('c', { name: 'Someone else', phones: ['06 12 34 56 79'] }),
    ])

    expect(found.get('a')).toEqual(['b'])
    expect(found.has('c')).toBe(false)
  })

  it('leaves very short numbers and nameless cards alone', () => {
    const found = findDuplicates([
      card('a', { phones: ['1234'] }),
      card('b', { phones: ['12 34'] }),
      card('c', { name: '  ' }),
      card('d', { name: '' }),
    ])

    expect(found.size).toBe(0)
  })

  it('does not compare across address books', () => {
    const found = findDuplicates([
      card('a', { name: 'Bob Martin', emails: ['bob@example.test'] }),
      card('b', { book: 'work', name: 'Bob Martin', emails: ['bob@example.test'] }),
    ])

    expect(found.size).toBe(0)
  })

  it('does not match a card with itself', () => {
    const found = findDuplicates([
      card('a', {
        emails: ['bob@example.test', 'BOB@example.test'],
        phones: ['0612345678', '06 12 34 56 78'],
      }),
    ])

    expect(found.size).toBe(0)
  })

  it('lists the others in the order of the list, each once', () => {
    const found = findDuplicates([
      card('a', { name: 'Bob Martin', emails: ['bob@example.test'] }),
      card('b', { name: 'Bob Martin', emails: ['bob@example.test'] }),
      card('c', { name: 'Bobby', emails: ['bob@example.test'] }),
    ])

    expect(found.get('c')).toEqual(['a', 'b'])
    expect(found.get('a')).toEqual(['b', 'c'])
  })
})
