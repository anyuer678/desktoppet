import { describe, expect, it } from 'vitest'
import { CENTER_TABS, isCenterTab } from './ipc'

describe('控制中心页签白名单', () => {
  it('包含控制中心全部页签', () => {
    expect([...CENTER_TABS]).toEqual([
      'home',
      'characters',
      'market',
      'speech',
      'schedule',
      'stats',
      'push',
      'events',
      'dev',
      'settings'
    ])
  })

  it('只接受白名单内的字符串', () => {
    expect(isCenterTab('settings')).toBe(true)
    expect(isCenterTab('push')).toBe(true)
    expect(isCenterTab('unknown')).toBe(false)
    expect(isCenterTab('../settings')).toBe(false)
    expect(isCenterTab(42)).toBe(false)
    expect(isCenterTab(undefined)).toBe(false)
  })
})
