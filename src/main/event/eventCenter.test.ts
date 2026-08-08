import { describe, expect, it } from 'vitest'
import {
  activeEvents,
  addEvent,
  computeState,
  diffEventTypes,
  hasActiveEvent,
  pruneEvents,
  type PetEvent
} from './eventCenter'

const now = 100_000

function ev(partial: Partial<PetEvent>): PetEvent {
  return {
    source: 'test',
    type: 'idle_event',
    priority: 2,
    durationMs: 10_000,
    occurredAt: now,
    ...partial
  }
}

describe('addEvent：同源同类型去重刷新，其余追加', () => {
  it('同 source+type 替换而非堆叠', () => {
    let list: PetEvent[] = []
    list = addEvent(list, ev({ type: 'cpu_high', occurredAt: now }))
    list = addEvent(list, ev({ type: 'user_idle', occurredAt: now }))
    list = addEvent(list, ev({ type: 'cpu_high', occurredAt: now + 5000 }))
    expect(list).toHaveLength(2)
    expect(list.find((e) => e.type === 'cpu_high')?.occurredAt).toBe(now + 5000)
  })
})

describe('activeEvents：过期事件被过滤', () => {
  it('duration 到期后剔除', () => {
    const list = [ev({ type: 'cpu_high', durationMs: 3000 }), ev({ type: 'user_idle' })]
    expect(activeEvents(list, now + 4000).map((e) => e.type)).toEqual(['user_idle'])
  })
})

describe('pruneEvents：惰性裁剪过期事件（防无界增长）', () => {
  it('剔除已过期条目，保留活跃条目', () => {
    const list = [
      ev({ source: 'push:1', type: 'notice', durationMs: 100_000, occurredAt: now }),
      ev({ source: 'push:2', type: 'notice', durationMs: 8000, occurredAt: now - 100_000 }),
      ev({ source: 'clipboard', type: 'clipboard', durationMs: 100_000, occurredAt: now })
    ]
    expect(pruneEvents(list, now + 50_000).map((e) => e.source)).toEqual(['push:1', 'clipboard'])
  })

  it('恰好到期（now === occurredAt + durationMs）视为过期', () => {
    const list = [ev({ source: 'push:1', type: 'notice', durationMs: 8000, occurredAt: now })]
    expect(pruneEvents(list, now + 8000)).toHaveLength(0)
  })

  it('空列表幂等', () => {
    expect(pruneEvents([], now)).toEqual([])
  })
})

describe('hasActiveEvent：仅活跃集内的同 source+type 视为存在', () => {
  it('仍在活跃期 → true', () => {
    const list = [ev({ source: 'clipboard', type: 'clipboard', durationMs: 8000 })]
    expect(hasActiveEvent(list, 'clipboard', 'clipboard', now + 5000)).toBe(true)
  })

  it('已过期（occurredAt + durationMs <= now）→ false', () => {
    const list = [ev({ source: 'clipboard', type: 'clipboard', durationMs: 8000 })]
    expect(hasActiveEvent(list, 'clipboard', 'clipboard', now + 8000)).toBe(false)
  })

  it('活跃但 type 不同 → false', () => {
    const list = [ev({ source: 'clipboard', type: 'clipboard', durationMs: 8000 })]
    expect(hasActiveEvent(list, 'clipboard', 'other', now + 5000)).toBe(false)
  })
})

describe('computeState：按类型+优先级决策', () => {
  it('无事件 → idle', () => {
    expect(computeState([]).state).toBe('idle')
  })

  it('cpu_high → warning', () => {
    const list = [ev({ source: 'monitor:cpu', type: 'cpu_high', priority: 9 })]
    expect(computeState(list)).toMatchObject({ state: 'warning', reason: 'cpu_high' })
  })

  it('user_idle → sleep', () => {
    const list = [ev({ source: 'monitor:user', type: 'user_idle', priority: 6 })]
    expect(computeState(list).state).toBe('sleep')
  })

  it('success → happy', () => {
    const list = [ev({ type: 'success', priority: 8 })]
    expect(computeState(list).state).toBe('happy')
  })

  it('working → focus', () => {
    const list = [ev({ type: 'focus', priority: 5 })]
    expect(computeState(list).state).toBe('focus')
  })

  it('高优先级低层状态盖过低优先级高层情绪', () => {
    const list = [
      ev({ type: 'user_idle', priority: 6 }),
      ev({ type: 'success', priority: 8 })
    ]
    expect(computeState(list).state).toBe('happy')
  })

  it('紧急事件(高优先级)盖过开心的成功事件', () => {
    const list = [
      ev({ source: 'monitor:cpu', type: 'cpu_high', priority: 9 }),
      ev({ type: 'success', priority: 8 })
    ]
    expect(computeState(list).state).toBe('warning')
  })

  it('同级并列按 severity 排序（warning > focus > sleep > happy）', () => {
    const list = [
      ev({ type: 'working', priority: 9 }),
      ev({ type: 'user_idle', priority: 9 }),
      ev({ type: 'cpu_high', priority: 9 })
    ]
    expect(computeState(list).state).toBe('warning')
  })

  it('未知事件类型不改变状态', () => {
    const list = [ev({ type: 'unknown_signal', priority: 10 })]
    expect(computeState(list).state).toBe('idle')
  })
})

describe('diffEventTypes：事件通知去重', () => {
  it('首次出现的事件为新增，重复出现不重复广播', () => {
    const list = [ev({ source: 'monitor:cpu', type: 'cpu_high' }), ev({ source: 'monitor:user', type: 'user_idle' })]
    const first = diffEventTypes(new Set(), list)
    expect(first.added.sort()).toEqual(['cpu_high', 'user_idle'])
    const second = diffEventTypes(first.current, list)
    expect(second.added).toEqual([])
  })

  it('事件消失后再次出现重新广播', () => {
    const list1 = [ev({ source: 'monitor:cpu', type: 'cpu_high' })]
    const d1 = diffEventTypes(new Set(), list1)
    expect(d1.added).toEqual(['cpu_high'])
    const d2 = diffEventTypes(d1.current, [])
    expect(d2.added).toEqual([])
    const d3 = diffEventTypes(d2.current, list1)
    expect(d3.added).toEqual(['cpu_high'])
  })

  it('跳过 schedule: 来源事件（由 schedule:fired 气泡承担通知）', () => {
    const list = [ev({ source: 'schedule:abc', type: 'alarm' })]
    const d = diffEventTypes(new Set(), list)
    expect(d.added).toEqual([])
    expect(d.current.size).toBe(0)
  })
})