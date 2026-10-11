import { InsightsView } from '@/components/insights/insights-view'

export const metadata = { title: 'Insights' }

// Client-fetched on purpose: the range (this cycle, last cycle, custom) is chosen in the browser.
export default function InsightsPage() {
  return <InsightsView />
}
