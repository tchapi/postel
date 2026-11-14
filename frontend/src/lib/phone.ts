import { createContext, use, useCallback } from 'react'

/*
 * Phone numbers are shown the same way wherever they come from: "+33 6 12 34 56 78",
 * with the flag of the country. Cards keep the number as it was typed; only what is
 * shown, and the tel: link, go through here.
 */

/** Calling code -> country. Codes shared by several countries name the main one. */
const CODES =
  '1:US,7:RU,20:EG,27:ZA,30:GR,31:NL,32:BE,33:FR,34:ES,36:HU,39:IT,40:RO,41:CH,43:AT,44:GB,45:DK,46:SE,47:NO,48:PL,49:DE,' +
  '51:PE,52:MX,53:CU,54:AR,55:BR,56:CL,57:CO,58:VE,60:MY,61:AU,62:ID,63:PH,64:NZ,65:SG,66:TH,81:JP,82:KR,84:VN,86:CN,' +
  '90:TR,91:IN,92:PK,93:AF,94:LK,95:MM,98:IR,211:SS,212:MA,213:DZ,216:TN,218:LY,220:GM,221:SN,222:MR,223:ML,224:GN,' +
  '225:CI,226:BF,227:NE,228:TG,229:BJ,230:MU,231:LR,232:SL,233:GH,234:NG,235:TD,236:CF,237:CM,238:CV,239:ST,240:GQ,' +
  '241:GA,242:CG,243:CD,244:AO,245:GW,248:SC,249:SD,250:RW,251:ET,252:SO,253:DJ,254:KE,255:TZ,256:UG,257:BI,258:MZ,' +
  '260:ZM,261:MG,262:RE,263:ZW,264:NA,265:MW,266:LS,267:BW,268:SZ,269:KM,291:ER,297:AW,298:FO,299:GL,350:GI,351:PT,' +
  '352:LU,353:IE,354:IS,355:AL,356:MT,357:CY,358:FI,359:BG,370:LT,371:LV,372:EE,373:MD,374:AM,375:BY,376:AD,377:MC,' +
  '378:SM,380:UA,381:RS,382:ME,383:XK,385:HR,386:SI,387:BA,389:MK,420:CZ,421:SK,423:LI,501:BZ,502:GT,503:SV,504:HN,' +
  '505:NI,506:CR,507:PA,508:PM,509:HT,590:GP,591:BO,592:GY,593:EC,594:GF,595:PY,596:MQ,597:SR,598:UY,599:CW,670:TL,' +
  '673:BN,674:NR,675:PG,676:TO,677:SB,678:VU,679:FJ,680:PW,682:CK,685:WS,686:KI,687:NC,689:PF,691:FM,692:MH,850:KP,' +
  '852:HK,853:MO,855:KH,856:LA,880:BD,886:TW,960:MV,961:LB,962:JO,963:SY,964:IQ,965:KW,966:SA,967:YE,968:OM,970:PS,' +
  '971:AE,972:IL,973:BH,974:QA,975:BT,976:MN,977:NP,992:TJ,993:TM,994:AZ,995:GE,996:KG,998:UZ,' +
  // Kazakhstan shares +7 with Russia
  '76:KZ,77:KZ,' +
  // +1 is shared: these area codes are not the United States
  '1242:BS,1246:BB,1264:AI,1268:AG,1284:VG,1340:VI,1345:KY,1441:BM,1473:GD,1649:TC,1664:MS,1670:MP,1671:GU,1684:AS,' +
  '1721:SX,1758:LC,1767:DM,1784:VC,1787:PR,1939:PR,1809:DO,1829:DO,1849:DO,1868:TT,1869:KN,1876:JM,' +
  [
    204, 226, 236, 249, 250, 263, 289, 306, 343, 354, 365, 367, 368, 382, 403, 416, 418, 428, 431,
    437, 438, 450, 468, 474, 506, 514, 519, 548, 579, 581, 584, 587, 604, 613, 639, 647, 672, 683,
    705, 709, 742, 753, 778, 780, 782, 807, 819, 825, 867, 873, 879, 902, 905,
  ]
    .map((area) => `1${area}:CA`)
    .join(',')

const COUNTRY_BY_PREFIX = new Map(
  CODES.split(',').map((pair) => pair.split(':') as [string, string]),
)

/** How long the calling code is, when the prefix that names the country is longer (+1 204 is +1). */
const callingCode = (prefix: string) =>
  prefix.startsWith('1') ? '1' : prefix.startsWith('7') ? '7' : prefix

/** Countries where a number written for use inside the country starts with a 0 that the international form drops. */
const TRUNK_ZERO = new Set(
  '20,27,31,32,33,40,41,43,44,46,49,54,60,61,62,63,64,66,81,82,84,86,90,91,212,213,234,254,353,358,359,380,381,385,386,972'.split(
    ',',
  ),
)

/** How the digits after the calling code are grouped, where there is a habit. Others go by threes. */
const GROUPS: Record<string, number[]> = {
  1: [3, 3, 4],
  33: [1, 2, 2, 2, 2],
  34: [3, 3, 3],
  39: [3, 3, 4],
  41: [2, 3, 2, 2],
  44: [4, 6],
  351: [3, 3, 3],
  352: [3, 3, 3],
}

function group(code: string, national: string): string {
  // The British habit below is the one of mobile numbers
  const habit = code === '44' && !national.startsWith('7') ? undefined : GROUPS[code]
  if (habit && habit.reduce((a, b) => a + b, 0) === national.length) {
    let at = 0
    return habit.map((size) => national.slice(at, (at += size))).join(' ')
  }
  // By threes, never leaving a digit alone at the end
  const parts: string[] = []
  let rest = national
  while (rest.length > 4) {
    parts.push(rest.slice(0, 3))
    rest = rest.slice(3)
  }
  if (rest.length === 4) parts.push(rest.slice(0, 2), rest.slice(2))
  else if (rest) parts.push(rest)
  return parts.join(' ')
}

export type Phone = {
  /** As shown: "+33 6 12 34 56 78", or the number as typed when it cannot be read. */
  text: string
  /** Two-letter country, when known. */
  country?: string
  /** "+33612345678", for a tel: link; the typed number's digits otherwise. */
  dial: string
}

const asTyped = (raw: string): Phone => ({
  text: raw.trim().replace(/\s+/g, ' '),
  dial: raw.replace(/[^\d+#*,;]/g, ''),
})

/**
 * Reads a number however it was written. One that starts with "+" or "00" says its
 * country; one that starts with a single 0 is taken to be from `home`, the calling code
 * of the country most numbers around it are from.
 */
export function readPhone(raw: string, home?: string): Phone {
  // "+33 (0)6 12…": the 0 in brackets is only for calls inside the country
  const typed = raw.trim().replace(/\(0\)/g, '')
  // Letters mean an extension or a note: left as typed
  if (/[a-z]/i.test(typed)) return asTyped(raw)
  const digits = typed.replace(/\D/g, '')

  let international = ''
  if (typed.startsWith('+')) international = digits
  else if (digits.startsWith('00')) international = digits.slice(2)
  else if (home && TRUNK_ZERO.has(home) && /^0[1-9]/.test(digits))
    international = home + digits.slice(1)
  if (international.length < 8 || international.length > 15) return asTyped(raw)

  for (let length = 4; length >= 1; length--) {
    const prefix = international.slice(0, length)
    const country = COUNTRY_BY_PREFIX.get(prefix)
    if (!country) continue
    const code = callingCode(prefix)
    return {
      text: `+${code} ${group(code, international.slice(code.length))}`,
      country,
      dial: `+${international}`,
    }
  }
  return asTyped(raw)
}

/** "FR" -> the flag emoji. */
export function flagOf(country: string): string {
  return String.fromCodePoint(...[...country.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0)))
}

/**
 * The calling code that numbers written without one most likely belong to: the one most
 * of the address book's own numbers carry, else the country of the browser's language.
 */
export function homeCallingCode(
  phones: string[],
  languages: readonly string[] = [],
): string | undefined {
  const counts = new Map<string, number>()
  let known = 0
  for (const phone of phones) {
    const read = readPhone(phone)
    if (!read.country) continue
    const code = read.text.slice(1, read.text.indexOf(' '))
    counts.set(code, (counts.get(code) ?? 0) + 1)
    known += 1
  }
  const [code, count] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? []
  // Only when the book is clear about it: a few numbers of one country, and most of them
  if (code && count! >= 3 && count! * 2 > known) return code

  for (const language of languages) {
    const region = /[-_]([A-Za-z]{2})\b/.exec(language)?.[1]?.toUpperCase()
    if (!region) continue
    for (const [prefix, country] of COUNTRY_BY_PREFIX)
      if (country === region) return callingCode(prefix)
  }
  return undefined
}

/** The flag, then the number: for places that show a phone as plain text. */
export function phoneLabel(phone: Phone): string {
  return phone.country ? `${flagOf(phone.country)} ${phone.text}` : phone.text
}

/** The calling code of the address book on screen, see homeCallingCode. */
export const PhoneHomeContext = createContext<string | undefined>(undefined)

/** Reads numbers the way the address book on screen does. */
export function usePhoneReader(): (raw: string) => Phone {
  const home = use(PhoneHomeContext)
  return useCallback((raw: string) => readPhone(raw, home), [home])
}
