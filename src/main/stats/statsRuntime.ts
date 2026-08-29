import { join } from 'path'
import type { DailyStats } from '../../shared/ipc'
import { statsRootPath } from '../app/paths'
import type { LogFn } from '../logging/logger'
import {
  clearStatsDir,
  deleteDailyStatsFile,
  emptyStats,
  loadDailyStats,
  migrateStatsLayout,
  sanitizeRoleId,
  saveDailyStats,
  todayStr
} from './dailyStats'

/**
 * 落盘节流：日志变化后最多 STATS_SAVE_INTERVAL_MS（2s）内落盘；避免「防抖时长 ≥ tick 间隔」导致定时器被持续重置而永不保存。
 * 注意：此值必须小于 tick 间隔（4000ms），且配合「已有定时器则跳过」保证高频 tick 下定期收账。
 */
const STATS_SAVE_INTERVAL_MS = 2000

export interface StatsRuntimeDeps {
  /** 当前活跃角色 id（getter：settings.activeCharacterId 是唯一真相源，禁止启动时快照） */
  getActiveCharacterId(): string
  log: LogFn
}

export interface StatsRuntime {
  /** 启动初始化：定位统计根目录 → 迁移布局 → 载入今日 */
  init(): void
  /** 统计记一笔（状态时长/事件/互动），并防抖落盘 */
  record(mutate: (stats: DailyStats) => DailyStats): void
  /** 跨日/切角色检查：落盘旧 → 切目录 → 载入新（tick 每轮调用） */
  ensureDate(now: number): void
  /** 角色切换（settings.activeCharacterId 已更新后调用）：旧角色今日落盘 → 迁移 → 切目录 → 载入新角色今日 */
  switchRole(): void
  /** 同步落盘今日（stats:report 聚合前 / 退出兜底） */
  flush(): void
  /** 当前角色统计目录（每次现读：随角色切换变化） */
  dir(): string
  /** 当前角色 id（sanitize 后） */
  roleId(): string
  /** 今日统计日期串 */
  date(): string
  /** 今日内存统计（未初始化时为 null） */
  today(): DailyStats | null
  /** 删除单日文件；若是今日则同步重置内存 */
  deleteDay(date: string): void
  /** 清空统计目录并重置内存，返回删除文件数 */
  clearAll(): number
  /** 退出清理：清除防抖定时器并同步落盘（will-quit 中必须最后执行） */
  dispose(): void
}

/**
 * 陪伴统计运行时：统计根目录/角色目录/今日统计/防抖定时器均为闭包私有状态。
 * 角色目录随 settings.activeCharacterId 变化，dir()/roleId() 每次现读，杜绝目录快照。
 */
export function createStatsRuntime(deps: StatsRuntimeDeps): StatsRuntime {
  let statsRoot = ''
  let activeStatsRoleId = 'rabbit'
  let statsDir = ''
  let statsDate = ''
  let dailyStats: DailyStats | null = null
  let statsSaveTimer: NodeJS.Timeout | null = null
  let lastStatsSaveAt = 0

  /** 当前角色统计目录（stats/<角色id>，缩写角色 id 已 sanitize） */
  const roleStatsDir = (): string => join(statsRoot, activeStatsRoleId)

  /**
   * 节流落盘：已有定时器则跳过（合并高频 tick）；否则调度在「距上次保存 ≥ 2s」时执行。
   * 保证任何情况下最长 2s 内落盘一次，退出/切角色路径仍走同步 saveDailyStats。
   */
  function debouncedSave(): void {
    if (statsSaveTimer) return
    const wait = Math.max(0, STATS_SAVE_INTERVAL_MS - (Date.now() - lastStatsSaveAt))
    statsSaveTimer = setTimeout(() => {
      statsSaveTimer = null
      lastStatsSaveAt = Date.now()
      if (dailyStats) saveDailyStats(statsDir, dailyStats)
    }, wait)
  }

  function record(mutate: (stats: DailyStats) => DailyStats): void {
    if (!dailyStats) return
    dailyStats = mutate(dailyStats)
    debouncedSave()
  }

  function switchRole(): void {
    if (dailyStats) saveDailyStats(statsDir, dailyStats)
    activeStatsRoleId = sanitizeRoleId(deps.getActiveCharacterId() || 'rabbit')
    migrateStatsLayout(statsRoot, activeStatsRoleId)
    statsDir = roleStatsDir()
    const today = todayStr()
    if (today !== statsDate) statsDate = today
    dailyStats = loadDailyStats(statsDir, statsDate)
  }

  function ensureDate(now: number): void {
    const today = todayStr(new Date(now))
    const role = sanitizeRoleId(deps.getActiveCharacterId() || 'rabbit')
    const switched = role !== activeStatsRoleId
    if (switched) {
      if (dailyStats) saveDailyStats(statsDir, dailyStats)
      activeStatsRoleId = role
      statsDir = roleStatsDir()
      statsDate = today
      dailyStats = loadDailyStats(statsDir, today)
      return
    }
    if (today === statsDate) return
    if (dailyStats) saveDailyStats(statsDir, dailyStats)
    statsDate = today
    dailyStats = loadDailyStats(statsDir, today)
  }

  function init(): void {
    statsRoot = statsRootPath()
    activeStatsRoleId = sanitizeRoleId(deps.getActiveCharacterId() || 'rabbit')
    migrateStatsLayout(statsRoot, activeStatsRoleId)
    statsDir = roleStatsDir()
    statsDate = todayStr()
    dailyStats = loadDailyStats(statsDir, statsDate)
    deps.log('info', '[stats] dir=', statsRoot, 'role=', activeStatsRoleId)
  }

  function flush(): void {
    if (dailyStats) saveDailyStats(statsDir, dailyStats)
  }

  function deleteDay(date: string): void {
    deleteDailyStatsFile(statsDir, date)
    if (date === statsDate && dailyStats) {
      dailyStats = emptyStats(date)
    }
  }

  function clearAll(): number {
    const deleted = clearStatsDir(statsDir)
    if (dailyStats) dailyStats = emptyStats(statsDate)
    return deleted
  }

  function dispose(): void {
    if (statsSaveTimer) clearTimeout(statsSaveTimer)
    if (dailyStats) saveDailyStats(statsDir, dailyStats)
  }

  return {
    init,
    record,
    ensureDate,
    switchRole,
    flush,
    dir: () => statsDir,
    roleId: () => activeStatsRoleId,
    date: () => statsDate,
    today: () => dailyStats,
    deleteDay,
    clearAll,
    dispose
  }
}
