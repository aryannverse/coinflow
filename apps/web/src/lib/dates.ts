export type ISODate = string // YYYY-MM-DD, a calendar day in Asia/Kolkata
export const IST = 'Asia/Kolkata'

const istDay = new Intl.DateTimeFormat('en-CA', { timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit' })

export function toISTDate(instant: Date): ISODate {
  return istDay.format(instant) // en-CA formats as YYYY-MM-DD
}

export function istStartOfDay(d: ISODate): Date {
  return new Date(`${d}T00:00:00+05:30`)
}

export function istNoon(d: ISODate): Date {
  return new Date(`${d}T12:00:00+05:30`)
}

function parts(d: ISODate) {
  const [y, m, day] = d.split('-').map(Number)
  return { y, m, day }
}

function fromUTC(date: Date): ISODate {
  return date.toISOString().slice(0, 10)
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function clampDayInMonth(year: number, month: number, day: number): ISODate {
  return fromUTC(new Date(Date.UTC(year, month - 1, Math.min(day, daysInMonth(year, month)))))
}

export function addDays(d: ISODate, n: number): ISODate {
  const { y, m, day } = parts(d)
  return fromUTC(new Date(Date.UTC(y, m - 1, day + n)))
}

export function diffDays(a: ISODate, b: ISODate): number {
  const pa = parts(a)
  const pb = parts(b)
  return Math.round((Date.UTC(pa.y, pa.m - 1, pa.day) - Date.UTC(pb.y, pb.m - 1, pb.day)) / 86_400_000)
}

export function addMonthsAnchored(d: ISODate, months: number, anchorDay: number): ISODate {
  const { y, m } = parts(d)
  const total = y * 12 + (m - 1) + months
  return clampDayInMonth(Math.floor(total / 12), (total % 12) + 1, anchorDay)
}

export function dayOfMonth(d: ISODate): number {
  return parts(d).day
}

/** Display an ISODate. Parsed as UTC midnight and formatted in UTC, so the day never shifts and server/client agree (R37). */
export function formatISODate(d: ISODate, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }): string {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { ...opts, timeZone: 'UTC' })
}
