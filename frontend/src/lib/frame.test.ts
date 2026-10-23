// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'

import { htmlHasOwnColors } from '../components/MessageFrame'

describe('htmlHasOwnColors', () => {
  it.each([
    ['<p>Hello <b>there</b></p><blockquote>quoted</blockquote>', false],
    ['<p style="margin: 0; font-weight: bold">styled but colourless</p>', false],
    ['<table bgcolor="#f4f4f4"><tr><td>newsletter</td></tr></table>', true],
    ['<p style="color: #333">grey text</p>', true],
    ['<div style="padding:8px;background-color:#fff">card</div>', true],
    ['<font color="red">old school</font>', true],
  ])('%s', (html, expected) => {
    expect(htmlHasOwnColors(html)).toBe(expected)
  })
})
