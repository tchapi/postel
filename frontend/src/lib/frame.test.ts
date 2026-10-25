// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'

import { htmlHasOwnColors } from '../components/MessageFrame'

describe('htmlHasOwnColors', () => {
  it.each([
    ['<p>Hello <b>there</b></p><blockquote>quoted</blockquote>', false],
    ['<p style="margin: 0; font-weight: bold">styled but colourless</p>', false],
    ['<table bgcolor="#f4f4f4"><tr><td>newsletter</td></tr></table>', true],
    ['<p style="color: #333">grey text</p>', false],
    ['<div style="padding:8px;background-color:#fff">card</div>', false],
    ['<font color="red">old school</font>', true],
    ['<div style="color: rgb(0, 0, 0);">Apple Mail default</div>', false],
    ['<div style="font-family: Calibri; color: #000000 !important">Outlook default</div>', false],
    ['<body bgcolor="#FFFFFF"><p style="background-color: transparent">plain</p></body>', false],
    ['<font color="#333">dark grey</font>', false],
    ['<p style="color: #888">light grey</p>', true],
    ['<p style="color: navy">named colour</p>', true],
    ['<div style="background: #fff url(x.png)">picture</div>', true],
  ])('%s', (html, expected) => {
    expect(htmlHasOwnColors(html)).toBe(expected)
  })
})
