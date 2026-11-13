import { describe, expect, it } from 'vitest'

import type { ContactInput, ContactValue } from '../types'
import { rebaseInput } from './rebase'

const input = (patch: Partial<ContactInput> = {}): ContactInput => ({
  firstName: 'Bob',
  lastName: 'Martin',
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

const email = (value: string, key?: number, type: ContactValue['type'] = 'home'): ContactValue =>
  key === undefined ? { value, type } : { key, value, type }

/** Keys and values only: what the next save will tell the server. */
const lines = (list: ContactValue[]) => list.map((e) => [e.key, e.value, e.type])

describe('moving the form onto a card that changed', () => {
  it('keeps the fields the user changed and takes the others from the new card', () => {
    const base = input({ org: 'Old', title: 'Engineer', note: 'hello' })
    const mine = input({ org: 'Old', title: 'Lead', note: 'hello' })
    const theirs = input({ org: 'New', title: 'Manager', note: 'hello there' })

    expect(rebaseInput(base, mine, theirs)).toMatchObject({
      org: 'New',
      title: 'Lead',
      note: 'hello there',
    })
  })

  it('gives untouched lines the keys they have on the new card', () => {
    // They removed the first address: the second one moved up
    const base = input({ emails: [email('a@x.test', 0), email('b@x.test', 1)] })
    const theirs = input({ emails: [email('b@x.test', 0)] })

    const out = rebaseInput(base, base, theirs)

    expect(lines(out.emails)).toEqual([[0, 'b@x.test', 'home']])
  })

  it('puts a changed line on the right line of the new card', () => {
    const base = input({ emails: [email('a@x.test', 0), email('b@x.test', 1)] })
    const mine = input({ emails: [email('a@x.test', 0), email('bob@x.test', 1, 'work')] })
    // They added one in front: everything moved down
    const theirs = input({
      emails: [email('new@x.test', 0), email('a@x.test', 1), email('b@x.test', 2)],
    })

    const out = rebaseInput(base, mine, theirs)

    expect(lines(out.emails)).toEqual([
      [1, 'a@x.test', 'home'],
      [2, 'bob@x.test', 'work'],
      [0, 'new@x.test', 'home'],
    ])
  })

  it('keeps a changed line as a new one when the new card no longer has it', () => {
    const base = input({ emails: [email('a@x.test', 0)] })
    const mine = input({ emails: [email('alice@x.test', 0)] })
    const theirs = input({ emails: [] })

    const out = rebaseInput(base, mine, theirs)

    expect(lines(out.emails)).toEqual([[undefined, 'alice@x.test', 'home']])
  })

  it('keeps both versions when both sides changed the same line', () => {
    const base = input({ emails: [email('a@x.test', 0)] })
    const mine = input({ emails: [email('mine@x.test', 0)] })
    const theirs = input({ emails: [email('theirs@x.test', 0)] })

    const out = rebaseInput(base, mine, theirs)

    expect(lines(out.emails)).toEqual([
      [undefined, 'mine@x.test', 'home'],
      [0, 'theirs@x.test', 'home'],
    ])
  })

  it('does not bring back a line the user removed', () => {
    const base = input({ emails: [email('a@x.test', 0), email('b@x.test', 1)] })
    const mine = input({ emails: [email('b@x.test', 1)] })
    const theirs = input({ emails: [email('a@x.test', 0), email('b@x.test', 1, 'work')] })

    const out = rebaseInput(base, mine, theirs)

    expect(lines(out.emails)).toEqual([[1, 'b@x.test', 'work']])
  })

  it('drops an untouched line that is gone from the new card', () => {
    const base = input({ emails: [email('a@x.test', 0), email('b@x.test', 1)] })
    const theirs = input({ emails: [email('a@x.test', 0)] })

    expect(lines(rebaseInput(base, base, theirs).emails)).toEqual([[0, 'a@x.test', 'home']])
  })

  it('joins a line the user added with the same line on the new card', () => {
    // Our own save went through, then the picture failed: the new card has our line already
    const base = input({ emails: [email('a@x.test', 0)] })
    const mine = input({ emails: [email('a@x.test', 0), email('New@x.test', undefined, 'work')] })
    const theirs = input({ emails: [email('a@x.test', 0), email('new@x.test', 1, 'work')] })

    const out = rebaseInput(base, mine, theirs)

    expect(lines(out.emails)).toEqual([
      [0, 'a@x.test', 'home'],
      [1, 'New@x.test', 'work'],
    ])
  })

  it('keeps empty lines waiting to be typed in, without a key', () => {
    const base = input({ emails: [email('a@x.test', 0)] })
    const mine = input({ emails: [email('a@x.test', 0), email('')] })
    const theirs = input({ emails: [email('a@x.test', 0), email('c@x.test', 1)] })

    const out = rebaseInput(base, mine, theirs)

    expect(lines(out.emails)).toEqual([
      [0, 'a@x.test', 'home'],
      [undefined, '', 'home'],
      [1, 'c@x.test', 'home'],
    ])
  })

  it('pairs two lines with the same value one to one', () => {
    const base = input({ emails: [email('a@x.test', 0), email('a@x.test', 1, 'work')] })
    const mine = input({ emails: [email('a@x.test', 1, 'work')] })
    const theirs = input({ emails: [email('a@x.test', 0), email('a@x.test', 1, 'work')] })

    expect(lines(rebaseInput(base, mine, theirs).emails)).toEqual([[1, 'a@x.test', 'work']])
  })

  it('knows a phone whatever its spaces', () => {
    const base = input({ phones: [email('06 12 34 56 78', 0, 'cell')] })
    const mine = input({ phones: [email('06 12 34 56 78', 0, 'work')] })
    const theirs = input({
      phones: [email('+33 1 00 00 00 00', 0, 'home'), email('0612345678', 1, 'cell')],
    })

    const out = rebaseInput(base, mine, theirs)

    expect(lines(out.phones)).toEqual([
      [1, '06 12 34 56 78', 'work'],
      [0, '+33 1 00 00 00 00', 'home'],
    ])
  })

  it('moves postal addresses and links the same way', () => {
    const paris = {
      type: 'home' as const,
      street: '1 rue A',
      city: 'Paris',
      region: '',
      postalCode: '75001',
      country: '',
    }
    const lyon = {
      type: 'work' as const,
      street: '2 rue B',
      city: 'Lyon',
      region: '',
      postalCode: '69001',
      country: '',
    }
    const base = input({
      addresses: [{ key: 0, ...paris }],
      urls: [{ key: 0, value: 'https://a.test' }],
    })
    const mine = input({
      addresses: [{ key: 0, ...paris, city: 'Paris 1er' }],
      urls: [{ key: 0, value: 'https://a.test' }, { value: 'https://mine.test' }],
    })
    const theirs = input({
      addresses: [
        { key: 0, ...lyon },
        { key: 1, ...paris },
      ],
      urls: [],
    })

    const out = rebaseInput(base, mine, theirs)

    expect(out.addresses).toEqual([
      { key: 1, ...paris, city: 'Paris 1er' },
      { key: 0, ...lyon },
    ])
    expect(out.urls).toEqual([{ key: undefined, value: 'https://mine.test' }])
  })

  it('changes nothing when the card did not change', () => {
    const base = input({ emails: [email('a@x.test', 0)], phones: [email('0612345678', 0, 'cell')] })
    const mine = input({
      firstName: 'Robert',
      emails: [email('a@x.test', 0, 'work'), email('b@x.test')],
      phones: [],
    })

    const out = rebaseInput(base, mine, base)

    expect(out.firstName).toBe('Robert')
    expect(lines(out.emails)).toEqual([
      [0, 'a@x.test', 'work'],
      [undefined, 'b@x.test', 'home'],
    ])
    expect(out.phones).toEqual([])
  })
})
