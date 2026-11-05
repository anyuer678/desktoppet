import { describe, expect, it } from 'vitest'
import { isTriggerValid, triggerForType } from './scheduleForm'

const now = new Date(2026, 10, 5, 22, 0, 0)

describe('triggerForType', () => {
  it('单次 → 每日：ISO 只保留 HH:mm', () => {
    expect(triggerForType('2026-11-06T14:30', 'daily', now)).toBe('14:30')
  })

  it('每日 → 每周：保持 HH:mm', () => {
    expect(triggerForType('09:15', 'weekly', now)).toBe('09:15')
  })

  it('每日 → 单次：生成明天的同一时刻', () => {
    expect(triggerForType('08:05', 'once', now)).toBe('2026-11-06T08:05')
  })

  it('已是合法单次时间时保持不变', () => {
    expect(triggerForType('2026-12-01T07:00', 'once', now)).toBe('2026-12-01T07:00')
  })

  it('非法输入回退 09:00（单次则明天 09:00）', () => {
    expect(triggerForType('not-a-time', 'daily', now)).toBe('09:00')
    expect(triggerForType('not-a-time', 'once', now)).toBe('2026-11-06T09:00')
  })

  it('月末切换单次：日历进到下个月 1 日', () => {
    expect(triggerForType('10:00', 'once', new Date(2026, 10, 30, 12, 0))).toBe('2026-12-01T10:00')
  })
})

describe('isTriggerValid', () => {
  it('按类型校验', () => {
    expect(isTriggerValid('2026-11-06T09:00', 'once')).toBe(true)
    expect(isTriggerValid('09:00', 'once')).toBe(false)
    expect(isTriggerValid('09:00', 'daily')).toBe(true)
    expect(isTriggerValid('24:00', 'daily')).toBe(false)
    expect(isTriggerValid('09:00', 'weekly')).toBe(true)
  })
})
