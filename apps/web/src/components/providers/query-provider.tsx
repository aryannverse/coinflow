'use client'
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { ApiError } from '@/lib/api-client'

/** Expired session → sign in and come straight back (spec §8). */
function redirectOn401(err: unknown) {
  if (err instanceof ApiError && err.status === 401 && typeof window !== 'undefined') {
    const back = encodeURIComponent(window.location.pathname + window.location.search)
    // A full navigation on purpose: it drops every cached query that belongs to the dead session.
    const signIn = `/sign-in?redirect_url=${back}`
    window.location.replace(signIn)
  }
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({
    queryCache: new QueryCache({ onError: redirectOn401 }),
    mutationCache: new MutationCache({ onError: redirectOn401 }),
    defaultOptions: {
      queries: {
        staleTime: 20_000,
        retry: (count, err) => err instanceof ApiError && (err.code === 'offline' || err.status >= 500) && count < 3,
      },
      // Offline quick adds are retried in memory (spec §8).
      mutations: { retry: (count, err) => err instanceof ApiError && err.code === 'offline' && count < 5, retryDelay: 2_000 },
    },
  }))
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
