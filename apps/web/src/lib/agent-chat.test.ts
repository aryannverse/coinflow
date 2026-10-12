import { describe, expect, it } from 'vitest'
import { chatReducer, initialChat, STATUS_TEXT, type ChatState } from './agent-chat'

const ev = (event: string, data: unknown, id = String(Math.random())) => ({ type: 'event' as const, id, event: { event, data: JSON.stringify(data) } })
const run = (actions: Parameters<typeof chatReducer>[1][], s: ChatState = initialChat('t1')) => actions.reduce(chatReducer, s)

describe('chatReducer', () => {
  it('shows Thinking… the moment a message is sent (spec §4.7: within 100 ms, as text)', () => {
    const s = run([{ type: 'send', id: 'u1', text: '250 lunch', source: 'chat' }])
    expect(s.status).toBe('thinking')
    expect(STATUS_TEXT[s.status]).toBe('Thinking…')
    expect(s.items).toEqual([{ id: 'u1', role: 'user', text: '250 lunch', source: 'chat' }])
  })

  it('streams tokens into one reply, adds proposals as chips, and goes idle on done', () => {
    const p = { id: 'p1', kind: 'expense', summary: 'Expense ₹250', payload: {} }
    const s = run([
      { type: 'send', id: 'u1', text: '250 lunch', source: 'voice' },
      ev('status', { state: 'tool', label: 'Drafting…' }),
      ev('proposal', p),
      ev('token', { text: 'Drafted ' }, 'a1'),
      ev('token', { text: '₹250.' }, 'a2'),
      ev('done', { threadId: 'main' }),
    ])
    expect(s.status).toBe('idle')
    expect(s.items.map((i) => i.role)).toEqual(['user', 'proposal', 'assistant'])
    expect(s.items[2]).toMatchObject({ role: 'assistant', text: 'Drafted ₹250.', done: true })
    expect(s.items[1]).toMatchObject({ id: 'p1', state: 'pending' })
  })

  it('an error becomes a message with Retry for the last thing the user said', () => {
    const s = run([{ type: 'send', id: 'u1', text: 'plan goa', source: 'chat' }, ev('error', { code: 'llm_timeout', message: 'That took too long.' }, 'e1')])
    expect(s.items[1]).toEqual({ id: 'e1', role: 'error', code: 'llm_timeout', message: 'That took too long.', retry: { text: 'plan goa', source: 'chat' } })
  })

  it('tracks a proposal’s approve / fail / dismiss', () => {
    const s0 = run([ev('proposal', { id: 'p1', kind: 'budget', summary: 'Plan', payload: {} })])
    expect(run([{ type: 'proposal', id: 'p1', state: 'saving' }], s0).items[0]).toMatchObject({ state: 'saving' })
    expect(run([{ type: 'proposal', id: 'p1', state: 'failed', error: 'Nope' }], s0).items[0]).toMatchObject({ state: 'failed', error: 'Nope' })
  })

  it('reset starts a fresh thread', () => {
    expect(run([{ type: 'send', id: 'u', text: 'x', source: 'chat' }, { type: 'reset', threadId: 't2' }])).toEqual(initialChat('t2'))
  })
  it('Edit moves a chip to editing (no Approve), and plan progress survives a failed retry', () => {
    const s0 = run([ev('proposal', { id: 'p1', kind: 'plan_bundle', summary: 'Plan', payload: {} })])
    expect(run([{ type: 'proposal', id: 'p1', state: 'editing' }], s0).items[0]).toMatchObject({ state: 'editing' })
    const s1 = run([
      { type: 'proposal', id: 'p1', state: 'saving', progress: { groupId: 'g1', budgetsDone: 0 } },
      { type: 'proposal', id: 'p1', state: 'saving', progress: { groupId: 'g1', budgetsDone: 1 } },
      { type: 'proposal', id: 'p1', state: 'failed', error: 'Nope' },
    ], s0)
    expect(s1.items[0]).toMatchObject({ state: 'failed', error: 'Nope', progress: { groupId: 'g1', budgetsDone: 1 } })
  })
})
