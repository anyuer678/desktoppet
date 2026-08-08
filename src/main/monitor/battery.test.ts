import { describe, expect, it, vi } from 'vitest'
import { createBatterySampler, isBatteryLow } from './battery'

describe('isBatteryLow', () => {
  it('无电池样本 → false', () => {
    expect(isBatteryLow(null, 20)).toBe(false)
  })

  it('未充电且电量 <= 阈值 → true', () => {
    expect(isBatteryLow({ percent: 20, charging: false }, 20)).toBe(true)
    expect(isBatteryLow({ percent: 5, charging: false }, 20)).toBe(true)
  })

  it('充电中 → false，即使电量低', () => {
    expect(isBatteryLow({ percent: 5, charging: true }, 20)).toBe(false)
  })

  it('电量高于阈值 → false', () => {
    expect(isBatteryLow({ percent: 35, charging: false }, 20)).toBe(false)
  })
})

describe('createBatterySampler', () => {
  it('start 后缓存最新样本并按间隔轮询更新', async () => {
    vi.useFakeTimers()
    try {
      let calls = 0
      const read = vi.fn(async () => ({ percent: 100 - calls++ * 10, charging: false }))
      const sampler = createBatterySampler(read, 1000)
      expect(sampler.get()).toBeNull()
      sampler.start()
      await vi.advanceTimersByTimeAsync(0)
      expect(sampler.get()).toEqual({ percent: 100, charging: false })
      await vi.advanceTimersByTimeAsync(1000)
      expect(sampler.get()).toEqual({ percent: 90, charging: false })
      sampler.stop()
    } finally {
      vi.useRealTimers()
    }
  })

  it('读取失败时缓存为 null，不含抛出', async () => {
    vi.useFakeTimers()
    try {
      const read = vi.fn(async () => {
        throw new Error('boom')
      })
      const sampler = createBatterySampler(read, 1000)
      sampler.start()
      await vi.advanceTimersByTimeAsync(0)
      expect(sampler.get()).toBeNull()
      sampler.stop()
    } finally {
      vi.useRealTimers()
    }
  })

  it('stop 后不再轮询', async () => {
    vi.useFakeTimers()
    try {
      const read = vi.fn(async () => ({ percent: 90, charging: true }))
      const sampler = createBatterySampler(read, 1000)
      sampler.start()
      await vi.advanceTimersByTimeAsync(0)
      const before = read.mock.calls.length
      sampler.stop()
      await vi.advanceTimersByTimeAsync(5000)
      expect(read.mock.calls.length).toBe(before)
    } finally {
      vi.useRealTimers()
    }
  })
})