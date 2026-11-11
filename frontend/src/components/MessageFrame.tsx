import { useComputedColorScheme } from '@mantine/core'
import { useEffect, useMemo, useRef, useState } from 'react'
import classes from './Reader.module.css'

const QUOTE_SELECTOR = [
  'blockquote[type="cite"]',
  '.gmail_quote',
  '.moz-cite-prefix',
  '.yahoo_quoted',
  '#divRplyFwdMsg',
  '#divRplyFwdMsg ~ *',
].join(',')

/** True when the HTML has a quoted reply we can collapse. DOMParser never runs scripts. */
export function htmlHasQuote(html: string): boolean {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return doc.querySelector(QUOTE_SELECTOR) !== null
}

/** Splits a plain-text body into the message and its trailing quoted block. */
export function splitTextQuote(text: string): { body: string; quote: string | null } {
  const lines = text.split(/\r?\n/)
  let start = lines.length
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const l = lines[i]!
    if (l.startsWith('>') || l.trim() === '') start = i
    else break
  }
  if (start === lines.length || !lines.slice(start).some((l) => l.startsWith('>')))
    return { body: text, quote: null }
  // Include an attribution line such as "On Tue, Tom wrote:".
  if (start > 0 && /:\s*$/.test(lines[start - 1] ?? '')) start -= 1
  return { body: lines.slice(0, start).join('\n').trimEnd(), quote: lines.slice(start).join('\n') }
}

const COLOR_DECL = /(^|;)\s*(color|background(?:-color|-image)?)\s*:\s*([^;]*)/gi

/** [r, g, b], or null when the value is not a plain colour we can judge. */
function parseColor(value: string): [number, number, number] | null {
  const v = value
    .replace(/!important/i, '')
    .trim()
    .toLowerCase()
  if (v === 'black' || v === 'windowtext') return [0, 0, 0]
  if (v === 'white' || v === 'window') return [255, 255, 255]
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(v)?.[1]
  if (hex) {
    const full = hex.length <= 4 ? [...hex].map((c) => c + c).join('') : hex
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number]
  }
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(v)
  return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : null
}

const grey = ([r, g, b]: [number, number, number]) => Math.max(r, g, b) - Math.min(r, g, b) < 24

/**
 * Colours a mail client writes by default: dark grey text, a white or see-through
 * background. They say nothing about the mail, and in dark mode they give way to the theme.
 */
function isNeutral(property: string, value: string): boolean {
  const v = value
    .replace(/!important/i, '')
    .trim()
    .toLowerCase()
  if (['inherit', 'initial', 'unset', 'currentcolor', 'none'].includes(v)) return true
  if (property === 'background-image') return false
  if (property !== 'color' && v === 'transparent') return true
  const c = parseColor(v)
  if (!c || !grey(c)) return false
  return property === 'color' ? Math.max(...c) <= 96 : Math.min(...c) >= 250
}

/**
 * True when the mail paints itself: colours or backgrounds set by the sender assume a
 * white page, so in dark mode it keeps one. Plain mail follows the theme instead,
 * and so does mail whose only colours are the neutral defaults its client wrote.
 */
export function htmlHasOwnColors(html: string, { withQuote = true } = {}): boolean {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  // A collapsed quote is not on screen, so its colours do not count
  if (!withQuote) doc.querySelectorAll(QUOTE_SELECTOR).forEach((n) => n.remove())
  if (doc.querySelector('[background]')) return true
  for (const el of doc.querySelectorAll('[bgcolor]'))
    if (!isNeutral('background-color', el.getAttribute('bgcolor')!)) return true
  for (const el of doc.querySelectorAll('font[color], [color]'))
    if (!isNeutral('color', el.getAttribute('color')!)) return true
  return [...doc.querySelectorAll('[style]')].some((el) =>
    [...(el.getAttribute('style') ?? '').matchAll(COLOR_DECL)].some((m) => {
      const prop = m[2]!.toLowerCase()
      if (prop === 'color' && el.tagName === 'A' && isClientLinkBlue(m[3]!)) return false
      return !isNeutral(prop, m[3]!)
    }),
  )
}

/** The blue Gmail, Outlook and Word write on every link: the client's colour, not the sender's. */
function isClientLinkBlue(value: string): boolean {
  const c = parseColor(value)
  return (
    c !== null &&
    [
      [17, 85, 204], // Gmail #1155cc
      [5, 99, 193], // Outlook #0563c1
      [0, 0, 255], // Word, old Outlook
      [0, 0, 238], // browser default
    ].some(([r, g, b]) => c[0] === r && c[1] === g && c[2] === b)
  )
}

/** Drops the neutral colours so the dark theme shows through. */
function dropNeutralColors(doc: Document) {
  doc.querySelectorAll('[bgcolor]').forEach((el) => el.removeAttribute('bgcolor'))
  doc.querySelectorAll('font[color], [color]').forEach((el) => el.removeAttribute('color'))
  doc.querySelectorAll('[style]').forEach((el) => {
    const style = el.getAttribute('style')!
    el.setAttribute(
      'style',
      style.replace(COLOR_DECL, (decl, sep: string, prop: string, value: string) =>
        isNeutral(prop.toLowerCase(), value) ? sep : decl,
      ),
    )
  })
}

/** flush: light theme, no frame. sheet: white page for mail that paints itself. dark: plain mail in the dark theme. */
export type FrameLook = 'flush' | 'sheet' | 'dark'

function buildSrcDoc(
  html: string,
  allowRemote: boolean,
  showQuoted: boolean,
  look: FrameLook,
): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc
    .querySelectorAll('script, meta[http-equiv], base, link[rel="preload"], link[rel="prefetch"]')
    .forEach((n) => n.remove())
  // Only mail without colours of its own goes dark, so every colour left is a neutral one
  if (look === 'dark') dropNeutralColors(doc)

  const remote = allowRemote ? ' https: http:' : ''
  const head = doc.head
  const csp = doc.createElement('meta')
  csp.httpEquiv = 'Content-Security-Policy'
  csp.content = `default-src 'none'; img-src 'self' data: cid:${remote}; style-src 'unsafe-inline'${remote}; font-src data:${remote}; form-action 'none'`
  const base = doc.createElement('base')
  base.target = '_blank'
  const style = doc.createElement('style')
  const dark = look === 'dark'
  const sheet = look === 'sheet'
  style.textContent = `
    html { color-scheme: ${dark ? 'dark' : 'light'}; }
    a { color: ${dark ? '#9cc3ff' : '#0b57d0'}; }
    blockquote { border-left-color: ${dark ? '#4a4744' : '#d0ccc6'}; }
    hr { border-color: ${dark ? '#4a4744' : '#e0dcd6'}; }
    body { margin: 0; padding: ${sheet ? '16px' : '4px 0'}; background: ${sheet ? '#fff' : 'transparent'}; color: ${dark ? '#e3dfd9' : '#1c1e21'};
      font: 15px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      overflow-wrap: anywhere; }
    img { max-width: 100%; height: auto; }
    table { max-width: 100%; }
    ${showQuoted ? '' : `${QUOTE_SELECTOR} { display: none !important; }`}
  `
  head.prepend(style)
  head.prepend(base)
  head.prepend(csp)
  return `<!doctype html>${doc.documentElement.outerHTML}`
}

const EXTERNAL = /^(https?|mailto|tel|sms):/i

/**
 * Opens the link the user clicked in the frame from the parent window, so the frame itself
 * never navigates: a page that refuses to be framed would otherwise leave it blank.
 * <base target="_blank"> stays as a fallback for browsers that deliver no click here.
 */
function openLink(event: MouseEvent, doc: Document) {
  const target = event.target as Element | null
  const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null
  if (!anchor || event.button !== 0) return
  event.preventDefault()
  const raw = anchor.getAttribute('href')?.trim() ?? ''
  if (raw.startsWith('#')) {
    doc.getElementById(decodeURIComponent(raw.slice(1)))?.scrollIntoView()
    return
  }
  const href = anchor.href
  if (!EXTERNAL.test(href)) return
  if (/^https?:/i.test(href)) window.open(href, '_blank', 'noopener,noreferrer')
  // mailto: and the like hand over to the system; the page stays
  else window.location.href = href
}

/**
 * Sandboxed message HTML. No `allow-scripts`, so `allow-same-origin` only lets us
 * measure the document height and catch link clicks. Links open outside the frame.
 */
export function MessageFrame({
  html,
  allowRemote,
  showQuoted,
  title,
}: {
  html: string
  allowRemote: boolean
  showQuoted: boolean
  title: string
}) {
  const ref = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(120)
  // Dark mode shows mail on a white sheet; light mode lets it sit flush with the headers.
  const scheme = useComputedColorScheme('light')
  const ownColors = useMemo(
    () => htmlHasOwnColors(html, { withQuote: showQuoted }),
    [html, showQuoted],
  )
  const look: FrameLook = scheme === 'light' ? 'flush' : ownColors ? 'sheet' : 'dark'
  const srcDoc = useMemo(
    () => buildSrcDoc(html, allowRemote, showQuoted, look),
    [html, allowRemote, showQuoted, look],
  )

  useEffect(() => {
    const frame = ref.current
    if (!frame) return
    let observer: ResizeObserver | null = null
    // The body's own height: the document's never goes below the frame's, so a short mail would keep the starting 120px
    const measure = () => {
      const body = frame.contentDocument?.body
      if (body) setHeight(Math.ceil(body.getBoundingClientRect().height))
    }
    let listening: Document | null = null
    const onClick = (e: MouseEvent) => listening && openLink(e, listening)
    const onLoad = () => {
      observer?.disconnect()
      listening?.removeEventListener('click', onClick)
      measure()
      const doc = frame.contentDocument
      if (doc?.body) {
        observer = new ResizeObserver(measure)
        observer.observe(doc.body)
        listening = doc
        doc.addEventListener('click', onClick)
      }
    }
    frame.addEventListener('load', onLoad)
    // An inline document can finish loading before this effect runs: then 'load' never comes
    if (
      frame.contentDocument?.readyState === 'complete' &&
      frame.contentDocument.body?.childNodes.length
    ) {
      onLoad()
    }
    return () => {
      frame.removeEventListener('load', onLoad)
      listening?.removeEventListener('click', onClick)
      observer?.disconnect()
    }
  }, [srcDoc])

  return (
    <iframe
      ref={ref}
      title={title}
      className={classes.frame}
      data-look={look}
      srcDoc={srcDoc}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      style={{ height }}
    />
  )
}
