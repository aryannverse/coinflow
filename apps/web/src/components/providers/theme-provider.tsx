'use client'
import { ThemeProvider } from 'next-themes'

/** App-wide theme (class strategy, dark by default). Mounted once in the root layout. */
export function ThemeRoot({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      {children}
    </ThemeProvider>
  )
}
