/** Cuts a .vcf file into its cards. What lies outside a card is dropped. */
export function splitCards(file: string): string[] {
  const cards: string[] = []
  let lines: string[] = []
  let depth = 0
  for (const line of file.replace(/^﻿/, '').split(/\r\n|\n|\r/)) {
    // A folded line starts with a space, so only the end is trimmed
    const bare = line.trimEnd().toUpperCase()
    if (bare === 'BEGIN:VCARD') depth += 1
    if (depth > 0) lines.push(line)
    if (bare === 'END:VCARD' && depth > 0) {
      depth -= 1
      if (depth === 0) {
        cards.push(lines.join('\r\n') + '\r\n')
        lines = []
      }
    }
  }
  return cards
}

/**
 * Cards grouped into small files. Each card is one request to the address book server,
 * so a large file sent in one go would run past the backend's time limit; sent in
 * batches, it also shows how far it is.
 */
export function batchCards(cards: string[], maxCards = 25, maxLength = 2_000_000): string[][] {
  const batches: string[][] = []
  let batch: string[] = []
  let length = 0
  for (const card of cards) {
    if (batch.length > 0 && (batch.length >= maxCards || length + card.length > maxLength)) {
      batches.push(batch)
      batch = []
      length = 0
    }
    batch.push(card)
    length += card.length
  }
  if (batch.length > 0) batches.push(batch)
  return batches
}
