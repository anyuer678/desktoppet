import type { OverlayConfig } from '../../../shared/ipc'

export interface OverlayFactors {
  opacity: number
  breatheScale: number
  floatY: number
  speed: number
}

export const DEFAULT_OVERLAY_FACTORS: OverlayFactors = {
  opacity: 1,
  breatheScale: 1,
  floatY: 1,
  speed: 1
}

/** 小时落在 [start, end) 区间；start > end 视为跨天；start === end 永不命中 */
export function isTimeInRange(hour: number, start: number, end: number): boolean {
  if (!Number.isFinite(hour) || !Number.isFinite(start) || !Number.isFinite(end)) return false
  const h = ((hour % 24) + 24) % 24
  if (start === end) return false
  if (start < end) return h >= start && h < end
  return h >= start || h < end
}

/** 当前命中的叠加层：无条件 → 始终生效；有时间条件 → 按小时判定 */
export function activeOverlays(
  overlays: Record<string, OverlayConfig> | undefined,
  now: Date
): OverlayConfig[] {
  if (!overlays) return []
  const hour = now.getHours()
  return Object.values(overlays).filter((o) => {
    const time = o.condition?.time
    if (!time) return true
    return isTimeInRange(hour, time.start, time.end)
  })
}

/** 多个叠加层因子相乘（默认 1）；opacity 钳制到 [0.1, 1] 防止损坏配置越界 */
export function combineOverlays(overlays: OverlayConfig[]): OverlayFactors {
  const out: OverlayFactors = { ...DEFAULT_OVERLAY_FACTORS }
  for (const o of overlays) {
    const a = o.apply
    if (typeof a.opacity === 'number') out.opacity = Math.min(1, Math.max(0.1, out.opacity * a.opacity))
    if (a.template) {
      if (typeof a.template.breatheScale === 'number') out.breatheScale *= a.template.breatheScale
      if (typeof a.template.floatY === 'number') out.floatY *= a.template.floatY
      if (typeof a.template.speed === 'number') out.speed *= a.template.speed
    }
  }
  return out
}