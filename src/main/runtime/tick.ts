import { diffEventTypes } from '../event/eventCenter'
import type { EventRuntime } from '../event/eventRuntime'
import type { PassiveRuntime } from '../event/passiveRuntime'
import type { StatsRuntime } from '../stats/statsRuntime'
import { addStateTime, countEvent } from '../stats/dailyStats'

export interface TickDeps {
  stats: Pick<StatsRuntime, 'ensureDate' | 'today' | 'record'>
  events: Pick<EventRuntime, 'active' | 'currentState' | 'syncStateAndNotify'>
  passive: Pick<PassiveRuntime, 'tick'>
  notifyPet(channel: string, payload?: unknown): void
}

export interface TickLoop {
  /** 立即执行一轮 tick（不启动循环） */
  runOnce(): void
  /** 启动：lastTickAt 置为当前 → 立即执行一轮 → 4s 定时循环 */
  start(): void
}

/**
 * 主循环（4s）：跨日/切角色检查 → 状态时长累计 → 被动源 tick →
 * 新增事件类型播报（pet:speech）→ 状态转换广播（pet:state）。
 * lastTickAt/lastEventTypes 为闭包私有状态。
 * 行为保持：与原实现一致，setInterval 不挂 stop 句柄（进程退出即回收）。
 */
export function createTickLoop(deps: TickDeps): TickLoop {
  let lastTickAt = 0
  let lastEventTypes = new Set<string>()

  function tick(): void {
    const now = Date.now()
    deps.stats.ensureDate(now)
    // 陪伴统计：按实际间隔累加当前状态时长（秒），并记录到小时分段
    if (deps.stats.today() && lastTickAt > 0) {
      deps.stats.record((s) => addStateTime(s, deps.events.currentState(), (now - lastTickAt) / 1000, now))
    }
    lastTickAt = now
    deps.passive.tick(now)
    const diff = diffEventTypes(lastEventTypes, deps.events.active(now))
    for (const t of diff.added) {
      deps.notifyPet('pet:speech', t)
      deps.stats.record((s) => countEvent(s, t))
    }
    lastEventTypes = diff.current
    deps.events.syncStateAndNotify(now)
  }

  return {
    runOnce: tick,
    start: () => {
      lastTickAt = Date.now()
      tick()
      setInterval(tick, 4000)
    }
  }
}
