/** Is a card legal in the current Standard format? Pure functions. */
import type { OwnedCard } from '../types.ts'
import { isWestern } from './collection.ts'
import { isBasicEnergy } from './deck.ts'

interface LegalCard {
  name: string
  category?: string
  regulationMark?: string
  legal?: { standard?: boolean }
  set: { id: string }
}

/** This exact print. A new expansion may still lack its marks: it counts if it is inside the format. */
export function isStandardPrint(c: LegalCard, setDate: string, from: string, to: string): boolean {
  if (c.legal?.standard) return true
  if (/^ener/i.test(c.category ?? '') && isBasicEnergy(c.name)) return true
  return !c.regulationMark && /^(sv|me)\d/.test(c.set.id) && from !== '' && setDate >= from && setDate <= to
}

/** "Boss's Orders (Giovanni)" is the same card as "Boss's Orders". */
export const baseName = (name: string) => name.replace(/\s*\([^)]*\)\s*$/, '').replace(/’/g, "'").trim().toLowerCase()

/** Playable = legal in Standard, in a language and size allowed here. Not checked yet counts as playable. */
export const isPlayable = (c: Pick<OwnedCard, 'standard' | 'language' | 'finish'>) => c.standard !== false && isWestern(c.language) && c.finish !== 'jumbo'

/** Legality changes with rotations and reprints: checked again every week. */
export const needsCheck = (c: Pick<OwnedCard, 'standard' | 'standard_date' | 'language'>, today: string) =>
  isWestern(c.language) && (c.standard == null || !c.standard_date || Date.parse(today) - Date.parse(c.standard_date) >= 7 * 86_400_000)
