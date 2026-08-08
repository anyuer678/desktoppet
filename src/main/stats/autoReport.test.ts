import { describe, expect, it } from 'vitest'
import type { AutoReportConfig } from '../../shared/ipc'
import {
  hhmmOf,
  isPastTriggerTime,
  shouldCatchUpMonthly,
  shouldCatchUpWeekly,
  shouldFireMonthly,
  shouldFireWeekly
} from './autoReport'

const cfg: AutoReportConfig = {
  weekly: { enabled: true, dayOfWeek: 0, dayOfMonth: 1, time: '21:00' },
  monthly: { enabled: true, dayOfWeek: 0, dayOfMonth: 1, time: '09:00' }
}
const now = (s: string): Date => new Date(s + ':00')

describe('hhmmOf', () => {
  it('返回 HH:mm', () => {
    expect(hhmmOf(new Date(2026, 7, 6, 8, 5, 30))).toBe('08:05')
  })
})

describe('isPastTriggerTime', () => {
  it('同分钟视为已过', () => {
    expect(isPastTriggerTime('21:00', now('2026-08-06T21:00'))).toBe(true)
  })
  it('未到时间 → false', () => {
    expect(isPastTriggerTime('21:00', now('2026-08-06T20:59'))).toBe(false)
  })
  it('已过 → true', () => {
    expect(isPastTriggerTime('21:00', now('2026-08-06T21:01'))).toBe(true)
  })
})

describe('shouldFireWeekly', () => {
  it('命中：星期与时间匹配', () => {
    expect(shouldFireWeekly(cfg, now('2026-08-02T21:00'))).toBe(true) // 2026-08-02 是周日
  })
  it('星期不符 → false', () => {
    expect(shouldFireWeekly(cfg, now('2026-08-03T21:00'))).toBe(false)
  })
  it('时间不符 → false', () => {
    expect(shouldFireWeekly(cfg, now('2026-08-02T21:01'))).toBe(false)
  })
  it('禁用 → false', () => {
    expect(shouldFireWeekly({ ...cfg, weekly: { ...cfg.weekly, enabled: false } }, now('2026-08-02T21:00'))).toBe(
      false
    )
  })
})

describe('shouldFireMonthly', () => {
  it('命中：日与时间匹配', () => {
    expect(shouldFireMonthly(cfg, now('2026-08-01T09:00'))).toBe(true)
  })
  it('日期不符 → false', () => {
    expect(shouldFireMonthly(cfg, now('2026-08-02T09:00'))).toBe(false)
  })
  it('31 号在无 31 日的月份永不触发', () => {
    const c = { ...cfg, monthly: { ...cfg.monthly, dayOfMonth: 31 } }
    expect(shouldFireMonthly(c, now('2026-09-30T09:00'))).toBe(false)
  })
  it('禁用 → false', () => {
    expect(shouldFireMonthly({ ...cfg, monthly: { ...cfg.monthly, enabled: false } }, now('2026-08-01T09:00'))).toBe(
      false
    )
  })
})

describe('shouldCatchUpWeekly', () => {
  it('已过触发点且本周未生成 → true', () => {
    expect(shouldCatchUpWeekly(cfg, now('2026-08-06T21:05'), () => false)).toBe(true)
  })
  it('今日未到触发点 → false', () => {
    expect(shouldCatchUpWeekly(cfg, now('2026-08-06T20:59'), () => false)).toBe(false)
  })
  it('本周已生成 → false', () => {
    expect(shouldCatchUpWeekly(cfg, now('2026-08-06T21:05'), () => true)).toBe(false)
  })
  it('触发点是今天且未到点 → false', () => {
    expect(shouldCatchUpWeekly(cfg, now('2026-08-02T20:59'), () => false)).toBe(false)
  })
})

describe('shouldCatchUpMonthly', () => {
  it('已过触发点且本月未生成 → true', () => {
    expect(shouldCatchUpMonthly(cfg, now('2026-08-15T09:05'), () => false)).toBe(true)
  })
  it('本月已生成 → false', () => {
    expect(shouldCatchUpMonthly(cfg, now('2026-08-15T09:05'), () => true)).toBe(false)
  })
  it('未到触发点 → false', () => {
    expect(shouldCatchUpMonthly(cfg, now('2026-08-01T08:59'), () => false)).toBe(false)
  })
})
