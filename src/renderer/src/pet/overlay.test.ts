import { describe, expect, it } from 'vitest'
import {
  activeOverlays,
  combineOverlays,
  DEFAULT_OVERLAY_FACTORS,
  isTimeInRange
} from './overlay'

describe('isTimeInRange', () => {
  it('日间区间', () => {
    expect(isTimeInRange(10, 8, 18)).toBe(true)
    expect(isTimeInRange(8, 8, 18)).toBe(true)
    expect(isTimeInRange(18, 8, 18)).toBe(false)
    expect(isTimeInRange(7, 8, 18)).toBe(false)
  })

  it('跨天区间（22:00-06:00）', () => {
    expect(isTimeInRange(23, 22, 6)).toBe(true)
    expect(isTimeInRange(1, 22, 6)).toBe(true)
    expect(isTimeInRange(6, 22, 6)).toBe(false)
    expect(isTimeInRange(12, 22, 6)).toBe(false)
  })

  it('start === end 永不命中', () => {
    expect(isTimeInRange(10, 10, 10)).toBe(false)
  })

  it('非法输入返回 false', () => {
    expect(isTimeInRange(Number.NaN, 8, 18)).toBe(false)
    expect(isTimeInRange(10, Number.NaN, 18)).toBe(false)
  })
})

describe('activeOverlays', () => {
  const night = {
    condition: { time: { start: 22, end: 6 } },
    apply: { opacity: 0.65 }
  }
  const always = { apply: { opacity: 0.9 } }

  it('时间条件命中时激活', () => {
    expect(activeOverlays({ night }, new Date(2026, 7, 4, 23, 0, 0))).toHaveLength(1)
  })

  it('时间条件未命中时不激活', () => {
    expect(activeOverlays({ night }, new Date(2026, 7, 4, 12, 0, 0))).toHaveLength(0)
  })

  it('无条件叠加层始终激活', () => {
    expect(activeOverlays({ always }, new Date(2026, 7, 4, 12, 0, 0))).toHaveLength(1)
  })

  it('无 overlays 返回空', () => {
    expect(activeOverlays(undefined, new Date())).toHaveLength(0)
  })
})

describe('combineOverlays', () => {
  it('无叠加层返回默认因子', () => {
    expect(combineOverlays([])).toEqual(DEFAULT_OVERLAY_FACTORS)
  })

  it('单层应用因子', () => {
    expect(
      combineOverlays([
        { apply: { opacity: 0.65, template: { breatheScale: 0.6, floatY: 0.4, speed: 0.9 } } }
      ])
    ).toEqual({ opacity: 0.65, breatheScale: 0.6, floatY: 0.4, speed: 0.9 })
  })

  it('多层因子相乘', () => {
    expect(
      combineOverlays([
        { apply: { opacity: 0.5 } },
        { apply: { opacity: 0.8, template: { speed: 1.5 } } }
      ])
    ).toEqual({ opacity: 0.4, breatheScale: 1, floatY: 1, speed: 1.5 })
  })
})
