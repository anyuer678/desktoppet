export interface PhysicsConfig {
  enabled: boolean
  /** 每帧速度保留系数（0.5~0.995） */
  friction: number
  /** 撞到工作区边缘后的速度保留系数（0~0.9） */
  restitution: number
  /** 初速度上限（px/s） */
  maxSpeed: number
}

export const DEFAULT_PHYSICS_CONFIG: PhysicsConfig = {
  enabled: false,
  friction: 0.9,
  restitution: 0.35,
  maxSpeed: 2200
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

export function normalizePhysicsConfig(raw: unknown): PhysicsConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_PHYSICS_CONFIG }
  const v = raw as Partial<Record<keyof PhysicsConfig, unknown>>
  return {
    enabled: typeof v.enabled === 'boolean' ? v.enabled : DEFAULT_PHYSICS_CONFIG.enabled,
    friction: clamp(v.friction, 0.5, 0.995, DEFAULT_PHYSICS_CONFIG.friction),
    restitution: clamp(v.restitution, 0, 0.9, DEFAULT_PHYSICS_CONFIG.restitution),
    maxSpeed: clamp(v.maxSpeed, 200, 5000, DEFAULT_PHYSICS_CONFIG.maxSpeed)
  }
}

export interface FlingState {
  x: number
  y: number
  vx: number
  vy: number
}

export interface PhysicsArea {
  x: number
  y: number
  width: number
  height: number
}

export interface FlingStep {
  state: FlingState
  active: boolean
}

const STOP_SPEED = 20

/** 单步物理积分：摩擦衰减 + 工作区边缘回弹；返回下一状态与是否继续 */
export function stepFling(
  state: FlingState,
  size: number,
  area: PhysicsArea,
  config: PhysicsConfig,
  dtSeconds: number
): FlingStep {
  const dt = Math.min(0.05, Math.max(0, Number.isFinite(dtSeconds) ? dtSeconds : 0))
  if (dt === 0) return { state, active: false }
  const decay = Math.pow(config.friction, dt * 60)
  let vx = state.vx * decay
  let vy = state.vy * decay
  let x = state.x + vx * dt
  let y = state.y + vy * dt
  const maxX = area.x + Math.max(0, area.width - size)
  const maxY = area.y + Math.max(0, area.height - size)

  if (x < area.x) {
    x = area.x
    vx = Math.abs(vx) * config.restitution
  } else if (x > maxX) {
    x = maxX
    vx = -Math.abs(vx) * config.restitution
  }
  if (y < area.y) {
    y = area.y
    vy = Math.abs(vy) * config.restitution
  } else if (y > maxY) {
    y = maxY
    vy = -Math.abs(vy) * config.restitution
  }

  return {
    state: { x, y, vx, vy },
    active: Math.hypot(vx, vy) > STOP_SPEED
  }
}
