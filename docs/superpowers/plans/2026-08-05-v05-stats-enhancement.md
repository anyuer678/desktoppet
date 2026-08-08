# v0.5 统计增强 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 v0.5 陪伴统计增加日历热力图、24 小时时段分布、连续陪伴 streak、月度/年度汇总、导出与数据管理五项能力。

**Architecture:** 数据模型扩展 `DailyStats.hours: number[24]`（同文件存储，旧文件加载时归一化补零）；新增 4 个纯函数 + 1 个区间校验复用函数（dailyStats.ts，全部单测）；新增 4 个 IPC（stats:year / stats:exportCsv / stats:deleteDay / stats:clearAll）+ stats:report 响应增加 streak；渲染层统计页新增 4 个卡片区域，首页卡片加 streak 行。

**Tech Stack:** Electron 37 / electron-vite / React 19 / TypeScript 5.8 / Tailwind 4 / Vitest 4（项目现状）。

## Global Constraints

- 项目**无 git 仓库**：每步的「提交」替换为「运行 `npm test`（须全绿）」，交付阶段做目录备份
- 版本号：`package.json` → `0.5.0805.04`，CHANGELOG 新增 v0.5.0805.04 条目（标题格式：`## v0.5.0805.04 (功能名，开发版)`）
- 数据目录（实际小写）：`%APPDATA%/desktop-pet/stats/YYYY-MM-DD.json`，docs 中一律写小写 `desktop-pet`
- 设计约束（来自 spec §7）：不引入新采样；历史文件无 `hours` 字段必须兼容；破坏性操作（删除某天/清空全部）UI 必须显式确认；清空后内存 `dailyStats` 同步重置防 will-quit 回写
- IPC 全部经 preload 白名单暴露，类型定义在 `src/shared/ipc.ts` 单点维护
- 错误消息文案与现有风格一致（如 `'日期格式应为 YYYY-MM-DD'`）
- 区间校验口径：格式 / start≤end / ≤90 天 / 不查未来（与现 stats:range 完全一致，错误文案保持不变）

---

### Task 1: 数据模型 hours 字段 + tick 接入

**Files:**
- Modify: `src/shared/ipc.ts`（DailyStats 加 `hours`）
- Modify: `src/main/stats/dailyStats.ts`（emptyStats / normalizeStats / addStateTime）
- Modify: `src/main/index.ts`（tick 调用点传 now）
- Test: `src/main/stats/dailyStats.test.ts`

**Interfaces:**
- Produces: `DailyStats.hours: number[]`（24 长度，`hours[i]` = 当日第 i 小时累计秒数）；`addStateTime(stats, state, seconds, now?: number)`（now 缺省 = `Date.now()`）

- [x] **Step 1: 写失败测试（emptyStats.hours + addStateTime 小时累加 + 归一化）**

在 `src/main/stats/dailyStats.test.ts` 追加：

```ts
describe('hours 时段字段', () => {
  it('emptyStats 生成 24 长度零数组', () => {
    const s = emptyStats('2026-08-05')
    expect(s.hours).toHaveLength(24)
    expect(s.hours.every((v) => v === 0)).toBe(true)
  })

  it('addStateTime 按 now 的小时位累加', () => {
    let s = emptyStats('2026-08-05')
    // 2026-08-05 15:30（本地时间）→ hours[15]
    s = addStateTime(s, 'focus', 4, new Date(2026, 7, 5, 15, 30).getTime())
    s = addStateTime(s, 'idle', 2, new Date(2026, 7, 5, 15, 30).getTime())
    s = addStateTime(s, 'focus', 3, new Date(2026, 7, 5, 23, 0).getTime())
    expect(s.hours[15]).toBe(6)
    expect(s.hours[23]).toBe(3)
    expect(s.secondsByState).toEqual({ focus: 7, idle: 2 })
  })

  it('旧文件缺 hours 字段加载后补零', () => {
    const dir = tempDir('stats-hours-')
    writeFileSync(join(dir, '2026-08-01.json'), JSON.stringify({ date: '2026-08-01', secondsByState: { focus: 60 }, events: {}, interactions: { click: 1, drag: 0, speak: 0 }, updatedAt: 1 }))
    const s = loadDailyStats(dir, '2026-08-01')
    expect(s.hours).toHaveLength(24)
    expect(s.hours.every((v) => v === 0)).toBe(true)
    expect(s.secondsByState.focus).toBe(60)
    rmSync(dir, { recursive: true, force: true })
  })
})
```

- [x] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/main/stats/dailyStats.test.ts`
Expected: FAIL（`s.hours` 为 undefined / 类型错误）

- [x] **Step 3: 实现**

`src/shared/ipc.ts` 的 `DailyStats` 增加字段：

```ts
export interface DailyStats {
  date: string
  /** 各状态时长（秒） */
  secondsByState: Record<string, number>
  /** 当日每小时累计陪伴秒数（24 长度；旧文件缺省 → 补零） */
  hours: number[]
  /** 事件类型计数（cpu_high/battery_low/schedule 等） */
  events: Record<string, number>
  interactions: Record<InteractionKind, number>
  updatedAt: number
}
```

`src/main/stats/dailyStats.ts`：

```ts
function normalizeHours(raw: unknown): number[] {
  const out = new Array(24).fill(0)
  if (!Array.isArray(raw)) return out
  for (let i = 0; i < Math.min(24, raw.length); i++) {
    const v = Number(raw[i])
    if (Number.isFinite(v) && v > 0) out[i] = v
  }
  return out
}
```

`emptyStats` 返回值加 `hours: new Array(24).fill(0)`；`normalizeStats` 返回值加 `hours: normalizeHours(r.hours)`；`addStateTime` 改签名并加小时累加：

```ts
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
```

- [x] **Step 4: tick 调用点传 now**

`src/main/index.ts` tick（约 L734）：

```ts
recordStats((s) => addStateTime(s, lastState, (now - lastTickAt) / 1000, now))
```

（`recordStats` 内部仍按 5s 防抖落盘，无需改动。）

- [x] **Step 5: 跑测试确认通过**

Run: `npx vitest run src/main/stats/dailyStats.test.ts`
Expected: PASS（原 16 例 + 新 3 例）

- [x] **Step 6: 全量回归**

Run: `npm test`
Expected: 227 + 3 = 230 全绿

---

### Task 2: 统计工具纯函数（streak / 年度汇总 / CSV / 删除 / 清空 / 区间校验复用）

**Files:**
- Modify: `src/main/stats/dailyStats.ts`（新增 6 个导出函数）
- Test: `src/main/stats/dailyStats.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `emptyStats` / `loadDailyStats` / `dailyStatsPath` / `totalSeconds` / `iterateDates` / `loadDailyRange`
- Produces:
  - `computeStreak(dir: string, today: string): number`
  - `summarizeYear(dir: string, year: number): YearSummary | null`
  - `buildStatsCsv(rows: { date: string; stats: DailyStats }[]): string`
  - `deleteDailyStatsFile(dir: string, date: string): boolean`
  - `clearStatsDir(dir: string): number`
  - `validateRange(start: string, end: string): { ok: boolean; error?: string; dates?: string[] }`
- Depends on shared 类型：`YearSummary` 等（本任务 Step 1 先在 ipc.ts 定义，供实现使用）

- [x] **Step 1: shared/ipc.ts 定义 YearSummary 与结果类型**

```ts
/** 年度汇总（activeDays = 有记录的天数；avg 为日均活跃口径） */
export interface YearSummary {
  year: number
  totalSeconds: number
  activeDays: number
  avgSecondsPerActiveDay: number
  bestDay: { date: string; seconds: number } | null
}

export interface StatsYearResult {
  ok: boolean
  error?: string
  summary?: YearSummary | null
}

export interface StatsExportResult {
  ok: boolean
  error?: string
  /** 用户取消保存对话框 */
  canceled?: boolean
  /** 成功时保存路径 */
  path?: string
}

export interface StatsClearResult {
  ok: boolean
  error?: string
  deleted?: number
}
```

- [x] **Step 2: 写失败测试**

在 `dailyStats.test.ts` 追加（复用文件顶部的 `tempDir`）：

```ts
describe('computeStreak', () => {
  function write(dir: string, date: string, seconds: number): void {
    saveDailyStats(dir, { ...emptyStats(date), secondsByState: seconds > 0 ? { focus: seconds } : {} })
  }
  it('无任何记录为 0', () => {
    const dir = tempDir('stats-streak-')
    expect(computeStreak(dir, '2026-08-05')).toBe(0)
    rmSync(dir, { recursive: true, force: true })
  })
  it('今天有记录连续 3 天', () => {
    const dir = tempDir('stats-streak-')
    write(dir, '2026-08-05', 100)
    write(dir, '2026-08-04', 50)
    write(dir, '2026-08-03', 30)
    expect(computeStreak(dir, '2026-08-05')).toBe(3)
    rmSync(dir, { recursive: true, force: true })
  })
  it('今天无记录则从昨天起算', () => {
    const dir = tempDir('stats-streak-')
    write(dir, '2026-08-04', 50)
    write(dir, '2026-08-03', 30)
    expect(computeStreak(dir, '2026-08-05')).toBe(2)
    rmSync(dir, { recursive: true, force: true })
  })
  it('断档中断', () => {
    const dir = tempDir('stats-streak-')
    write(dir, '2026-08-05', 100)
    write(dir, '2026-08-04', 50)
    // 08-03 缺失 → 断
    expect(computeStreak(dir, '2026-08-05')).toBe(2)
    rmSync(dir, { recursive: true, force: true })
  })
  it('跨月连续', () => {
    const dir = tempDir('stats-streak-')
    write(dir, '2026-08-01', 10)
    write(dir, '2026-07-31', 20)
    write(dir, '2026-07-30', 30)
    expect(computeStreak(dir, '2026-08-01')).toBe(3)
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('summarizeYear', () => {
  it('空年返回 null', () => {
    const dir = tempDir('stats-year-')
    expect(summarizeYear(dir, 2026)).toBeNull()
    rmSync(dir, { recursive: true, force: true })
  })
  it('汇总全年（总秒/活跃天数/日均/最活跃日）', () => {
    const dir = tempDir('stats-year-')
    saveDailyStats(dir, { ...emptyStats('2026-01-01'), secondsByState: { focus: 3600 } })
    saveDailyStats(dir, { ...emptyStats('2026-02-03'), secondsByState: { idle: 7200 } })
    saveDailyStats(dir, { ...emptyStats('2026-12-31'), secondsByState: { sleep: 1800 } })
    const s = summarizeYear(dir, 2026)
    expect(s).toEqual({
      year: 2026,
      totalSeconds: 12600,
      activeDays: 3,
      avgSecondsPerActiveDay: 4200,
      bestDay: { date: '2026-02-03', seconds: 7200 }
    })
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('buildStatsCsv', () => {
  it('表头与数据行', () => {
    const s = buildStatsCsv([
      {
        date: '2026-08-05',
        stats: { ...emptyStats('2026-08-05'), secondsByState: { focus: 64.4 }, events: { working: 2 }, interactions: { click: 4, drag: 0, speak: 0 } }
      }
    ])
    const lines = s.split('\n')
    expect(lines[0]).toBe('日期,陪伴秒数,待机秒,专注秒,睡眠秒,开心秒,告警秒,事件总数,点击,拖动,说话')
    expect(lines[1]).toBe('2026-08-05,64,0,64,0,0,0,2,4,0,0')
  })
  it('空区间只有表头', () => {
    expect(buildStatsCsv([]).split('\n')).toEqual(['日期,陪伴秒数,待机秒,专注秒,睡眠秒,开心秒,告警秒,事件总数,点击,拖动,说话'])
  })
})

describe('deleteDailyStatsFile / clearStatsDir', () => {
  it('删除单日：存在返回 true，不存在返回 false', () => {
    const dir = tempDir('stats-del-')
    saveDailyStats(dir, emptyStats('2026-08-05'))
    expect(deleteDailyStatsFile(dir, '2026-08-05')).toBe(true)
    expect(deleteDailyStatsFile(dir, '2026-08-05')).toBe(false)
    rmSync(dir, { recursive: true, force: true })
  })
  it('清空目录返回删除数，非 json 文件保留', () => {
    const dir = tempDir('stats-clear-')
    saveDailyStats(dir, emptyStats('2026-08-05'))
    saveDailyStats(dir, emptyStats('2026-08-04'))
    writeFileSync(join(dir, 'readme.txt'), 'x')
    expect(clearStatsDir(dir)).toBe(2)
    expect(existsSync(join(dir, 'readme.txt'))).toBe(true)
    expect(clearStatsDir(dir)).toBe(0)
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('validateRange', () => {
  it('格式/倒序/超 90 天/未来日期依次拒绝', () => {
    expect(validateRange('2026-8-5', '2026-08-05').ok).toBe(false)
    expect(validateRange('2026-08-06', '2026-08-05').ok).toBe(false)
    expect(validateRange('2026-01-01', '2026-04-01').ok).toBe(false)
    expect(validateRange('2099-01-01', '2099-01-02').ok).toBe(false)
  })
  it('合法区间返回日期列表', () => {
    const v = validateRange('2026-08-01', '2026-08-03')
    expect(v.ok).toBe(true)
    expect(v.dates).toEqual(['2026-08-01', '2026-08-02', '2026-08-03'])
  })
})
```

（测试顶部 import 需要补充：`computeStreak, summarizeYear, buildStatsCsv, deleteDailyStatsFile, clearStatsDir, validateRange` 以及 `existsSync`；`buildStatsCsv` 中状态列四舍五入用 `Math.round`。）

- [x] **Step 3: 跑测试确认失败**

Run: `npx vitest run src/main/stats/dailyStats.test.ts`
Expected: FAIL（函数不存在）

- [x] **Step 4: 实现（dailyStats.ts 追加）**

```ts
const STATE_KEYS = ['idle', 'focus', 'sleep', 'happy', 'warning'] as const

/** 当前连续陪伴天数：从今天（今天无记录则昨天）向前数 totalSeconds>0 的连续天数 */
export function computeStreak(dir: string, today: string): number {
  const prevDay = (d: string): string =>
    todayStr(new Date(new Date(d + 'T00:00:00').getTime() - 86400000))
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
  let totalSeconds = 0
  let bestDay: YearSummary['bestDay'] = null
  for (const d of days) {
    const s = totalSeconds(d.stats)
    totalSeconds += s
    if (!bestDay || s > bestDay.seconds) bestDay = { date: d.date, seconds: Math.round(s) }
  }
  return {
    year,
    totalSeconds: Math.round(totalSeconds),
    activeDays: days.length,
    avgSecondsPerActiveDay: Math.round(totalSeconds / days.length),
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
```

文件头 import 补充：`unlinkSync, readdirSync`（现有 `existsSync, mkdirSync, readFileSync, writeFileSync`），场景类型 import 补充 `YearSummary`（本任务 Step 1 已定义）。

- [x] **Step 5: 跑测试确认通过**

Run: `npx vitest run src/main/stats/dailyStats.test.ts`
Expected: PASS（16 + 15 = 31 例）

- [x] **Step 6: 全量回归**

Run: `npm test`
Expected: 全绿

---

### Task 3: IPC 与 preload（year / exportCsv / deleteDay / clearAll / report.streak）

**Files:**
- Modify: `src/shared/ipc.ts`（仅 `StatsReport.streak`——YearSummary 等已在 Task 2 Step 1 定义）
- Modify: `src/main/index.ts`（stats:report 加 streak；stats:range 重构用 validateRange；新增 4 个 handler）
- Modify: `src/preload/index.ts` + `src/preload/index.d.ts`
- Test: `src/main/stats/dailyStats.test.ts` 无需新增（类型与函数已测）

**Interfaces:**
- Consumes: Task 2 的 `validateRange / summarizeYear / buildStatsCsv / deleteDailyStatsFile / clearStatsDir / loadDailyStats / dailyStatsPath`，Task 1 的 `emptyStats`
- Produces（preload `stats` 命名空间新增）:
  - `year(year: number): Promise<StatsYearResult>`
  - `exportCsv(start: string, end: string): Promise<StatsExportResult>`
  - `deleteDay(date: string): Promise<OpResult>`
  - `clearAll(): Promise<StatsClearResult>`
  - `get()` 返回类型变为含 `streak` 的 `StatsReport`

- [x] **Step 1: shared/ipc.ts 给 StatsReport 加 streak**

（YearSummary / StatsYearResult / StatsExportResult / StatsClearResult 已在 Task 2 Step 1 定义，勿重复。）

```ts
export interface StatsReport {
  today: DailyStats
  week: WeekSummary
  /** 当前连续陪伴天数（今天无记录则从昨天起算） */
  streak: number
}
```

- [x] **Step 2: stats:report 加 streak + stats:range 重构**

`src/main/index.ts`：

```ts
ipcMain.handle('stats:report', () => {
  ensureStatsDate(Date.now())
  if (dailyStats) saveDailyStats(statsDir, dailyStats)
  return {
    today: dailyStats ?? emptyStats(''),
    week: aggregateWeek(statsDir, statsDate),
    streak: computeStreak(statsDir, statsDate)
  }
})
ipcMain.handle('stats:range', (_e, start: unknown, end: unknown) => {
  if (typeof start !== 'string' || typeof end !== 'string') {
    return { ok: false, error: '日期格式应为 YYYY-MM-DD' }
  }
  const v = validateRange(start, end)
  if (!v.ok) return v
  return { ok: true, days: loadDailyRange(statsDir, start, end) }
})
```

- [x] **Step 3: 新增 4 个 handler（追加在 stats:range 之后）**

```ts
ipcMain.handle('stats:year', (_e, year: unknown) => {
  if (typeof year !== 'number' || !Number.isInteger(year) || year < 2000 || year > 2100) {
    return { ok: false, error: '年份应在 2000~2100 之间' }
  }
  return { ok: true, summary: summarizeYear(statsDir, year) }
})
ipcMain.handle('stats:exportCsv', async (_e, start: unknown, end: unknown) => {
  if (typeof start !== 'string' || typeof end !== 'string') {
    return { ok: false, error: '日期格式应为 YYYY-MM-DD' }
  }
  const v = validateRange(start, end)
  if (!v.ok || !v.dates) return v
  const rows = v.dates.map((d) => ({ date: d, stats: loadDailyStats(statsDir, d) }))
  const csv = buildStatsCsv(rows)
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: '导出陪伴统计',
    defaultPath: join(app.getPath('documents'), `陪伴统计-${start}-至-${end}.csv`),
    filters: [{ name: 'CSV', extensions: ['csv'] }]
  })
  if (canceled || !filePath) return { ok: false, canceled: true }
  try {
    writeFileSync(filePath, '\ufeff' + csv, 'utf-8')
    log('info', '[stats:exportCsv] saved', filePath)
    return { ok: true, path: filePath }
  } catch (err) {
    log('error', '[stats:exportCsv] write failed:', err)
    return { ok: false, error: '导出文件写入失败' }
  }
})
ipcMain.handle('stats:deleteDay', (_e, date: unknown) => {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, error: '日期格式应为 YYYY-MM-DD' }
  }
  deleteDailyStatsFile(statsDir, date)
  if (date === statsDate && dailyStats) {
    dailyStats = emptyStats(date)
  }
  return { ok: true }
})
ipcMain.handle('stats:clearAll', () => {
  const deleted = clearStatsDir(statsDir)
  if (dailyStats) dailyStats = emptyStats(statsDate)
  log('info', '[stats:clearAll] deleted', deleted, 'files')
  return { ok: true, deleted }
})
```

（`writeFileSync` 已在 index.ts import；`dialog` 已 import。）

- [x] **Step 4: preload 暴露**

`src/preload/index.ts` stats 命名空间改为：

```ts
stats: {
  get: (): Promise<StatsReport> => ipcRenderer.invoke('stats:report'),
  range: (start: string, end: string): Promise<StatsRangeResult> =>
    ipcRenderer.invoke('stats:range', start, end),
  year: (year: number): Promise<StatsYearResult> => ipcRenderer.invoke('stats:year', year),
  exportCsv: (start: string, end: string): Promise<StatsExportResult> =>
    ipcRenderer.invoke('stats:exportCsv', start, end),
  deleteDay: (date: string): Promise<OpResult> => ipcRenderer.invoke('stats:deleteDay', date),
  clearAll: (): Promise<StatsClearResult> => ipcRenderer.invoke('stats:clearAll'),
  reportInteraction: (kind: InteractionKind): void => ipcRenderer.send('pet:interact', kind)
}
```

`src/preload/index.d.ts` 同步：

```ts
stats: {
  get(): Promise<StatsReport>
  range(start: string, end: string): Promise<StatsRangeResult>
  year(year: number): Promise<StatsYearResult>
  exportCsv(start: string, end: string): Promise<StatsExportResult>
  deleteDay(date: string): Promise<OpResult>
  clearAll(): Promise<StatsClearResult>
  reportInteraction(kind: InteractionKind): void
}
```

- [x] **Step 5: 类型检查**

Run: `npm run typecheck`
Expected: 全绿

- [x] **Step 6: 全量回归**

Run: `npm test`
Expected: 全绿

---

### Task 4: 渲染层统计页 UI + 首页 streak

**Files:**
- Modify: `src/renderer/src/center/CenterApp.tsx`
- Test: 无渲染层测试框架；以 `npm run typecheck:web` + 实机驱动验证代替

**Interfaces:**
- Consumes: Task 3 的 preload `stats.year / exportCsv / deleteDay / clearAll / get(streak)`
- Produces: 统计页新增「月度热力图」「24小时时段分布」「年度汇总」「管理按钮行」四块 UI；首页卡片 streak 行

- [x] **Step 1: 新增渲染层工具函数（放在 formatCompactDuration 附近）**

```ts
/** 热力图配色：无记录灰，其余按当月最大值分 4 档 */
function heatColor(sec: number, max: number): string {
  if (sec <= 0) return 'bg-muted'
  const r = sec / Math.max(1, max)
  if (r <= 0.25) return 'bg-emerald-200'
  if (r <= 0.5) return 'bg-emerald-300'
  if (r <= 0.75) return 'bg-emerald-400'
  return 'bg-emerald-500'
}

/** 生成某月全部日期（YYYY-MM-DD 升序） */
function monthDates(year: number, month: number): string[] {
  const last = new Date(year, month, 0).getDate()
  const out: string[] = []
  for (let d = 1; d <= last; d++) {
    out.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  return out
}
```

- [x] **Step 2: 新增状态与加载函数（放在 loadRange 附近）**

```ts
const [heatmapMonth, setHeatmapMonth] = useState(() => {
  const d = new Date()
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
})
const [heatmapDays, setHeatmapDays] = useState<RangeDay[] | null>(null)
const [heatmapError, setHeatmapError] = useState('')
const [selectedDay, setSelectedDay] = useState<RangeDay | null>(null)
const [confirmDeleteDay, setConfirmDeleteDay] = useState(false)
const [confirmClear, setConfirmClear] = useState(false)
const [exportMsg, setExportMsg] = useState('')
const [yearSummary, setYearSummary] = useState<YearSummary | null | undefined>(undefined)

const loadHeatmap = async (year: number, month: number): Promise<void> => {
  const dates = monthDates(year, month)
  const start = dates[0]
  const end = dates[dates.length - 1]
  const res = await window.desktopPet.stats.range(start, end)
  setSelectedDay(null)
  setConfirmDeleteDay(false)
  if (res.ok && res.days) {
    setHeatmapDays(res.days)
    setHeatmapError('')
    return
  }
  // 未来月份 range 会拒绝（不查未来）→ 按空月渲染
  if ((res.error ?? '').includes('未来')) {
    setHeatmapDays(dates.map((d) => ({ date: d, present: false, stats: { date: d, secondsByState: {}, hours: new Array(24).fill(0), events: {}, interactions: { click: 0, drag: 0, speak: 0 }, updatedAt: 0 } })))
    setHeatmapError('')
    return
  }
  setHeatmapDays(null)
  setHeatmapError(res.error ?? '加载失败')
}

const loadYearSummary = async (year: number): Promise<void> => {
  const res = await window.desktopPet.stats.year(year)
  setYearSummary(res.ok ? res.summary : undefined)
}

const handleExportCsv = async (): Promise<void> => {
  setExportMsg('')
  const res = await window.desktopPet.stats.exportCsv(rangeStart, rangeEnd)
  if (res.ok) setExportMsg(`已导出：${res.path}`)
  else if (res.canceled) setExportMsg('')
  else setExportMsg(res.error ?? '导出失败')
}

const handleClearAll = async (): Promise<void> => {
  const res = await window.desktopPet.stats.clearAll()
  if (res.ok) {
    setConfirmClear(false)
    setExportMsg('')
    setStatsReport(null)
    await Promise.all([
      refreshStats(),
      loadRange(rangeStart, rangeEnd),
      loadHeatmap(heatmapMonth.year, heatmapMonth.month),
      loadYearSummary(new Date().getFullYear())
    ])
  }
}

const handleDeleteDay = async (): Promise<void> => {
  if (!selectedDay) return
  const res = await window.desktopPet.stats.deleteDay(selectedDay.date)
  if (res.ok) {
    setSelectedDay(null)
    setConfirmDeleteDay(false)
    setStatsReport(null)
    await Promise.all([
      refreshStats(),
      loadRange(rangeStart, rangeEnd),
      loadHeatmap(heatmapMonth.year, heatmapMonth.month)
    ])
  }
}
```

- [x] **Step 3: 统计页 tab 挂载/月份切换时加载**

在现有 stats 页的加载 effect（`tab === 'stats'` 分支，含 `loadRange(rangeStart, rangeEnd)` 的位置）追加：

```ts
loadHeatmap(heatmapMonth.year, heatmapMonth.month)
loadYearSummary(new Date().getFullYear())
```

月份导航（热力图卡片内）用 `setHeatmapMonth(({ year, month }) => { const next = month + delta; if (next < 1) return { year: year - 1, month: 12 }; if (next > 12) return { year: year + 1, month: 1 }; return { year, month: next } })` 并配一个 `useEffect(() => { if (tab === 'stats') void loadHeatmap(heatmapMonth.year, heatmapMonth.month) }, [heatmapMonth, tab])`。

- [x] **Step 4: 统计页插入新 UI**

在「互动次数」Card 结束（约 L1812 后）与 stats 页签容器闭合前插入以下 JSX：

```tsx
<Card>
  <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
    <CardTitle>月度热力图</CardTitle>
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => setHeatmapMonth((m) => (m.month === 1 ? { year: m.year - 1, month: 12 } : { ...m, month: m.month - 1 }))}>‹</Button>
      <span className="w-24 text-center text-sm font-medium">{heatmapMonth.year} 年 {heatmapMonth.month} 月</span>
      <Button variant="outline" size="sm" onClick={() => setHeatmapMonth((m) => (m.month === 12 ? { year: m.year + 1, month: 1 } : { ...m, month: m.month + 1 }))}>›</Button>
    </div>
  </CardHeader>
  <CardContent className="space-y-3">
    {heatmapError && (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{heatmapError}</div>
    )}
    {heatmapDays && (() => {
      const byDate = new Map(heatmapDays.map((d) => [d.date, d.stats]))
      const max = Math.max(1, ...heatmapDays.map((d) => dayTotalSeconds(d.stats)))
      const today = todayStr()
      const cells = monthDates(heatmapMonth.year, heatmapMonth.month)
      const offset = (new Date(heatmapMonth.year, heatmapMonth.month - 1, 1).getDay() + 6) % 7
      const monthTotal = heatmapDays.reduce((a, d) => a + dayTotalSeconds(d.stats), 0)
      const activeDays = heatmapDays.filter((d) => d.present).length
      return (
        <div className="space-y-3">
          <div className="grid grid-cols-7 gap-1">
            {['一', '二', '三', '四', '五', '六', '日'].map((w) => (
              <div key={w} className="pb-1 text-center text-[11px] text-muted-foreground">{w}</div>
            ))}
            {Array.from({ length: offset }, (_, i) => (
              <div key={`b${i}`} />
            ))}
            {cells.map((date) => {
              const stats = byDate.get(date)
              const sec = stats ? dayTotalSeconds(stats) : 0
              return (
                <button
                  key={date}
                  type="button"
                  title={`${date} · ${sec > 0 ? formatDuration(sec) : '无记录'}`}
                  onClick={() => setSelectedDay(heatmapDays.find((d) => d.date === date) ?? null)}
                  className={cn(
                    'aspect-square rounded text-[11px] leading-none transition-colors',
                    heatColor(sec, max),
                    date === today && 'ring-2 ring-primary'
                  )}
                >
                  {Number(date.slice(8))}
                </button>
              )
            })}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>本月陪伴 {formatDuration(monthTotal)}</span>
            <span>活跃 {activeDays} 天</span>
            <span>日均 {activeDays > 0 ? formatDuration(monthTotal / activeDays) : '—'}</span>
            <span className="inline-flex items-center gap-1">
              无
              <span className="size-2.5 rounded-sm bg-muted" />
              <span className="size-2.5 rounded-sm bg-emerald-200" />
              <span className="size-2.5 rounded-sm bg-emerald-300" />
              <span className="size-2.5 rounded-sm bg-emerald-400" />
              <span className="size-2.5 rounded-sm bg-emerald-500" />
              多
            </span>
          </div>
          {selectedDay && (
            <div className="space-y-2 rounded-md border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium">{selectedDay.date} 明细</div>
                <div className="flex items-center gap-2">
                  {confirmDeleteDay ? (
                    <>
                      <Button size="sm" variant="destructive" onClick={() => void handleDeleteDay()}>确认删除</Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteDay(false)}>取消</Button>
                    </>
                  ) : (
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmDeleteDay(true)}>
                      删除这一天
                    </Button>
                  )}
                </div>
              </div>
              {selectedDay.present ? (
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div>总陪伴 {formatDuration(dayTotalSeconds(selectedDay.stats))}</div>
                  <div>
                    状态{' '}
                    {STATE_LABELS.filter((s) => (selectedDay.stats.secondsByState[s.key] ?? 0) > 0)
                      .map((s) => `${s.label} ${formatDuration(selectedDay.stats.secondsByState[s.key] ?? 0)}`)
                      .join(' · ') || '无'}
                  </div>
                  <div>事件 {Object.entries(selectedDay.stats.events).map(([k, v]) => `${k} ${v}`).join(' · ') || '无'}</div>
                  <div>互动 点击 {selectedDay.stats.interactions.click} · 拖动 {selectedDay.stats.interactions.drag} · 说话 {selectedDay.stats.interactions.speak}</div>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">当天没有记录</div>
              )}
            </div>
          )}
        </div>
      )
    })()}
  </CardContent>
</Card>
<Card>
  <CardHeader>
    <CardTitle>24小时时段分布</CardTitle>
  </CardHeader>
  <CardContent>
    {(() => {
      const hours = new Array(24).fill(0)
      let hasData = false
      for (const d of rangeDays ?? []) {
        const h = d.stats.hours ?? []
        for (let i = 0; i < 24; i++) {
          const v = h[i] ?? 0
          if (v > 0) hasData = true
          hours[i] += v
        }
      }
      if (!hasData) {
        return <div className="py-8 text-center text-sm text-muted-foreground">历史数据不包含时段分布（自 v0.5.0805.04 起记录）</div>
      }
      return (
        <VBarChart
          bars={hours.map((v, i) => ({
            label: i % 3 === 0 ? String(i) : '',
            title: `${String(i).padStart(2, '0')}:00-${String(i).padStart(2, '0')}:59 · ${formatDuration(v)}`,
            value: v,
            segments: v > 0 ? [{ color: 'bg-primary', value: v }] : []
          }))}
          valueFormatter={formatCompactDuration}
          emptyText="所选区间没有时段数据"
        />
      )
    })()}
  </CardContent>
</Card>
<Card>
  <CardHeader>
    <CardTitle>年度汇总</CardTitle>
  </CardHeader>
  <CardContent>
    {yearSummary === undefined ? (
      <div className="text-sm text-muted-foreground">加载中…</div>
    ) : yearSummary ? (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-md border border-border p-2.5">
          <div className="text-xs text-muted-foreground">{yearSummary.year} 年陪伴</div>
          <div className="mt-0.5 text-base font-semibold">{formatDuration(yearSummary.totalSeconds)}</div>
        </div>
        <div className="rounded-md border border-border p-2.5">
          <div className="text-xs text-muted-foreground">活跃天数</div>
          <div className="mt-0.5 text-base font-semibold">{yearSummary.activeDays} 天</div>
        </div>
        <div className="rounded-md border border-border p-2.5">
          <div className="text-xs text-muted-foreground">日均陪伴（活跃日）</div>
          <div className="mt-0.5 text-base font-semibold">{formatDuration(yearSummary.avgSecondsPerActiveDay)}</div>
        </div>
        <div className="rounded-md border border-border p-2.5">
          <div className="text-xs text-muted-foreground">最活跃日</div>
          <div className="mt-0.5 text-base font-semibold">{yearSummary.bestDay ? `${yearSummary.bestDay.date.slice(5)} · ${formatDuration(yearSummary.bestDay.seconds)}` : '—'}</div>
        </div>
        <div className="rounded-md border border-border p-2.5">
          <div className="text-xs text-muted-foreground">当前连续陪伴</div>
          <div className="mt-0.5 text-base font-semibold">{statsReport ? `${statsReport.streak} 天` : '—'}</div>
        </div>
      </div>
    ) : (
      <div className="text-sm text-muted-foreground">{new Date().getFullYear()} 年还没有记录</div>
    )}
  </CardContent>
</Card>
<Card>
  <CardHeader>
    <CardTitle>数据管理</CardTitle>
  </CardHeader>
  <CardContent className="space-y-2">
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => void handleExportCsv()}>导出 CSV（当前区间）</Button>
      {confirmClear ? (
        <>
          <Button size="sm" variant="destructive" onClick={() => void handleClearAll()}>确认清空全部统计</Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirmClear(false)}>取消</Button>
          <span className="text-xs text-destructive">将删除全部统计数据，不可恢复</span>
        </>
      ) : (
        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmClear(true)}>
          清空全部统计
        </Button>
      )}
    </div>
    {exportMsg && <div className="text-xs text-muted-foreground">{exportMsg}</div>}
  </CardContent>
</Card>
```

- [x] **Step 5: 首页卡片加 streak 行**

在首页「陪伴统计」卡片「今日状态分布」色带之后、卡片内容区末尾追加：

```tsx
<div className="text-xs text-muted-foreground">连续陪伴 {statsReport.streak} 天</div>
```

（若该位置已有其他内容，紧跟状态分布区块追加即可。）

- [x] **Step 6: 类型检查**

Run: `npm run typecheck:web`
Expected: 全绿（若 `YearSummary` 等类型未识别，检查 Task 3 Step 1 的 shared 类型已落地）

- [x] **Step 7: 构建**

Run: `npm run build`
Expected: 成功

---

### Task 5: 实机验证、文档与交付

**Files:**
- Modify: `CHANGELOG.md`、`docs/使用说明.md`（§2.11）、`docs/API设计.md`（新 IPC）、`docs/架构设计.md`（§10 + 路线图）、`package.json`
- Create: `backup/backup_20260805_v05-04/`

- [x] **Step 1: 实机驱动验证**

在 `src/main/index.ts` whenReady 末尾临时加驱动（验证后删除，参考 v0.5.0805.03 的调试驱动法）：

```ts
// ===== TEMP DEBUG DRIVER =====
setTimeout(() => {
  openCenter()
  setTimeout(async () => {
    const wc = centerWindow?.webContents
    if (!wc) return
    const run = (js: string) => wc.executeJavaScript(js).catch((e) => 'EXEC_ERR: ' + String(e))
    const driver = `(async () => {
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const btn = (t) => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === t);
      const lines = [];
      btn('统计')?.click(); await sleep(600);
      btn('查询')?.click(); await sleep(1200);
      lines.push('heatmap: ' + document.body.innerText.includes('月度热力图'));
      lines.push('heatmapCells: ' + document.querySelectorAll('button[title*="·"]').length);
      lines.push('hours24: ' + document.body.innerText.includes('24小时时段分布'));
      lines.push('yearCard: ' + document.body.innerText.includes('年度汇总'));
      lines.push('yearValue: ' + document.body.innerText.includes('年陪伴'));
      lines.push('streakHome: ' + document.body.innerText.includes('连续陪伴'));
      return lines.join('\\n');
    })()`
    const res = await run(driver)
    log('info', '[debug-driver] result:', res)
    const { writeFileSync } = await import('node:fs')
    const img = await wc.capturePage()
    writeFileSync(join(app.getPath('temp'), 'center-v0504.png'), img.toPNG())
    log('info', '[debug-driver] screenshot saved')
  }, 4000)
}, 3000)
```

验证要点（驱动输出逐条核对）：
1. `heatmap: true`（热力图卡片渲染）
2. `heatmapCells` > 0（日历格渲染，title 形如 `2026-08-05 · 1分钟`）
3. `hours24: true`（24h 卡片渲染）
4. `yearCard / yearValue: true`（年度汇总含数值）
5. `streakHome: true`（首页 streak 行）
6. 手动路径检查：导出对话框（`dialog.showSaveDialog` 弹窗后取消）、删除某天（选中某天后确认删除，刷新后格子变灰）、清空全部（二次确认后全 0）、重启后数据仍持久化
7. 检查 `%APPDATA%/desktop-pet/stats/2026-08-05.json` 含 `hours` 字段
8. **删除驱动代码**后重新 `npm run build`

- [x] **Step 2: 全量验证**

Run: `npm run typecheck` && `npm test` && `npm run build`
Expected: 全绿（227 + 3 + 15 ≈ 245 例）

- [x] **Step 3: 版本与 CHANGELOG**

`package.json` version → `0.5.0805.04`。

CHANGELOG 顶部新增：

```markdown
## v0.5.0805.04 (统计增强：热力图 / 24小时分布 / streak / 汇总 / 导出管理，开发版)

Date: 2026-08-05

新增：
- 数据模型：每日统计增加 `hours`（24 小时分段时长），旧文件加载自动补零兼容
- 月度热力图：按月日历格展示陪伴强度（4 档配色），月份自由切换；点击某天查看当天明细并可删除该天（二次确认）
- 24 小时时段分布：所选区间每小时累计时长柱状图（历史日期无时段数据，会显示提示）
- 连续陪伴 streak：首页陪伴统计卡片与统计页年度汇总显示「连续陪伴 X 天」（今天无记录从昨天起算）
- 年度汇总：本年总陪伴 / 活跃天数 / 日均（活跃日口径）/ 最活跃日
- 导出与管理：当前区间导出 CSV（主进程保存对话框）；清空全部统计（二次确认，防误触）
- 新 IPC：`stats:year` / `stats:exportCsv` / `stats:deleteDay` / `stats:clearAll`；`stats:report` 响应新增 `streak`；`stats:range` 校验逻辑抽取为可复用 `validateRange`（行为不变）

修复：
- 暂无

已知问题：
- 历史统计文件不含 `hours`，24 小时时段分布从本版本起记录
```

- [x] **Step 4: 文档同步**

- `docs/使用说明.md` §2.11：补充热力图 / 24h 分布 / streak / 年度汇总 / 导出与清空说明（含「清空不可恢复」警告）
- `docs/API设计.md`：新增 stats:year / stats:exportCsv / stats:deleteDay / stats:clearAll 契约（channel / 参数 / 返回 / 校验），StatsReport 增加 streak 字段
- `docs/架构设计.md` §10：记录方式补充 hours 分段；展示补充热力图等；路线图 v0.5 状态更新为「已完成（.01~.04）」
- `docs/架构设计.md` 第 7 节日志路径等无需改动

- [x] **Step 5: 备份**

```powershell
$dest = "C:\Users\30816\Desktop\桌宠\backup\backup_20260805_v05-04"
New-Item -ItemType Directory -Path $dest -Force | Out-Null
Copy-Item -Path "C:\Users\30816\Desktop\桌宠\src" -Destination "$dest\src" -Recurse
Copy-Item -Path "C:\Users\30816\Desktop\桌宠\docs" -Destination "$dest\docs" -Recurse
Copy-Item -Path "C:\Users\30816\Desktop\桌宠\CHANGELOG.md" -Destination "$dest\CHANGELOG.md"
Copy-Item -Path "C:\Users\30816\Desktop\桌宠\package.json" -Destination "$dest\package.json"
Copy-Item -Path "C:\Users\30816\Desktop\桌宠\package-lock.json" -Destination "$dest\package-lock.json"
```

- [x] **Step 6: 交付摘要**

向用户汇报：功能清单、验证结果（typecheck / 测试数 / build / 实机驱动要点）、版本与备份位置。
