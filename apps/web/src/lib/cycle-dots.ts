import { addDays, diffDays, type ISODate } from './dates'

export function cycleDots(cycleStart: ISODate, cycleEnd: ISODate, today: ISODate): ('past' | 'today' | 'future')[] {
  const n = diffDays(cycleEnd, cycleStart) + 1
  return Array.from({ length: n }, (_, i) => {
    const d = addDays(cycleStart, i)
    return d < today ? 'past' : d === today ? 'today' : 'future'
  })
}
