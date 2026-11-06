import { describe, expect, it } from 'vitest'
import { DEFAULT_PHYSICS_CONFIG, normalizePhysicsConfig, stepFling } from './physics'

const area = { x: 0, y: 0, width: 1000, height: 800 }

describe('normalizePhysicsConfig', () => {
  it('缺省/非法字段回退并夹取', () => {
    expect(normalizePhysicsConfig(null)).toEqual(DEFAULT_PHYSICS_CONFIG)
    expect(normalizePhysicsConfig({ enabled: true, friction: 5, restitution: -1, maxSpeed: 1 })).toEqual({
      enabled: true,
      friction: 0.995,
      restitution: 0,
      maxSpeed: 200
    })
  })
})

describe('stepFling', () => {
  it('无阻尼时按速度移动', () => {
    const r = stepFling(
      { x: 100, y: 100, vx: 100, vy: 0 },
      200,
      area,
      { ...DEFAULT_PHYSICS_CONFIG, enabled: true, friction: 1 },
      0.016
    )
    expect(r.state.x).toBeCloseTo(101.6)
    expect(r.state.y).toBe(100)
    expect(r.active).toBe(true)
  })

  it('摩擦逐渐降低速度直至停止', () => {
    let state = { x: 100, y: 100, vx: 1000, vy: 0 }
    const cfg = { ...DEFAULT_PHYSICS_CONFIG, enabled: true, friction: 0.9 }
    let active = true
    for (let i = 0; i < 300 && active; i++) {
      const r = stepFling(state, 200, area, cfg, 0.016)
      state = r.state
      active = r.active
    }
    expect(active).toBe(false)
    expect(Math.abs(state.vx)).toBeLessThanOrEqual(20)
  })

  it('撞左/右边缘按 restitution 反弹并限制在窗口内', () => {
    const left = stepFling(
      { x: 1, y: 100, vx: -500, vy: 0 },
      200,
      area,
      { ...DEFAULT_PHYSICS_CONFIG, enabled: true, friction: 1, restitution: 0.5 },
      0.016
    )
    expect(left.state.x).toBe(0)
    expect(left.state.vx).toBeGreaterThan(0)

    const right = stepFling(
      { x: 799, y: 100, vx: 500, vy: 0 },
      200,
      area,
      { ...DEFAULT_PHYSICS_CONFIG, enabled: true, friction: 1, restitution: 0.5 },
      0.016
    )
    expect(right.state.x).toBe(800)
    expect(right.state.vx).toBeLessThan(0)
  })

  it('dt 为 0/NaN 时不移动', () => {
    const s = { x: 10, y: 10, vx: 100, vy: 100 }
    expect(stepFling(s, 200, area, DEFAULT_PHYSICS_CONFIG, 0).state).toEqual(s)
    expect(stepFling(s, 200, area, DEFAULT_PHYSICS_CONFIG, Number.NaN).active).toBe(false)
  })
})
