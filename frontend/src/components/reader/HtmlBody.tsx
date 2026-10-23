import { useEffect, useMemo, useRef } from 'react'

import { foldQuotedHtml } from '../../lib/quoted'

type Props = {
  html: string
  remoteImages: boolean
}

/**
 * Sanitized mail HTML in a sandboxed iframe: no scripts, no forms, links open
 * in a new tab, and the CSP only lets images through (remote ones on demand).
 */
export function HtmlBody({ html, remoteImages }: Props) {
  const ref = useRef<HTMLIFrameElement>(null)
  const folded = useMemo(() => foldQuotedHtml(html), [html])

  const csp = [
    "default-src 'none'",
    `img-src 'self' data:${remoteImages ? ' https: http:' : ''}`,
    "style-src 'unsafe-inline'",
  ].join('; ')

  const doc = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><base target="_blank"><style>
    :root { color-scheme: light dark; }
    body { margin: 0; padding: 4px 0; font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: CanvasText; background: transparent; overflow-wrap: anywhere; }
    img { max-width: 100%; height: auto; }
    blockquote { margin: 0 0 0 0.5em; padding-left: 0.75em; border-left: 2px solid GrayText; color: GrayText; }
    pre { white-space: pre-wrap; }
    table { max-width: 100%; }
    a { color: LinkText; }
    details.quoted > summary { list-style: none; display: inline-block; margin: 8px 0; padding: 0 8px; border-radius: 8px; font-size: 12px; line-height: 16px; letter-spacing: 1px; color: GrayText; background: color-mix(in srgb, GrayText 16%, transparent); cursor: pointer; }
    details.quoted > summary::-webkit-details-marker { display: none; }
  </style></head><body>${folded}</body></html>`

  useEffect(() => {
    const frame = ref.current
    if (!frame) return
    const fit = () => {
      const body = frame.contentDocument?.documentElement
      if (body) frame.style.height = `${body.scrollHeight}px`
    }
    const onLoad = () => {
      fit()
      const target = frame.contentDocument?.body
      if (!target) return
      const observer = new ResizeObserver(fit)
      observer.observe(target)
      frame.contentDocument
        ?.querySelectorAll('img')
        .forEach((img) => img.addEventListener('load', fit))
    }
    frame.addEventListener('load', onLoad)
    return () => frame.removeEventListener('load', onLoad)
  }, [doc])

  return (
    <iframe
      ref={ref}
      title="Message"
      srcDoc={doc}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      style={{ width: '100%', border: 0, display: 'block', minHeight: 120 }}
    />
  )
}
