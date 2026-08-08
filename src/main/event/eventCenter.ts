import type { PetState } from '../../shared/eventState'
import { PET_STATES, STATE_CATEGORIES } from '../../shared/eventState'

export { PET_STATES, STATE_CATEGORIES }
export type { PetState }

export interface PetEvent {
  source: string
  type: string
  priority: number
  durationMs: number
  occurredAt: number
}

const RANK: PetState[] = ['warning', 'focus', 'sleep', 'happy', 'idle']

export function addEvent(list: PetEvent[], ev: PetEvent): PetEvent[] {
  const idx = list.findIndex((e) => e.source === ev.source && e.type === ev.type)
  if (idx >= 0) {
    const next = list.slice()
    next[idx] = ev
    return next
  }
  return [...list, ev]
}

/**
 * 惰性裁剪：剔除已过期事件（now >= occurredAt + durationMs）。
 * activeEvents 只做过滤不裁剪，长期运行（尤其 push 源 source 唯一）会让数组无界增长，
 * 因此由调用方在写入前调用本函数回收过期条目。
 */
export function pruneEvents(list: PetEvent[], now: number): PetEvent[] {
  return list.filter((e) => now < e.occurredAt + e.durationMs)
}

export function activeEvents(list: PetEvent[], now: number): PetEvent[] {
  return list.filter((e) => now < e.occurredAt + e.durationMs)
}

export function hasActiveEvent(list: PetEvent[], source: string, type: string, now: number): boolean {
  return activeEvents(list, now).some((e) => e.source === source && e.type === type)
}

/** 对比上一轮活跃事件类型，返回本轮集合与新增类型（跳过日程注入事件，避免与 schedule:fired 气泡重复） */
export function diffEventTypes(prev: ReadonlySet<string>, events: PetEvent[]): { current: Set<string>; added: string[] } {
  const current = new Set<string>()
  for (const e of events) {
    if (e.source.startsWith('schedule:')) continue
    current.add(e.type)
  }
  return { current, added: [...current].filter((t) => !prev.has(t)) }
}

export function computeState(events: PetEvent[]): { state: PetState; reason: string | null } {
  if (events.length === 0) return { state: 'idle', reason: null }
  let bestState: PetState = 'idle'
  let bestP = 0
  let reason: string | null = null
  for (const state of PET_STATES) {
    if (state === 'idle') continue
    const matching = events.filter((e) => STATE_CATEGORIES[state].includes(e.type))
    const maxP = matching.reduce((m, e) => Math.max(m, e.priority), 0)
    const tie = RANK.indexOf(state) < RANK.indexOf(bestState)
    if (maxP > bestP || (maxP === bestP && maxP > 0 && tie)) {
      bestState = state
      bestP = maxP
      reason = matching.find((e) => e.priority === maxP)?.type ?? null
    }
  }
  return { state: bestState, reason }
}