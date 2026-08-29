import type { ScheduleFired } from '../../shared/ipc'
import { schedulesPath } from '../app/paths'
import type { LogFn } from '../logging/logger'
import type { PetEvent } from '../event/eventCenter'
import type { EventRuntime } from '../event/eventRuntime'
import type { StatsRuntime } from '../stats/statsRuntime'
import { countEvent } from '../stats/dailyStats'
import { ScheduleRepository } from './scheduler'

/** 触发中的 alarm 事件：schedule 触发后注入事件中心 6 秒，使桌宠进入 warning 状态 */
const ALARM_EVENT_DURATION_MS = 6000
const ALARM_EVENT_PRIORITY = 80

export interface ScheduleRuntimeDeps {
  events: Pick<EventRuntime, 'apply' | 'syncStateAndNotify'>
  stats: Pick<StatsRuntime, 'record'>
  notifyPet(channel: string, payload?: unknown): void
  notifyCenter(channel: string, payload?: unknown): void
  log: LogFn
}

export interface ScheduleRuntime {
  /** 构造 ScheduleRepository 并启动秒级调度器（whenReady 中调用） */
  start(): void
  /** 停止秒级调度器（will-quit） */
  stop(): void
  /** 仓库（schedule:* IPC 增删改查；未 start 前为 null） */
  repo(): ScheduleRepository | null
  /** 日程触发：注入 alarm 事件 + 计统计 + 广播 + 立即状态转换 */
  fire(fired: ScheduleFired): void
  /** 手动触发测试（schedule:test） */
  testFire(id: string): { ok: boolean; error?: string }
}

/** 日程运行时：仓库与调度器停止句柄为闭包私有状态 */
export function createScheduleRuntime(deps: ScheduleRuntimeDeps): ScheduleRuntime {
  let scheduleRepo: ScheduleRepository | null = null
  let stopScheduler: (() => void) | null = null

  function fire(fired: ScheduleFired): void {
    const now = fired.firedAt
    const alarmEvent: PetEvent = {
      source: `schedule:${fired.id}`,
      type: 'alarm',
      priority: ALARM_EVENT_PRIORITY,
      durationMs: ALARM_EVENT_DURATION_MS,
      occurredAt: now
    }
    deps.events.apply(alarmEvent)
    deps.stats.record((s) => countEvent(s, 'schedule'))
    deps.log('info', '[schedule] fired:', fired.id, fired.title)
    deps.notifyPet('schedule:fired', fired)
    deps.notifyCenter('schedule:fired', fired)
    // 立即触发一次状态更新（不必等下一个 tick）
    deps.events.syncStateAndNotify(now)
  }

  function start(): void {
    scheduleRepo = new ScheduleRepository(schedulesPath(), fire)
    stopScheduler = scheduleRepo.startScheduler(1000)
    deps.log('info', '[schedule] loaded', scheduleRepo.list().length, 'schedules from', schedulesPath())
  }

  function stop(): void {
    stopScheduler?.()
  }

  function testFire(id: string): { ok: boolean; error?: string } {
    if (!scheduleRepo) return { ok: false, error: '调度器未初始化' }
    const item = scheduleRepo.list().find((it) => it.id === id)
    if (!item) return { ok: false, error: '日程不存在' }
    fire({
      id: item.id,
      title: item.title,
      message: item.message,
      firedAt: Date.now()
    })
    return { ok: true }
  }

  return { start, stop, repo: () => scheduleRepo, fire, testFire }
}
