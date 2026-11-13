import { describe, expect, it } from 'vitest'

import { batchCards, splitCards } from './vcf'

const card = (name: string) => `BEGIN:VCARD\r\nVERSION:3.0\r\nFN:${name}\r\nEND:VCARD\r\n`

describe('cutting a .vcf file', () => {
  it('gives each card, whatever the line endings', () => {
    const file = `﻿${card('A')}begin:vcard\nFN:B\nNOTE:a long\n  folded line\nend:vcard\n\n`

    expect(splitCards(file)).toEqual([
      card('A'),
      'begin:vcard\r\nFN:B\r\nNOTE:a long\r\n  folded line\r\nend:vcard\r\n',
    ])
  })

  it('drops what is outside a card, and a card that never ends', () => {
    expect(splitCards(`hello\r\n${card('A')}junk\r\nBEGIN:VCARD\r\nFN:B\r\n`)).toEqual([card('A')])
    expect(splitCards('')).toEqual([])
  })

  it('groups cards by count', () => {
    const cards = Array.from({ length: 7 }, (_, i) => card(String(i)))

    expect(batchCards(cards, 3).map((b) => b.length)).toEqual([3, 3, 1])
  })

  it('starts a new group before one gets too large, and never leaves a card out', () => {
    const big = card('x'.repeat(100))
    const cards = [card('A'), big, big, card('B')]

    const batches = batchCards(cards, 25, 150)

    expect(batches.map((b) => b.length)).toEqual([1, 1, 1, 1])
    expect(batches.flat()).toEqual(cards)
  })
})
