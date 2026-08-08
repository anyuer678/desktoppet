import type { AnimationStateConfig, CharacterDetail } from '../../../shared/ipc'

export interface ResolvedAnimation {
  key: string
  config: AnimationStateConfig
}

/**
 * 按《角色包规范》§4 回退链解析请求状态：
 * 请求状态 → default 状态 → 第一个合法状态 → 静态。
 * 返回 null 表示仅能用静态主图。
 */
export function resolveAnimationState(
  detail: CharacterDetail | null,
  requested: string
): ResolvedAnimation | null {
  if (!detail) return null
  const states = detail.animation ?? {}
  const candidates = [requested, detail.defaultState]
  for (const key of candidates) {
    if (!key) continue
    const config = states[key]
    if (config) return { key, config }
  }
  const firstKey = Object.keys(states)[0]
  if (firstKey && states[firstKey]) return { key: firstKey, config: states[firstKey] }
  return null
}

/** 序列帧文件名序号补零：0 → 000.png */
export function sequenceFrameName(key: string, config: AnimationStateConfig, index: number): string {
  const base = config.path ?? `animations/${key}`
  return `${base}/${String(index).padStart(3, '0')}.png`
}

export function clampFps(fps: number | undefined, fallback = 8): number {
  if (fps === undefined || !Number.isFinite(fps)) return fallback
  return Math.min(60, Math.max(1, Math.round(fps)))
}