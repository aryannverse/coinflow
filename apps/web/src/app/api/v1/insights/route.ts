import { z } from 'zod'
import { isoDate } from '@/lib/schemas/common'
import { diffDays } from '@/lib/dates'
import { invalid } from '@/server/errors'
import { parseQuery, route } from '@/server/http'
import { getInsights } from '@/server/services/insights'

const query = z.object({ from: isoDate, to: isoDate })

export const GET = route(async ({ req, user }) => {
  const { from, to } = parseQuery(req, query)
  const span = diffDays(to, from)
  if (span < 0) throw invalid('to', 'The end date is before the start date.')
  if (span > 366) throw invalid('from', 'Pick a range of a year or less.')
  return { data: await getInsights(user.id, from, to) }
})
