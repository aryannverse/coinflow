'use client'
import { useQuery } from '@tanstack/react-query'
import type { AgentHealth } from '@/lib/agent-health'
import { api } from '@/lib/api-client'

export type { AgentCapabilities, AgentHealth } from '@/lib/agent-health'

export const useAgentHealth = () =>
  useQuery({
    queryKey: ['agent', 'health'],
    queryFn: () => api<{ data: AgentHealth }>('/agent/health').then((r) => r.data),
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
  })
