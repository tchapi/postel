import type { Address, Message } from '../api/types'
import { displayName, formatFullDate } from './format'

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function textToHtml(text: string): string {
  return `<p>${escapeHtml(text)
    .replace(/\r?\n\r?\n/g, '</p><p>')
    .replace(/\r?\n/g, '<br>')}</p>`
}

function bodyHtml(message: Message): string {
  return message.html ?? (message.text ? textToHtml(message.text) : '')
}

function addressLine(address: Address | null): string {
  if (!address) return ''
  return address.name
    ? `${escapeHtml(address.name)} &lt;${escapeHtml(address.email)}&gt;`
    : escapeHtml(address.email)
}

/** An empty paragraph to type in, then the original as a blockquote. */
export function replyHtml(message: Message): string {
  const when = message.date ? formatFullDate(message.date) : ''
  return `<p></p><p>On ${escapeHtml(when)}, ${addressLine(message.from)} wrote:</p><blockquote>${bodyHtml(message)}</blockquote>`
}

export function forwardHtml(message: Message): string {
  const lines = [
    `From: ${addressLine(message.from)}`,
    message.date ? `Date: ${escapeHtml(formatFullDate(message.date))}` : null,
    `Subject: ${escapeHtml(message.subject)}`,
    message.to.length ? `To: ${message.to.map(addressLine).join(', ')}` : null,
    message.cc.length ? `Cc: ${message.cc.map(addressLine).join(', ')}` : null,
  ].filter(Boolean)
  return `<p></p><p>---------- Forwarded message ----------<br>${lines.join('<br>')}</p>${bodyHtml(message)}`
}

export function replySubject(subject: string): string {
  return /^\s*re\s*:/i.test(subject) ? subject : `Re: ${subject}`
}

export function forwardSubject(subject: string): string {
  return /^\s*fwd?\s*:/i.test(subject) ? subject : `Fwd: ${subject}`
}

const sameAddress = (a: Address, b: Address) => a.email.toLowerCase() === b.email.toLowerCase()

/** Everyone but me, without duplicates. */
export function replyAllRecipients(message: Message, me: string): { to: Address[]; cc: Address[] } {
  const mine = { email: me }
  const seen: Address[] = [mine]
  const take = (list: Address[]) =>
    list.filter((a) => {
      if (seen.some((s) => sameAddress(s, a))) return false
      seen.push(a)
      return true
    })
  const sender = message.replyTo.length ? message.replyTo : message.from ? [message.from] : []
  return { to: take([...sender, ...message.to]), cc: take(message.cc) }
}

export function replyRecipients(message: Message): Address[] {
  return message.replyTo.length ? message.replyTo : message.from ? [message.from] : []
}

export { displayName }
