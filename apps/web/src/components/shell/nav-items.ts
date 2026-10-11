import { Activity, CalendarClock, Home, PieChart, UserRound, type LucideIcon } from 'lucide-react'

export const NAV_ITEMS: { href: string; label: string; icon: LucideIcon; mobile: boolean }[] = [
  { href: '/home', label: 'Home', icon: Home, mobile: true },
  { href: '/activity', label: 'Activity', icon: Activity, mobile: true },
  { href: '/insights', label: 'Insights', icon: PieChart, mobile: true },
  { href: '/recurring', label: 'Recurring', icon: CalendarClock, mobile: false },
  { href: '/profile', label: 'Profile', icon: UserRound, mobile: true },
]

/** Active when the path is the item or a child of it ("/activity/abc" keeps Activity lit; "/home-x" does not). */
export const isActivePath = (path: string, href: string) => path === href || path.startsWith(`${href}/`)
