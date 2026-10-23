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

/**
 * True when the mail paints itself: colours or backgrounds set by the sender assume a
 * white page, so in dark mode it keeps one. Plain mail follows the theme instead.
 */
export function htmlHasOwnColors(html: string): boolean {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  if (doc.querySelector('[bgcolor], [background], font[color], [color]')) return true
  return [...doc.querySelectorAll('[style]')].some((el) =>
    /(^|;)\s*(color|background(-color|-image)?)\s*:/i.test(el.getAttribute('style') ?? ''),
  )
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

  const remote = allowRemote ? ' https: http:' : ''
  const head = doc.head
  const csp = doc.createElement('meta')
  csp.httpEquiv = 'Content-Security-Policy'
  csp.content = `default-src 'none'; img-src 'self' data: cid:${remote}; style-src 'unsafe-inline'${remote}; font-src data:${remote}`
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

/**
 * Sandboxed message HTML. No `allow-scripts`, so `allow-same-origin` only lets us
 * measure the document height. Links open in a new tab via <base target>.
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
  const ownColors = useMemo(() => htmlHasOwnColors(html), [html])
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
    const onLoad = () => {
      observer?.disconnect()
      measure()
      const body = frame.contentDocument?.body
      if (body) {
        observer = new ResizeObserver(measure)
        observer.observe(body)
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
