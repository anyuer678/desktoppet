import { describe, expect, it } from 'vitest'
import { ensurePositionVisible, rectsOverlap } from './placement'

const PRIMARY = { x: 0, y: 0, width: 1920, height: 1040 }
const SECONDARY = { x: 1920, y: 0, width: 1280, height: 720 }

describe('rectsOverlap', () => {
  it('相交返回 true', () => {
    expect(rectsOverlap({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 5, width: 10, height: 10 })).toBe(
      true
    )
  })

  it('边对边相接不算相交', () => {
    expect(rectsOverlap({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 0, width: 10, height: 10 })).toBe(
      false
    )
  })

  it('完全分离返回 false', () => {
    expect(rectsOverlap({ x: 0, y: 0, width: 10, height: 10 }, { x: 50, y: 50, width: 10, height: 10 })).toBe(
      false
    )
  })
})

describe('ensurePositionVisible', () => {
  it('在主屏内保持原位置（返回 null）', () => {
    expect(ensurePositionVisible({ x: 400, y: 300 }, 256, PRIMARY, [PRIMARY])).toBeNull()
  })

  it('在副屏保持原位置', () => {
    expect(ensurePositionVisible({ x: 2000, y: 100 }, 256, PRIMARY, [PRIMARY, SECONDARY])).toBeNull()
  })

  it('窗口与任一工作区有交集就视为可见', () => {
    expect(ensurePositionVisible({ x: 1910, y: 100 }, 256, PRIMARY, [PRIMARY, SECONDARY])).toBeNull()
    expect(ensurePositionVisible({ x: -50, y: -50 }, 256, PRIMARY, [PRIMARY])).toBeNull()
  })

  it('全部屏幕外时回落到主屏右上角', () => {
    expect(ensurePositionVisible({ x: 99999, y: 99999 }, 256, PRIMARY, [PRIMARY])).toEqual({
      x: 1664,
      y: 0
    })
  })

  it('尺寸大于屏幕宽度时贴住工作区左边缘', () => {
    expect(ensurePositionVisible({ x: 99999, y: 99999 }, 2000, PRIMARY, [PRIMARY])).toEqual({ x: 0, y: 0 })
  })

  it('无屏幕信息时不干预', () => {
    expect(ensurePositionVisible({ x: 99999, y: 99999 }, 256, PRIMARY, [])).toBeNull()
  })
})
