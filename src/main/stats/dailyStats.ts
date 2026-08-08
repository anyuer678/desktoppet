import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { DailyStats, InteractionKind, RangeDay, WeekSummary, YearSummary } from '../../shared/ipc'

export function todayStr(now: Date = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${m}-${d}`
}

function isValidDate(year: number, month: number, day: number): boolean {
  const dt = new Date(year, month - 1, day)
  return dt.getFullYear() === year && dt.getMonth() === month - 1 && dt.getDate() === day
}

/**
 * 起始日期（含）到结束日期（含）之间的全部日期，升序。
 * 非法日期、倒序返回空数组（不抛错）。
 */
export function iterateDates(start: string, end: string): string[] {
  const m1 = /^(\d{4})-(\d{2})-(\d{2})$/.exec(start)
  const m2 = /^(\d{4})-(\d{2})-(\d{2})$/.exec(end)
  if (!m1 || !m2) return []
  if (!isValidDate(Number(m1[1]), Number(m1[2]), Number(m1[3]))) return []
  if (!isValidDate(Number(m2[1]), Number(m2[2]), Number(m2[3]))) return []
  const a = new Date(Number(m1[1]), Number(m1[2]) - 1, Number(m1[3]))
  const b = new Date(Number(m2[1]), Number(m2[2]) - 1, Number(m2[3]))
  if (a.getTime() > b.getTime()) return []
  const out: string[] = []
  const cur = new Date(a)
  while (cur.getTime() <= b.getTime()) {
    out.push(todayStr(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return out
}

/** 读取区间内逐日统计；无记录日 present=false + 空统计（升序，包含首尾） */
export function loadDailyRange(dir: string, start: string, end: string): RangeDay[] {
  return iterateDates(start, end).map((date) => {
    const present = existsSync(dailyStatsPath(dir, date))
    return { date, present, stats: present ? loadDailyStats(dir, date) : emptyStats(date) }
  })
}

function normalizeHours(raw: unknown): number[] {
  const out = new Array(24).fill(0)
  if (!Array.isArray(raw)) return out
  for (let i = 0; i < Math.min(24, raw.length); i++) {
    const v = Number(raw[i])
    if (Number.isFinite(v) && v > 0) out[i] = v
  }
  return out
}

export function emptyStats(date: string): DailyStats {
  return {
    date,
    secondsByState: {},
    hours: new Array(24).fill(0),
    events: {},
    interactions: { click: 0, drag: 0, speak: 0 },
    updatedAt: Date.now()
  }
}

export function addStateTime(
  stats: DailyStats,
  state: string,
  seconds: number,
  now: number = Date.now()
): DailyStats {
  if (!(seconds > 0)) return stats
  const hour = Math.min(23, Math.max(0, new Date(now).getHours()))
  const hours = stats.hours?.length === 24 ? stats.hours : new Array(24).fill(0)
  return {
    ...stats,
    secondsByState: {
      ...stats.secondsByState,
      [state]: (stats.secondsByState[state] ?? 0) + seconds
    },
    hours: hours.map((v, i) => (i === hour ? v + seconds : v)),
    updatedAt: Date.now()
  }
}

export function countEvent(stats: DailyStats, type: string): DailyStats {
  return {
    ...stats,
    events: { ...stats.events, [type]: (stats.events[type] ?? 0) + 1 },
    updatedAt: Date.now()
  }
}

export function countInteraction(stats: DailyStats, kind: InteractionKind): DailyStats {
  return {
    ...stats,
    interactions: {
      ...stats.interactions,
      [kind]: (stats.interactions[kind] ?? 0) + 1
    },
    updatedAt: Date.now()
  }
}

export function totalSeconds(stats: DailyStats): number {
  return Object.values(stats.secondsByState).reduce((a, b) => a + b, 0)
}

export function dailyStatsPath(dir: string, date: string): string {
  // 防御纵深：拒绝路径分隔符 / .. / 盘符 / 保留字符，避免损坏配置导致穿越写入
  if (/[\\/:*?"<>|]/.test(date) || date.includes('..') || /^[A-Za-z]:/.test(date)) {
    return join(dir, '__invalid__')
  }
  return join(dir, `${date}.json`)
}

function normalizeStats(raw: unknown, date: string): DailyStats {
  if (typeof raw !== 'object' || raw === null) return emptyStats(date)
  const r = raw as Partial<DailyStats>
  const interactionsRaw =
    r.interactions && typeof r.interactions === 'object' ? (r.interactions as Record<string, unknown>) : {}
  const secondsByState =
    r.secondsByState && typeof r.secondsByState === 'object'
      ? (r.secondsByState as Record<string, unknown>)
      : {}
  const events = r.events && typeof r.events === 'object' ? (r.events as Record<string, unknown>) : {}
  const toNonNeg = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0)
  return {
    date,
    secondsByState: Object.fromEntries(
      Object.entries(secondsByState).map(([k, v]) => [k, toNonNeg(v)])
    ),
    hours: normalizeHours(r.hours),
    events: Object.fromEntries(Object.entries(events).map(([k, v]) => [k, toNonNeg(v)])),
    interactions: {
      click: toNonNeg(Number(interactionsRaw.click) || 0),
      drag: toNonNeg(Number(interactionsRaw.drag) || 0),
      speak: toNonNeg(Number(interactionsRaw.speak) || 0)
    },
    updatedAt: Date.now()
  }
}

export function loadDailyStats(dir: string, date: string): DailyStats {
  try {
    const raw = JSON.parse(readFileSync(dailyStatsPath(dir, date), 'utf-8'))
    return normalizeStats(raw, date)
  } catch {
    return emptyStats(date)
  }
}

export function saveDailyStats(dir: string, stats: DailyStats): void {
  try {
    mkdirSync(dir, { recursive: true })
    writeFileSync(dailyStatsPath(dir, stats.date), JSON.stringify(stats, null, 2), 'utf-8')
  } catch (err) {
    console.error('[stats] save failed:', err)
  }
}

/** 自然周（本周一到今天）聚合；无记录日不计入 days */
export function aggregateWeek(dir: string, today: string): WeekSummary {
  const out: WeekSummary = { days: 0, totalSeconds: 0, events: {}, interactions: { click: 0, drag: 0, speak: 0 } }
  const m = today.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return out
  const day = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  if (!isValidDate(Number(m[1]), Number(m[2]), Number(m[3]))) return out
  // 本周一（周日 dow=0 → 上周一，偏移 6）
  const dow = day.getDay()
  const monday = todayStr(new Date(day.getFullYear(), day.getMonth(), day.getDate() - (dow === 0 ? 6 : dow - 1)))
  for (const d of iterateDates(monday, today)) {
    if (!existsSync(dailyStatsPath(dir, d))) continue
    const s = loadDailyStats(dir, d)
    out.days++
    out.totalSeconds += totalSeconds(s)
    for (const [k, v] of Object.entries(s.events)) {
      out.events[k] = (out.events[k] ?? 0) + v
    }
    out.interactions.click += s.interactions.click
    out.interactions.drag += s.interactions.drag
    out.interactions.speak += s.interactions.speak
  }
  return out
}

const STATE_KEYS = ['idle', 'focus', 'sleep', 'happy', 'warning'] as const

/** 当前连续陪伴天数：从今天（今天无记录则昨天）向前数 totalSeconds>0 的连续天数 */
export function computeStreak(dir: string, today: string): number {
  // 用日历日减法而非 86400000 毫秒，避免 DST 切换日日期漂移
  const prevDay = (d: string): string => {
    const dt = new Date(d + 'T00:00:00')
    return todayStr(new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() - 1))
  }
  const active = (d: string): boolean => totalSeconds(loadDailyStats(dir, d)) > 0
  let streak = 0
  let cur = active(today) ? today : prevDay(today)
  while (active(cur)) {
    streak++
    cur = prevDay(cur)
  }
  return streak
}

/** 全年汇总（活跃天 = 有记录文件的天；日均 = 总秒 / 活跃天） */
export function summarizeYear(dir: string, year: number): YearSummary | null {
  const days = loadDailyRange(dir, `${year}-01-01`, `${year}-12-31`).filter((d) => d.present)
  if (days.length === 0) return null
  let total = 0
  let bestDay: YearSummary['bestDay'] = null
  for (const d of days) {
    const sec = totalSeconds(d.stats)
    total += sec
    if (!bestDay || sec > bestDay.seconds) bestDay = { date: d.date, seconds: Math.round(sec) }
  }
  return {
    year,
    totalSeconds: Math.round(total),
    activeDays: days.length,
    avgSecondsPerActiveDay: Math.round(total / days.length),
    bestDay
  }
}

/** 区间 CSV（UTF-8 无 BOM；调用方负责写文件） */
export function buildStatsCsv(rows: { date: string; stats: DailyStats }[]): string {
  const header = '日期,陪伴秒数,待机秒,专注秒,睡眠秒,开心秒,告警秒,事件总数,点击,拖动,说话'
  const lines = rows.map(({ date, stats }) => {
    const byState = STATE_KEYS.map((k) => Math.round(stats.secondsByState[k] ?? 0))
    const events = Object.values(stats.events).reduce((a, b) => a + b, 0)
    return [
      date,
      Math.round(totalSeconds(stats)),
      ...byState,
      events,
      stats.interactions.click,
      stats.interactions.drag,
      stats.interactions.speak
    ].join(',')
  })
  return [header, ...lines].join('\n')
}

/** 删除单日文件；返回是否实际删除 */
export function deleteDailyStatsFile(dir: string, date: string): boolean {
  const p = dailyStatsPath(dir, date)
  if (!existsSync(p)) return false
  try {
    unlinkSync(p)
    return true
  } catch {
    return false
  }
}

/** 清空统计目录内全部 json；返回删除数 */
export function clearStatsDir(dir: string): number {
  if (!existsSync(dir)) return 0
  let n = 0
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue
    try {
      unlinkSync(join(dir, f))
      n++
    } catch {
      /* 忽略单个失败 */
    }
  }
  return n
}

/** 校验区间入参（格式 / start≤end / ≤90 天 / 不查未来）；与 stats:range 原逻辑等价 */
export function validateRange(
  start: string,
  end: string
): { ok: boolean; error?: string; dates?: string[] } {
  const fmt = /^\d{4}-\d{2}-\d{2}$/
  if (!fmt.test(start) || !fmt.test(end)) return { ok: false, error: '日期格式应为 YYYY-MM-DD' }
  const [y1, m1, d1] = start.split('-').map(Number)
  const [y2, m2, d2] = end.split('-').map(Number)
  const a = new Date(y1, m1 - 1, d1)
  const b = new Date(y2, m2 - 1, d2)
  if (a.getTime() > b.getTime()) return { ok: false, error: '起始日期不能晚于结束日期' }
  if ((b.getTime() - a.getTime()) / 86400000 + 1 > 90) return { ok: false, error: '查询区间不能超过 90 天' }
  const dates = iterateDates(start, end)
  if (dates.length === 0) return { ok: false, error: '日期无效或区间为空' }
  if (dates[dates.length - 1] > todayStr()) return { ok: false, error: '不能查询未来日期' }
  return { ok: true, dates }
}

/** 角色 id 安全化：非 [a-zA-Z0-9_-] 字符替换为下划线（不含 . 以免产生 .. 穿越段）；空串兜底 role */
export function sanitizeRoleId(id: string): string {
  const s = String(id ?? '').replace(/[^a-zA-Z0-9_-]/g, '_')
  return s === '' ? 'role' : s
}

/**
 * 迁移旧版平铺统计文件（stats/*.json）到角色子目录（stats/<defaultRoleId>/*.json）。
 * 幂等：无平铺文件时返回 0。同名冲突按 updatedAt 保留较新者。
 */
export function migrateStatsLayout(root: string, defaultRoleId: string): number {
  if (!existsSync(root)) return 0
  const role = sanitizeRoleId(defaultRoleId)
  const dailyRoleDir = join(root, role)
  let moved = 0
  for (const name of readdirSync(root)) {
    if (!name.endsWith('.json')) continue
    const src = join(root, name)
    mkdirSync(dailyRoleDir, { recursive: true })
    const dest = join(dailyRoleDir, name)
    if (existsSync(dest)) {
      // 保留 updatedAt 较新者
      try {
        const s = JSON.parse(readFileSync(src, 'utf-8')) as { updatedAt?: number }
        const d = JSON.parse(readFileSync(dest, 'utf-8')) as { updatedAt?: number }
        if ((s.updatedAt ?? 0) > (d.updatedAt ?? 0)) {
          unlinkSync(dest)
          renameSync(src, dest)
        } else {
          unlinkSync(src)
        }
      } catch {
        unlinkSync(src)
      }
    } else {
      renameSync(src, dest)
    }
    moved++
  }
  return moved
}

/** 全年逐日统计（不分上限 90 天；未来日期 present=false 不报错）；闰年自动 366 天 */
export function loadDailyRangeFullYear(dir: string, year: number): RangeDay[] {
  const start = `${year}-01-01`
  const end = `${year}-12-31`
  return iterateDates(start, end).map((date) => {
    const present = existsSync(dailyStatsPath(dir, date))
    return { date, present, stats: present ? loadDailyStats(dir, date) : emptyStats(date) }
  })
}