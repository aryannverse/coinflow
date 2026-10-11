import { addDays, addMonthsAnchored, clampDayInMonth, diffDays, type ISODate } from './dates'

export interface PayCycle {
  cycleStart: ISODate
  cycleEnd: ISODate
  nextPayday: ISODate
  daysLeft: number
  cycleLength: number
}

export function payCycle(today: ISODate, paydayDay: number): PayCycle {
  const [y, m] = today.split('-').map(Number)
  const thisMonthPayday = clampDayInMonth(y, m, paydayDay)
  const cycleStart = thisMonthPayday <= today ? thisMonthPayday : addMonthsAnchored(thisMonthPayday, -1, paydayDay)
  const nextPayday = addMonthsAnchored(cycleStart, 1, paydayDay)
  const cycleEnd = addDays(nextPayday, -1)
  return {
    cycleStart,
    cycleEnd,
    nextPayday,
    daysLeft: diffDays(cycleEnd, today) + 1,
    cycleLength: diffDays(nextPayday, cycleStart),
  }
}
