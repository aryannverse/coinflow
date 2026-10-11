import { AppProviders } from '@/components/providers/app-providers'

// Public marketing tree: system motion preference (there is no signed-in profile to read it from).
// Theme + Clerk live in the root layout; AppProviders is mounted exactly once per tree.
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <AppProviders motionPref="system">{children}</AppProviders>
}
