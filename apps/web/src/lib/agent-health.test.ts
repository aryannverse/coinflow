import { describe, expect, it } from 'vitest'
import { agentHealthState, healthStatusText, pillAction } from './agent-health'

const caps = { chat: true, vision: false, stt: false, tts: false }

describe('agentHealthState', () => {
  it('is loading until the health check answers', () => {
    expect(agentHealthState({ data: undefined, isError: false })).toBe('loading')
  })
  it('follows the answer once it arrives', () => {
    expect(agentHealthState({ data: { online: true, capabilities: caps }, isError: false })).toBe('online')
    expect(agentHealthState({ data: { online: false, capabilities: null }, isError: false })).toBe('offline')
  })
  it('treats a failed health check as offline (it is not retried)', () => {
    expect(agentHealthState({ data: undefined, isError: true })).toBe('offline')
  })
})

describe('pillAction', () => {
  it('opens Ask while health is still loading (the live-smoke bug)', () => {
    expect(pillAction('loading')).toBe('ask')
  })
  it('opens Ask when online', () => {
    expect(pillAction('online')).toBe('ask')
  })
  it('opens the palette only when offline is confirmed', () => {
    expect(pillAction('offline')).toBe('palette')
  })
})

describe('healthStatusText', () => {
  it('says Connecting… while loading, the offline line when offline, and nothing when online', () => {
    expect(healthStatusText('loading')).toBe('Connecting…')
    expect(healthStatusText('offline')).toBe('Assistant offline. Everything else still works.')
    expect(healthStatusText('online')).toBe('')
  })
})
