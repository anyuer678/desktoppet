import { describe, expect, it } from 'vitest'
import { createEventHistory, recordNewEvents } from './eventHistory'
import type { PetEvent } from './eventCenter'

function ev(over: Partial<PetEvent> = {}): PetEvent {
  return { source: 'a', type: 't', priority: 5, durationMs: 8000, occurredAt: 1, ...over }
}

describe('createEventHistory', () => {
  it('add 后 list 倒序（最新在前）', () => {
    const h = createEventHistory()
    h.add(ev({ source: 'a', occurredAt: 1 }))
    h.add(ev({ source: 'b', occurredAt: 2 }))
    expect(h.list().map((e) => e.source)).toEqual(['b', 'a'])
  })
  it('超出 limit 淘汰最旧', () => {
    const h = createEventHistory(2)
    h.add(ev({ source: 'a' }))
    h.add(ev({ source: 'b' }))
    h.add(ev({ source: 'c' }))
    expect(h.list().map((e) => e.source)).toEqual(['c', 'b'])
    expect(h.size).toBe(2)
  })
  it('重复 add 不去重（去重由调用方按"新增"语义负责）', () => {
    const h = createEventHistory()
    h.add(ev({ source: 'a', type: 't' }))
    h.add(ev({ source: 'a', type: 't' }))
    expect(h.size).toBe(2)
  })
  it('clear 清空', () => {
    const h = createEventHistory()
    h.add(ev({}))
    h.clear()
    expect(h.list()).toEqual([])
    expect(h.size).toBe(0)
  })
  it('list 返回拷贝，外部修改不影响内部', () => {
    const h = createEventHistory()
    h.add(ev({}))
    const l = h.list()
    l[0]!.source = 'mutated'
    expect(h.list()[0]!.source).toBe('a')
  })
})

describe('recordNewEvents', () => {
  it('无活跃同源同型 → 记录并返回 1', () => {
    const h = createEventHistory()
    const r = recordNewEvents([], [ev({ source: 'monitor:cpu', type: 'cpu_high' })], h, 10_000)
    expect(r).toBe(1)
    expect(h.size).toBe(1)
  })
  it('活跃中同源同型 → 不记录（持续告警不刷屏）', () => {
    const h = createEventHistory()
    const active = [ev({ source: 'monitor:cpu', type: 'cpu_high', occurredAt: 9_000, durationMs: 8_000 })]
    const r = recordNewEvents(active, [ev({ source: 'monitor:cpu', type: 'cpu_high', occurredAt: 10_000 })], h, 10_000)
    expect(r).toBe(0)
    expect(h.size).toBe(0)
  })
  it('已过期 → 记录（两次分离的发生算两次）', () => {
    const h = createEventHistory()
    const active = [ev({ source: 'monitor:cpu', type: 'cpu_high', occurredAt: 0, durationMs: 8_000 })]
    const r = recordNewEvents(active, [ev({ source: 'monitor:cpu', type: 'cpu_high', occurredAt: 20_000 })], h, 20_000)
    expect(r).toBe(1)
    expect(h.size).toBe(1)
  })
  it('批次部分新部分旧 → 只记新的', () => {
    const h = createEventHistory()
    const active = [ev({ source: 'monitor:cpu', type: 'cpu_high', occurredAt: 9_000, durationMs: 8_000 })]
    const incoming = [
      ev({ source: 'monitor:cpu', type: 'cpu_high', occurredAt: 10_000 }),
      ev({ source: 'plugin:x', type: 'success', occurredAt: 10_000 })
    ]
    const r = recordNewEvents(active, incoming, h, 10_000)
    expect(r).toBe(1)
    expect(h.list()[0]!.type).toBe('success')
  })
})
