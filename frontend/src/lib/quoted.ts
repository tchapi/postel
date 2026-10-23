// The quoted part of a reply is folded behind a "•••" toggle, like most mail clients do.

const QUOTE_MARKERS = [
  '.gmail_quote',
  'blockquote[type="cite"]',
  '.moz-cite-prefix',
  '#divRplyFwdMsg',
  '#appendonsend',
  '.yahoo_quoted',
]

const ATTRIBUTION = /(wrote|a écrit|schrieb|escribió|ha scritto)\s*:\s*$/i

/** Folds the quoted tail of an HTML body into a <details>. Untouched when nothing is quoted. */
export function foldQuotedHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const body = doc.body

  let start = body.querySelector(QUOTE_MARKERS.join(','))
  if (!start) {
    const quotes = body.querySelectorAll(':scope > blockquote, :scope > div > blockquote')
    const last = quotes[quotes.length - 1]
    if (last && textAfter(last) === '') start = last
  }
  if (!start?.parentElement) return html

  const previous = start.previousElementSibling
  const attribution = previous?.textContent?.trim() ?? ''
  if (previous && attribution.length < 300 && ATTRIBUTION.test(attribution)) start = previous

  const parent = start.parentElement!
  const details = doc.createElement('details')
  details.className = 'quoted'
  const summary = doc.createElement('summary')
  summary.textContent = '•••'
  summary.title = 'Show quoted text'
  details.append(summary)
  let node: ChildNode | null = start
  while (node) {
    const next: ChildNode | null = node.nextSibling
    details.append(node)
    node = next
  }
  parent.append(details)

  // Never hide the whole message behind the toggle
  const visible = (body.textContent ?? '').replace(details.textContent ?? '', '').trim()
  return visible === '' ? html : body.innerHTML
}

function textAfter(element: Element): string {
  let text = ''
  for (let node = element.nextSibling; node; node = node.nextSibling) text += node.textContent ?? ''
  return text.trim()
}

/** Splits a plain text body into what was written and the trailing "> " quote. */
export function splitQuotedText(text: string): { body: string; quoted: string | null } {
  const lines = text.split(/\r?\n/)
  let start = lines.length
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!.trim()
    if (line === '' || line.startsWith('>')) {
      start = i
      continue
    }
    break
  }
  if (start === lines.length || !lines.slice(start).some((l) => l.trim().startsWith('>'))) {
    return { body: text, quoted: null }
  }
  // The "On ..., someone wrote:" line goes with the quote
  let attribution = start - 1
  while (attribution >= 0 && lines[attribution]!.trim() === '') attribution--
  if (attribution >= 0 && ATTRIBUTION.test(lines[attribution]!.trim())) start = attribution

  const body = lines.slice(0, start).join('\n').trimEnd()
  if (body.trim() === '') return { body: text, quoted: null }
  return { body, quoted: lines.slice(start).join('\n').trim() }
}
