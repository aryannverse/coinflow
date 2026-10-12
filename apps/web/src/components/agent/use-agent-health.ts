'use client'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'

export type AgentCapabilities = { chat: boolean; vision: boolean; stt: boolean; tts: boolean }
export type AgentHealth = { online: boolean; capabilities: AgentCapabilities | null }

export const useAgentHealth = () =>
  useQuery({
    queryKey: ['agent', 'health'],
    queryFn: () => api<{ data: AgentHealth }>('/agent/health').then((r) => r.data),
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
  })
