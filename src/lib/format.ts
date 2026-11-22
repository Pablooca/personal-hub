export const LOCALE = 'es-ES'
export const CURRENCY = 'EUR'

const money = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: CURRENCY, minimumFractionDigits: 2, useGrouping: 'always' })
const moneyCompact = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: CURRENCY,
  maximumFractionDigits: 0,
  useGrouping: 'always',
})

export const fmtMoney = (n: number) => money.format(n)
export const fmtMoneyShort = (n: number) => moneyCompact.format(n)
export const fmtPct = (n: number) => `${(Number.isFinite(n) ? n : 0).toLocaleString(LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })

export const fmtDate = (d: Date, opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' }) =>
  d.toLocaleDateString(LOCALE, opts)

export const fmtMonth = (d: Date) => d.toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' })

export const fmtWeekday = (d: Date, style: 'short' | 'long' | 'narrow' = 'short') =>
  d.toLocaleDateString(LOCALE, { weekday: style })

export const labelize = (s: string) => s.replace(/_/g, ' ').replace(/^\p{L}/u, (c) => c.toUpperCase())

/** Capitalise the first letter (Spanish month/weekday names come lower-case). */
export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
      })
