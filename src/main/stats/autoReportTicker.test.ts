import { describe, expect, it, vi } from 'vitest'
import type { AutoReportConfig } from '../../shared/ipc'
import { createAutoReportTicker } from './autoReportTicker'

const cfg: AutoReportConfig = {
  weekly: { enabled: true, dayOfWeek: 0, dayOfMonth: 1, time: '21:00' },
  monthly: { enabled: true, dayOfWeek: 0, dayOfMonth: 1, time: '09:00' }
}

describe('createAutoReportTicker', () => {
  it('命中周报 → onWeeklyFire 一次，月报不触发', () => {
    const weekly = vi.fn()
    const monthly = vi.fn()
    const t = createAutoReportTicker({ getConfig: () => cfg, onWeeklyFire: weekly, onMonthlyFire: monthly })
    t.tick(new Date('2026-08-02T21:00:00'))
    expect(weekly).toHaveBeenCalledTimes(1)
    expect(monthly).not.toHaveBeenCalled()
  })

  it('命中月报 → onMonthlyFire 一次', () => {
    const weekly = vi.fn()
    const monthly = vi.fn()
    const t = createAutoReportTicker({ getConfig: () => cfg, onWeeklyFire: weekly, onMonthlyFire: monthly })
    t.tick(new Date('2026-08-01T09:00:00'))
    expect(monthly).toHaveBeenCalledTimes(1)
    expect(weekly).not.toHaveBeenCalled()
  })

  it('周/月同时命中（15 日恰逢周日且时间相同）→ 两者都触发', () => {
    const weekly = vi.fn()
    const monthly = vi.fn()
    const both: AutoReportConfig = {
      weekly: { enabled: true, dayOfWeek: 0, dayOfMonth: 15, time: '21:00' },
      monthly: { enabled: true, dayOfWeek: 0, dayOfMonth: 15, time: '21:00' }
    }
    const t = createAutoReportTicker({
      getConfig: () => both,
      onWeeklyFire: weekly,
      onMonthlyFire: monthly
    })
    // 2026-11-15 是周日，恰逢 15 日，同一分钟命中两者
    t.tick(new Date('2026-11-15T21:00:00'))
    expect(weekly).toHaveBeenCalledTimes(1)
    expect(monthly).toHaveBeenCalledTimes(1)
  })

  it('同一分钟多次 tick 只触发一次（防重复）', () => {
    const weekly = vi.fn()
    const t = createAutoReportTicker({ getConfig: () => cfg, onWeeklyFire: weekly, onMonthlyFire: vi.fn() })
    t.tick(new Date('2026-08-02T21:00:00'))
    t.tick(new Date('2026-08-02T21:00:30'))
    expect(weekly).toHaveBeenCalledTimes(1)
  })

  it('下一个周期继续可触发', () => {
    const weekly = vi.fn()
    const t = createAutoReportTicker({ getConfig: () => cfg, onWeeklyFire: weekly, onMonthlyFire: vi.fn() })
    t.tick(new Date('2026-08-02T21:00:00'))
    t.tick(new Date('2026-08-09T21:00:00'))
    expect(weekly).toHaveBeenCalledTimes(2)
  })

  it('禁用时同分钟不触发（防唤醒后旧分钟误触）', () => {
    const weekly = vi.fn()
    const disabled = { ...cfg, weekly: { ...cfg.weekly, enabled: false } }
    const t = createAutoReportTicker({ getConfig: () => disabled, onWeeklyFire: weekly, onMonthlyFire: vi.fn() })
    t.tick(new Date('2026-08-02T21:00:00'))
    t.tick(new Date('2026-08-02T21:00:45'))
    expect(weekly).not.toHaveBeenCalled()
  })
})
