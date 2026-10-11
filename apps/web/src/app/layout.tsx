import { ClerkProvider } from '@clerk/nextjs'
import { shadcn } from '@clerk/ui/themes'
import type { Metadata, Viewport } from 'next'
import { Geist_Mono, Inter, Space_Grotesk } from 'next/font/google'
import { ThemeRoot } from '@/components/providers/theme-provider'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const grotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-space-grotesk', display: 'swap' })
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono', display: 'swap' })

export const metadata: Metadata = {
  title: { default: 'Coinflow', template: '%s · Coinflow' },
  description: 'Know what’s safe to spend — then split the rest with friends.',
}
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#0E100F' },
    { media: '(prefers-color-scheme: light)', color: '#F4F6F1' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={`dark ${inter.variable} ${grotesk.variable} ${mono.variable}`} suppressHydrationWarning>
      <body>
        <ClerkProvider
          appearance={{ theme: shadcn, variables: { colorPrimary: 'var(--primary)', borderRadius: '14px' } }}
          signInUrl="/sign-in"
          signUpUrl="/sign-up"
          signInFallbackRedirectUrl="/home"
          signUpFallbackRedirectUrl="/onboarding"
        >
          <ThemeRoot>{children}</ThemeRoot>
        </ClerkProvider>
      </body>
    </html>
  )
}
