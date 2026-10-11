import { ClerkProvider } from '@clerk/nextjs'
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = { title: 'Coinflow', description: 'Know what’s safe to spend.' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN">
      <body>
        <ClerkProvider
          signInUrl="/sign-in"
          signUpUrl="/sign-up"
          signInFallbackRedirectUrl="/home"
          signUpFallbackRedirectUrl="/onboarding"
        >
          {children}
        </ClerkProvider>
      </body>
    </html>
  )
}
