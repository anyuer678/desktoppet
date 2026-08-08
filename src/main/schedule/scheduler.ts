import type { ScheduleFired, ScheduleInput, ScheduleItem } from '../../shared/ipc'
import { applyUpdate, buildSchedule, isValidScheduleItem, loadSchedules, saveSchedules, validateScheduleInput } from './store'

/**
 * 判断日程在给定时刻是否应该触发（精确到分钟，秒级忽略）。
 * - once：trigger 解析为本地时间，与 now 日期+时分匹配
 * - daily：trigger 为 HH:mm，与 now 时分匹配
 * - weekly：trigger 为 HH:mm，与 now 时分匹配且 daysOfWeek 含 now 的星期
 * 已通过 lastFiredAt 防止同一分钟内重复触发（>= 60s 间隔）
 */
export function shouldFire(item: ScheduleItem, now: Date): boolean {
  if (!item.enabled) return false
  const minuteMs = 60_000
  // lastFiredAt 在同一分钟内（< 60s）则不重复触发
  if (item.lastFiredAt !== null && now.getTime() - item.lastFiredAt < minuteMs) return false

  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const ymd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  if (item.type === 'once') {
    // 解析 YYYY-MM-DDTHH:mm[:ss]
    const m = item.trigger.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/)
    if (!m) return false
    return m[1] === ymd && m[2] === `${hh}:${mm}`
  }
  if (item.type === 'daily') {
    return item.trigger === `${hh}:${mm}`
  }
  // weekly
  if (item.type === 'weekly') {
    if (!item.daysOfWeek.includes(now.getDay())) return false
    return item.trigger === `${hh}:${mm}`
  }
  return false
}

/** 解析 once 类型的 trigger 为 Date（本地时区）；非法返回 null */
export function parseOnceTrigger(trigger: string): Date | null {
  const m = trigger.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (!m) return null
  const d = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    m[6] ? Number(m[6]) : 0
  )
  return isNaN(d.getTime()) ? null : d
}

/** 调度器：每秒扫描全部日程，命中则回调 fired 并更新 lastFiredAt；返回 stop() */
export interface Scheduler {
  /** 立即扫描一次（用于测试） */
  tick(now?: Date): ScheduleFired[]
  /** 启动定时器；返回停止函数 */
  start(): void
  /** 停止定时器 */
  stop(): void
}

export interface SchedulerOptions {
  /** 扫描间隔（ms，默认 1000） */
  intervalMs?: number
  /** 注入的时钟（测试用） */
  now?: () => Date
  /** 触发回调 */
  onFired: (fired: ScheduleFired) => void
  /** 持久化回调（触发后回写文件，参数为更新后的列表） */
  onPersist?: (items: ScheduleItem[]) => void
}

export function createScheduler(
  getItems: () => ScheduleItem[],
  setItems: (items: ScheduleItem[]) => void,
  options: SchedulerOptions
): Scheduler {
  const intervalMs = options.intervalMs ?? 1000
  const nowFn = options.now ?? (() => new Date())
  let timer: NodeJS.Timeout | null = null

  const tick = (now: Date = nowFn()): ScheduleFired[] => {
    const items = getItems()
    if (items.length === 0) return []
    const fired: ScheduleFired[] = []
    const firedAt = now.getTime()
    let changed = false
    const next = items.map((item) => {
      if (!shouldFire(item, now)) return item
      fired.push({
        id: item.id,
        title: item.title,
        message: item.message,
        firedAt
      })
      changed = true
      // once 类型触发后自动禁用
      return { ...item, lastFiredAt: firedAt, enabled: item.type === 'once' ? false : item.enabled }
    })
    if (changed) {
      setItems(next)
      options.onPersist?.(next)
      for (const f of fired) options.onFired(f)
    }
    return fired
  }

  return {
    tick,
    start: () => {
      if (timer) return
      timer = setInterval(() => tick(), intervalMs)
    },
    stop: () => {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    }
  }
}

/** 仓库门面：在主进程 index.ts 中使用，提供 CRUD + 调度启动 */
export class ScheduleRepository {
  private items: ScheduleItem[]
  private scheduler: Scheduler | null = null

  constructor(
    private readonly filePath: string,
    private readonly onFired: (fired: ScheduleFired) => void
  ) {
    this.items = loadSchedules(filePath)
  }

  list(): ScheduleItem[] {
    return this.items.slice()
  }

  create(input: ScheduleInput): { ok: boolean; error?: string; item?: ScheduleItem } {
    const error = validateScheduleInput(input)
    if (error) return { ok: false, error }
    const item = buildSchedule(input)
    this.items = [...this.items, item]
    this.persist()
    return { ok: true, item }
  }

  update(id: string, input: ScheduleInput): { ok: boolean; error?: string; item?: ScheduleItem } {
    const error = validateScheduleInput(input)
    if (error) return { ok: false, error }
    const idx = this.items.findIndex((it) => it.id === id)
    if (idx < 0) return { ok: false, error: '日程不存在' }
    const updated = applyUpdate(this.items[idx], input)
    this.items = this.items.map((it, i) => (i === idx ? updated : it))
    this.persist()
    return { ok: true, item: updated }
  }

  remove(id: string): { ok: boolean; error?: string } {
    const before = this.items.length
    this.items = this.items.filter((it) => it.id !== id)
    if (this.items.length === before) return { ok: false, error: '日程不存在' }
    this.persist()
    return { ok: true }
  }

  setEnabled(id: string, enabled: boolean): { ok: boolean; error?: string } {
    let found = false
    this.items = this.items.map((it) => {
      if (it.id !== id) return it
      found = true
      return { ...it, enabled }
    })
    if (!found) return { ok: false, error: '日程不存在' }
    this.persist()
    return { ok: true }
  }

  /** 启动调度器；返回停止函数 */
  startScheduler(intervalMs: number = 1000): () => void {
    if (this.scheduler) return () => this.scheduler?.stop()
    this.scheduler = createScheduler(
      () => this.items,
      (items) => {
        this.items = items
      },
      {
        intervalMs,
        onFired: this.onFired,
        onPersist: (items) => saveSchedules(this.filePath, items)
      }
    )
    this.scheduler.start()
    return () => this.scheduler?.stop()
  }

  /** 重载文件（外部修改后用） */
  reload(): void {
    this.items = loadSchedules(this.filePath)
  }

  /** 仅用于测试：暴露内部 items 引用（只读） */
  _peek(): ScheduleItem[] {
    return this.items
  }

  private persist(): void {
    // 过滤掉运行时校验失败的项（防御损坏数据）
    const valid = this.items.filter(isValidScheduleItem)
    this.items = valid
    saveSchedules(this.filePath, valid)
  }
}
