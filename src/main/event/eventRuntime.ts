import {
  activeEvents,
  addEvent,
  computeState,
  pruneEvents,
  type PetEvent,
  type PetState
} from './eventCenter'
import { createEventHistory, recordNewEvents, type EventHistory } from './eventHistory'

export interface EventRuntimeDeps {
  /** 新事件入历史后广播完整历史给控制中心 */
  notifyCenter(channel: string, payload?: unknown): void
  /** 状态变化时广播 pet:state 给桌宠 */
  notifyPet(channel: string, payload?: unknown): void
}

export interface StateTransition {
  state: PetState
  reason: string | null
  changed: boolean
}

export interface EventRuntime {
  /** 注入单个事件：先记历史（新事件才广播）再惰性裁剪过期并追加 */
  apply(ev: PetEvent): void
  /** 按前缀整批替换：移除 source.startsWith(prefix) 的旧事件并追加新事件（被动源轮询语义） */
  replaceBySource(prefix: string, evs: PetEvent[]): void
  /** 事件历史（events:history IPC 读取） */
  history(): EventHistory
  /** 上次广播的状态（tick 累计状态时长时读取） */
  currentState(): PetState
  /** now 时刻的活跃事件 */
  active(now: number): PetEvent[]
  /**
   * 状态转换广播（收敛原 fireSchedule/onPushApiEvent/tick 三处重复逻辑）：
   * computeState → 与上次状态对比 → 变化才广播 pet:state。
   */
  syncStateAndNotify(now: number): StateTransition
}

/**
 * 事件中心运行时：活跃事件数组、事件历史与上次状态均为此闭包私有状态，
 * 外部只能经上述方法读写，避免捕获旧数组引用（原实现 events 为整体重赋值）。
 */
export function createEventRuntime(deps: EventRuntimeDeps): EventRuntime {
  let events: PetEvent[] = []
  const eventHistory = createEventHistory()
  let lastState: PetState = 'idle'
  let lastReason: string | null = null

  function apply(ev: PetEvent): void {
    if (recordNewEvents(events, [ev], eventHistory) > 0) {
      deps.notifyCenter('pet:events:history', { events: eventHistory.list() })
    }
    // 写入前惰性裁剪过期事件，防止长期运行（尤其 push 唯一 source）数组无界增长
    events = addEvent(pruneEvents(events, Date.now()), ev)
  }

  function replaceBySource(prefix: string, evs: PetEvent[]): void {
    if (recordNewEvents(events, evs, eventHistory) > 0) {
      deps.notifyCenter('pet:events:history', { events: eventHistory.list() })
    }
    events = [...pruneEvents(events, Date.now()).filter((e) => !e.source.startsWith(prefix)), ...evs]
  }

  function syncStateAndNotify(now: number): StateTransition {
    const { state, reason } = computeState(activeEvents(events, now))
    const changed = state !== lastState
    lastState = state
    lastReason = reason
    if (changed) {
      deps.notifyPet('pet:state', state)
    }
    return { state, reason, changed }
  }

  return {
    apply,
    replaceBySource,
    history: () => eventHistory,
    currentState: () => lastState,
    active: (now) => activeEvents(events, now),
    syncStateAndNotify
  }
}
