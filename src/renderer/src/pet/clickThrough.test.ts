import { describe, expect, it } from 'vitest'
import {
  alphaAt,
  contentRectFrom,
  pointInRect,
  shouldIgnorePointer,
  type AlphaMap
} from './clickThrough'

function opaqueMap(): AlphaMap {
  const data = new Uint8ClampedArray(2 * 2 * 4)
  for (let i = 0; i < 2 * 2; i++) data[i * 4 + 3] = 255
  return { width: 2, height: 2, data }
}

function transparentMap(): AlphaMap {
  const data = new Uint8ClampedArray(2 * 2 * 4)
  for (let i = 0; i < 2 * 2; i++) data[i * 4 + 3] = 0
  return { width: 2, height: 2, data }
}

describe('contentRectFrom', () => {
  it('方形图填满方形区域', () => {
    expect(contentRectFrom(100, 100, 200, 200)).toEqual({ x: 0, y: 0, width: 200, height: 200 })
  })

  it('宽图水平撑满、上下留黑边', () => {
    expect(contentRectFrom(200, 100, 100, 100)).toEqual({ x: 0, y: 25, width: 100, height: 50 })
  })

  it('非法尺寸返回零矩形', () => {
    expect(contentRectFrom(0, 100, 100, 100)).toEqual({ x: 0, y: 0, width: 0, height: 0 })
    expect(contentRectFrom(100, 100, 0, 0)).toEqual({ x: 0, y: 0, width: 0, height: 0 })
  })
})

describe('alphaAt', () => {
  it('读到像素 alpha 值并夹取边界', () => {
    const map = opaqueMap()
    expect(alphaAt(map, 0, 0)).toBe(255)
    expect(alphaAt(map, -5, -5)).toBe(255)
    expect(alphaAt(map, 99, 99)).toBe(255)
  })

  it('空图返回 0', () => {
    expect(alphaAt({ width: 0, height: 0, data: new Uint8ClampedArray() }, 0, 0)).toBe(0)
  })
})

describe('pointInRect', () => {
  it('边界包含判定', () => {
    const rect = { x: 10, y: 20, width: 100, height: 50 }
    expect(pointInRect(rect, 10, 20)).toBe(true)
    expect(pointInRect(rect, 110, 70)).toBe(true)
    expect(pointInRect(rect, 9, 20)).toBe(false)
    expect(pointInRect(rect, 10, 71)).toBe(false)
  })
})

describe('shouldIgnorePointer', () => {
  const base = {
    content: { x: 0, y: 0, width: 100, height: 100 },
    panels: [],
    threshold: 16
  }

  it('不透明区域可交互', () => {
    expect(shouldIgnorePointer({ ...base, map: opaqueMap(), x: 25, y: 25 })).toBe(false)
  })

  it('透明区域穿透', () => {
    expect(shouldIgnorePointer({ ...base, map: transparentMap(), x: 25, y: 25 })).toBe(true)
  })

  it('内容矩形外一律穿透', () => {
    expect(shouldIgnorePointer({ ...base, map: opaqueMap(), x: 150, y: 150 })).toBe(true)
  })

  it('面板区域永远可交互', () => {
    const panels = [{ x: 80, y: 0, width: 20, height: 20 }]
    expect(shouldIgnorePointer({ ...base, panels, map: transparentMap(), x: 90, y: 10 })).toBe(false)
  })

  it('无内容时保持可交互（安全默认）', () => {
    expect(
      shouldIgnorePointer({
        ...base,
        content: { x: 0, y: 0, width: 0, height: 0 },
        map: transparentMap(),
        x: 25,
        y: 25
      })
    ).toBe(false)
  })
})
