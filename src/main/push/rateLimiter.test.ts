import { describe, expect, it } from 'vitest'
import { createRateLimiter } from './rateLimiter'

describe('createRateLimiter', () => {
  it('窗口内允许 limit 次，超出拒绝', () => {
    const rl = createRateLimiter(2, 1000, () => 0)
    expect(rl.allow()).toBe(true)
    expect(rl.allow()).toBe(true)
    expect(rl.allow()).toBe(false)
  })

  it('窗口滑动后恢复配额', () => {
    let now = 0
    const rl = createRateLimiter(2, 1000, () => now)
    expect(rl.allow()).toBe(true)
    expect(rl.allow()).toBe(true)
    expect(rl.allow()).toBe(false)
    now = 1000
    expect(rl.allow()).toBe(true)
    expect(rl.allow()).toBe(true)
    expect(rl.allow()).toBe(false)
  })

  it('显式传入时间优先于时钟', () => {
    const rl = createRateLimiter(1, 100)
    expect(rl.allow(0)).toBe(true)
    expect(rl.allow(50)).toBe(false)
    expect(rl.allow(100)).toBe(true)
  })

  it('非法 limit/window 至少为 1', () => {
    const rl = createRateLimiter(0, 0, () => 0)
    expect(rl.allow()).toBe(true)
    expect(rl.allow()).toBe(false)
  })
})
