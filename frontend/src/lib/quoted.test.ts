import { describe, expect, it } from 'vitest'

import { splitQuotedText } from './quoted'

describe('splitQuotedText', () => {
  it('splits the trailing quote and its attribution line', () => {
    const text = 'Works for me.\n\nOn Wed, Alice wrote:\n> 12:30 is fine\n>\n>> Lunch?\n'

    expect(splitQuotedText(text)).toEqual({
      body: 'Works for me.',
      quoted: 'On Wed, Alice wrote:\n> 12:30 is fine\n>\n>> Lunch?',
    })
  })

  it('leaves inline quotes alone', () => {
    const text = '> question one\nanswer one\n> question two\nanswer two'

    expect(splitQuotedText(text)).toEqual({ body: text, quoted: null })
  })

  it('never hides everything', () => {
    const text = '> only a quote\n> nothing else'

    expect(splitQuotedText(text)).toEqual({ body: text, quoted: null })
  })

  it('handles French clients', () => {
    expect(splitQuotedText('Ok\n\nLe 12 oct., Bob a écrit :\n> Salut').quoted).toBe(
      'Le 12 oct., Bob a écrit :\n> Salut',
    )
  })
})
