import { describe, expect, it } from 'vitest'
import {
  cpuUsagePercent,
  memoryFreePercent,
  nextSystemEvents,
  type CpuTimes,
  type SystemSample
} from './systemMonitor'

const now = 100_000

function cpu(t: Partial<CpuTimes>): CpuTimes {
  return { user: 0, nice: 0, sys: 0, idle: 0, irq: 0, ...t }
}

describe('cpuUsagePercent', () => {
  it('两帧间 idle 不变则 100% 占用', () => {
    const prev = [cpu({ user: 100, idle: 900 }), cpu({ user: 200, idle: 800 })]
    const cur = [cpu({ user: 110, idle: 900 }), cpu({ user: 210, idle: 800 })]
    expect(cpuUsagePercent(prev, cur)).toBe(100)
  })

  it('占用 50%（繁忙与空闲各半）', () => {
    const prev = [cpu({ user: 100, idle: 900 })]
    const cur = [cpu({ user: 150, idle: 950 })]
    expect(cpuUsagePercent(prev, cur)).toBe(50)
  })

  it('prev 为空或长度不符返回 0', () => {
    expect(cpuUsagePercent(null, [cpu({})])).toBe(0)
    expect(cpuUsagePercent([cpu({})], [cpu({}), cpu({})])).toBe(0)
  })
})

describe('memoryFreePercent', () => {
  it('计算剩余百分比', () => {
    expect(memoryFreePercent(16, 64)).toBe(25)
    expect(memoryFreePercent(0, 0)).toBe(100)
  })
})

describe('nextSystemEvents', () => {
  const base: SystemSample = { cpuPercent: 0, freePercent: 80, idleSeconds: 0 }

  it('负载正常时无 monitor 事件', () => {
    expect(nextSystemEvents([], base, now)).toHaveLength(0)
  })

  it('CPU 过高 → cpu_high', () => {
    const list = nextSystemEvents([], { ...base, cpuPercent: 85 }, now)
    expect(list).toContainEqual(
      expect.objectContaining({ source: 'monitor:cpu', type: 'cpu_high', priority: 9 })
    )
  })

  it('内存过低 → memory_warning', () => {
    const list = nextSystemEvents([], { ...base, freePercent: 10 }, now)
    expect(list).toContainEqual(
      expect.objectContaining({ source: 'monitor:mem', type: 'memory_warning', priority: 9 })
    )
  })

  it('用户空闲 → user_idle', () => {
    const list = nextSystemEvents([], { ...base, idleSeconds: 120 }, now)
    expect(list).toContainEqual(
      expect.objectContaining({ source: 'monitor:user', type: 'user_idle', priority: 6 })
    )
  })

  it('上一轮的 monitor 事件被替换而非叠加', () => {
    const prev = [
      { source: 'monitor:cpu', type: 'cpu_high', priority: 9, durationMs: 8000, occurredAt: now - 4000 },
      { source: 'plugin:x', type: 'success', priority: 8, durationMs: 5000, occurredAt: now }
    ]
    const list = nextSystemEvents(prev, base, now)
    expect(list).toHaveLength(1)
    expect(list[0].source).toBe('plugin:x')
  })

  it('低电量且未充电 → battery_low', () => {
    const list = nextSystemEvents([], { ...base, battery: { percent: 15, charging: false } }, now)
    expect(list).toContainEqual(
      expect.objectContaining({ source: 'monitor:battery', type: 'battery_low', priority: 9 })
    )
  })

  it('充电中 / 电量正常 / 无电池 → 不触发 battery_low', () => {
    const charging = nextSystemEvents([], { ...base, battery: { percent: 15, charging: true } }, now)
    expect(charging.filter((e) => e.type === 'battery_low')).toHaveLength(0)
    const healthy = nextSystemEvents([], { ...base, battery: { percent: 80, charging: false } }, now)
    expect(healthy.filter((e) => e.type === 'battery_low')).toHaveLength(0)
    const none = nextSystemEvents([], { ...base, battery: null }, now)
    expect(none.filter((e) => e.type === 'battery_low')).toHaveLength(0)
    const missing = nextSystemEvents([], base, now)
    expect(missing.filter((e) => e.type === 'battery_low')).toHaveLength(0)
  })
})