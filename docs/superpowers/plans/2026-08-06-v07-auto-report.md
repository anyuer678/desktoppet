# v0.7 报告自动化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为桌宠应用实现定时周报/月报自动化（独立定时设置、分钟级触发、气泡+系统通知、错过静默补发）。

**Architecture:** 新增 `autoReports.json` 配置（独立 store）；纯函数判定触发/补发（`autoReport.ts`）；主进程分钟级 ticker；报告生成逻辑从 `stats:report:generate` handler 抽取为 `generateReportFile()` 供手动/自动共用；IPC 三通道（get/set/fired）。

**Tech Stack:** Electron + TypeScript + vitest（无新依赖）。

## Global Constraints

- 零新增依赖（spec §1）。
- 只读本地、不联网、主进程计算、纯函数可单测（spec §1）。
- 存储用 JS 惯例 `0=周日..6=周六`；UI 文案映射中文（spec §2）。
- 报告落盘目录不变：`文档/DesktopPet/报告/`（spec §5）。
- 周报文件名 `陪伴周报-<本周一>-<today>.md`、月报 `陪伴月报-<YYYY-MM>-<today>.md`（spec §5，向后兼容：手动生成按钮返回路径不变）。
- 到点触发 = 气泡 + 系统通知；错过补发 = 仅落盘（spec §4）。
- 版本 `v0.7.0806.01`；测试命令 `npm test`、typecheck `npm run typecheck`、build `npm run build`（package.json）。

---

### Task 1: 类型与配置存储（shared/ipc.ts + autoReportStore.ts）

**Files:**
- Modify: `src/shared/ipc.ts`（末尾追加类型）
- Create: `src/main/stats/autoReportStore.ts`
- Test: `src/main/stats/autoReportStore.test.ts`

**Interfaces:**
- Produces（本任务定义，后续任务消费）:
  - `AutoReportRule { enabled: boolean; dayOfWeek: number; dayOfMonth: number; time: string }`
  - `AutoReportConfig { weekly: AutoReportRule; monthly: AutoReportRule }`
  - `AutoReportFired { type: 'week' | 'month'; title: string; body: string }`
  - `AutoReportGetResult { ok: boolean; error?: string; config?: AutoReportConfig }`
  - `AutoReportSetResult { ok: boolean; error?: string }`
  - `DEFAULT_AUTO_REPORT_CONFIG: AutoReportConfig`
  - `loadAutoReports(filePath: string): AutoReportConfig`
  - `saveAutoReports(filePath: string, cfg: AutoReportConfig): void`
  - `validateAutoReportConfig(cfg: unknown): string | null`

- [ ] **Step 1: 在 shared/ipc.ts 末尾追加类型**

在 `StatsSpreadsheetResult`（文件末尾）之后追加：

```ts
/** 自动报告单条规则（周报用 dayOfWeek，月报用 dayOfMonth） */
export interface AutoReportRule {
  enabled: boolean
  /** 周报：0=周日..6=周六（JS getDay 惯例） */
  dayOfWeek: number
  /** 月报：1..31 */
  dayOfMonth: number
  /** HH:mm（24h，前导 0 必填） */
  time: string
}

/** 自动报告配置（持久化于 userData/autoReports.json） */
export interface AutoReportConfig {
  weekly: AutoReportRule
  monthly: AutoReportRule
}

/** autoReport:fired 事件（主进程 → 渲染层，气泡展示） */
export interface AutoReportFired {
  type: 'week' | 'month'
  title: string
  body: string
}

/** autoReport:get 返回 */
export interface AutoReportGetResult {
  ok: boolean
  error?: string
  config?: AutoReportConfig
}

/** autoReport:set 返回 */
export interface AutoReportSetResult {
  ok: boolean
  error?: string
}
```

- [ ] **Step 2: 写失败的测试**

`src/main/stats/autoReportStore.test.ts`：

```ts
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_AUTO_REPORT_CONFIG,
  loadAutoReports,
  saveAutoReports,
  validateAutoReportConfig
} from './autoReportStore'

describe('autoReportStore', () => {
  let dir: string
  let file: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'auto-report-'))
    file = join(dir, 'autoReports.json')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('默认值：全部 disabled，周报周日 21:00，月报每月 1 号 21:00', () => {
    expect(DEFAULT_AUTO_REPORT_CONFIG).toEqual({
      weekly: { enabled: false, dayOfWeek: 0, dayOfMonth: 1, time: '21:00' },
      monthly: { enabled: false, dayOfWeek: 0, dayOfMonth: 1, time: '21:00' }
    })
  })

  it('文件不存在 → 返回默认值', () => {
    expect(loadAutoReports(join(dir, 'missing.json'))).toEqual(DEFAULT_AUTO_REPORT_CONFIG)
  })

  it('非法 JSON → 返回默认值', () => {
    writeFileSync(file, '{broken', 'utf-8')
    expect(loadAutoReports(file)).toEqual(DEFAULT_AUTO_REPORT_CONFIG)
  })

  it('字段缺失 → 逐项补默认', () => {
    writeFileSync(file, JSON.stringify({ weekly: { enabled: true } }), 'utf-8')
    const cfg = loadAutoReports(file)
    expect(cfg.weekly.enabled).toBe(true)
    expect(cfg.weekly.dayOfWeek).toBe(0)
    expect(cfg.monthly).toEqual(DEFAULT_AUTO_REPORT_CONFIG.monthly)
  })

  it('save → load round-trip', () => {
    const cfg: AutoReportConfig = {
      weekly: { enabled: true, dayOfWeek: 6, time: '08:30', dayOfMonth: 1 },
      monthly: { enabled: true, dayOfWeek: 0, dayOfMonth: 15, time: '09:00' }
    }
    saveAutoReports(file, cfg)
    expect(JSON.parse(readFileSync(file, 'utf-8'))).toEqual(cfg)
    expect(loadAutoReports(file)).toEqual(cfg)
  })

  describe('validateAutoReportConfig', () => {
    it('合法配置 → null', () => {
      expect(validateAutoReportConfig(DEFAULT_AUTO_REPORT_CONFIG)).toBeNull()
    })
    it('dayOfWeek 越界拒绝', () => {
      expect(validateAutoReportConfig({
        weekly: { enabled: true, dayOfWeek: 7, dayOfMonth: 1, time: '21:00' },
        monthly: DEFAULT_AUTO_REPORT_CONFIG.monthly
      })).toBe('dayOfWeek 取值范围 0-6（周日=0）')
    })
    it('dayOfMonth 越界拒绝', () => {
      expect(validateAutoReportConfig({
        weekly: DEFAULT_AUTO_REPORT_CONFIG.weekly,
        monthly: { enabled: true, dayOfWeek: 0, dayOfMonth: 32, time: '21:00' }
      })).toBe('dayOfMonth 取值范围 1-31')
    })
    it('time 非 HH:mm 拒绝', () => {
      expect(validateAutoReportConfig({
        weekly: DEFAULT_AUTO_REPORT_CONFIG.weekly,
        monthly: { enabled: true, dayOfWeek: 0, dayOfMonth: 1, time: '9:00' }
      })).toBe('时间格式需为 HH:mm（24 小时制，含前导 0）')
    })
    it('enabled 非布尔拒绝', () => {
      expect(validateAutoReportConfig({
        weekly: { ...DEFAULT_AUTO_REPORT_CONFIG.weekly, enabled: 1 as unknown as boolean },
        monthly: DEFAULT_AUTO_REPORT_CONFIG.monthly
      })).toBe('enabled 必须为布尔')
    })
  })
})
```

- [ ] **Step 3: 运行确认失败**

Run: `npx vitest run src/main/stats/autoReportStore.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 4: 实现 autoReportStore.ts**

```ts
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import type { AutoReportConfig, AutoReportRule } from '../../shared/ipc'
import { isValidHHmm } from '../schedule/store'

export const DEFAULT_AUTO_REPORT_CONFIG: AutoReportConfig = {
  weekly: { enabled: false, dayOfWeek: 0, dayOfMonth: 1, time: '21:00' },
  monthly: { enabled: false, dayOfWeek: 0, dayOfMonth: 1, time: '21:00' }
}

function normalizeRule(raw: unknown, fallback: AutoReportRule): AutoReportRule {
  const r = raw as Partial<AutoReportRule> | null | undefined
  return {
    enabled: typeof r?.enabled === 'boolean' ? r.enabled : fallback.enabled,
    dayOfWeek: typeof r?.dayOfWeek === 'number' ? r.dayOfWeek : fallback.dayOfWeek,
    dayOfMonth: typeof r?.dayOfMonth === 'number' ? r.dayOfMonth : fallback.dayOfMonth,
    time: typeof r?.time === 'string' ? r.time : fallback.time
  }
}

export function loadAutoReports(filePath: string): AutoReportConfig {
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as Partial<AutoReportConfig>
    return {
      weekly: normalizeRule(raw.weekly, DEFAULT_AUTO_REPORT_CONFIG.weekly),
      monthly: normalizeRule(raw.monthly, DEFAULT_AUTO_REPORT_CONFIG.monthly)
    }
  } catch {
    return { ...DEFAULT_AUTO_REPORT_CONFIG }
  }
}

export function saveAutoReports(filePath: string, cfg: AutoReportConfig): void {
  try {
    mkdirSync(dirname(filePath), { recursive: true })
    writeFileSync(filePath, JSON.stringify(cfg, null, 2), 'utf-8')
  } catch (err) {
    console.error('[autoReport] save failed:', err)
  }
}

export function validateAutoReportConfig(cfg: unknown): string | null {
  if (!cfg || typeof cfg !== 'object') return '自动报告配置为空'
  const c = cfg as Record<string, unknown>
  for (const key of ['weekly', 'monthly']) {
    const rule = c[key] as Record<string, unknown> | null | undefined
    if (!rule || typeof rule !== 'object') return `${key} 配置缺失`
    if (typeof rule.enabled !== 'boolean') return 'enabled 必须为布尔'
    if (typeof rule.dayOfWeek !== 'number' || !Number.isInteger(rule.dayOfWeek) || rule.dayOfWeek < 0 || rule.dayOfWeek > 6) {
      return 'dayOfWeek 取值范围 0-6（周日=0）'
    }
    if (typeof rule.dayOfMonth !== 'number' || !Number.isInteger(rule.dayOfMonth) || rule.dayOfMonth < 1 || rule.dayOfMonth > 31) {
      return 'dayOfMonth 取值范围 1-31'
    }
    if (typeof rule.time !== 'string' || !isValidHHmm(rule.time)) {
      return '时间格式需为 HH:mm（24 小时制，含前导 0）'
    }
  }
  return null
}
```

- [ ] **Step 5: 运行确认通过**

Run: `npx vitest run src/main/stats/autoReportStore.test.ts`
Expected: 7 pass

- [ ] **Step 6: typecheck**

Run: `npm run typecheck`
Expected: 通过

- [ ] **Step 7: Commit**

```bash
git add src/shared/ipc.ts src/main/stats/autoReportStore.ts src/main/stats/autoReportStore.test.ts
git commit -m "feat(stats): auto report config types + store (v0.7)"
```

---

### Task 2: 抽取 generateReportFile（report.ts 重构）

**Files:**
- Modify: `src/main/stats/report.ts`（追加函数）
- Modify: `src/main/stats/report.test.ts`
- Modify: `src/main/index.ts:680-723`（handler 改调新函数）

**Interfaces:**
- Consumes: `PeriodCompareResult`（shared/ipc）、`buildReportMarkdown`、`comparePeriods`（本文件）
- Produces:
  - `weeklyReportKey(today: string): string`（本周一 YYYY-MM-DD）
  - `monthlyReportKey(today: string): string`（YYYY-MM）
  - `generateReportFile(input: { dir: string; mode: 'week' | 'month'; today?: string }): { path: string }`（生成 Markdown 并落盘 `文档/DesktopPet/报告/陪伴周报-<key>-<today>.md`）

- [ ] **Step 1: 写失败的测试（追加到 report.test.ts）**

```ts
describe('generateReportFile', () => {
  it('周报：文件名含本周一周期键与今天，内容含标题与区间', () => {
    const dir = mkdtempSync(join(tmpdir(), 'report-gen-'))
    try {
      const today = '2026-08-06'
      const out = generateReportFile({ dir, mode: 'week', today })
      expect(out.path.endsWith(`陪伴周报-2026-08-03-${today}.md`)).toBe(true)
      const md = readFileSync(out.path, 'utf-8')
      expect(md).toContain('# 陪伴周报')
      expect(md).toContain('2026-08-03 至 2026-08-06')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('月报：文件名含 YYYY-MM 周期键', () => {
    const dir = mkdtempSync(join(tmpdir(), 'report-gen-'))
    try {
      const out = generateReportFile({ dir, mode: 'month', today: '2026-08-06' })
      expect(out.path.endsWith(`陪伴月报-2026-08-2026-08-06.md`)).toBe(true)
      expect(readFileSync(out.path, 'utf-8')).toContain('# 陪伴月报')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/main/stats/report.test.ts`
Expected: FAIL（generateReportFile 不存在）

- [ ] **Step 3: 实现 generateReportFile**

在 `report.ts` 末尾追加（复用现有区间推导，全部从主进程 index.ts 对应代码搬入）：

```ts
import { mkdirSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { app } from 'electron'
import { loadDailyRange, todayStr } from './dailyStats'

function weekStartOf(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const dow = d.getDay()
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - (dow === 0 ? 6 : dow - 1))
  return todayStr(monday)
}

function monthStartOf(dateStr: string): string {
  return dateStr.slice(0, 8) + '01'
}

function monthEndOf(monthStart: string): string {
  const y = Number(monthStart.slice(0, 4))
  const m = Number(monthStart.slice(5, 7))
  return todayStr(new Date(y, m, 0))
}

/** 周报周期键：本周一（YYYY-MM-DD） */
export function weeklyReportKey(today: string): string {
  return weekStartOf(today)
}

/** 月报周期键：YYYY-MM */
export function monthlyReportKey(today: string): string {
  return today.slice(0, 7)
}

/** 生成周报/月报并落盘；返回文件路径 */
export function generateReportFile(input: {
  dir: string
  mode: 'week' | 'month'
  today?: string
}): { path: string } {
  const today = input.today ?? todayStr()
  const cS = input.mode === 'week' ? weekStartOf(today) : monthStartOf(today)
  const weekAgo = new Date(new Date(today + 'T00:00:00').getTime() - 7 * 86400000)
  const monthAgo = new Date(new Date(today + 'T00:00:00').getTime() - 86400000 * 30)
  const weekAgoStr = todayStr(weekAgo)
  const monthAgoStr = todayStr(monthAgo)
  const ps = input.mode === 'week' ? weekStartOf(weekAgoStr) : monthStartOf(monthAgoStr)
  const pe =
    input.mode === 'week'
      ? todayStr(new Date(new Date(weekStartOf(today) + 'T00:00:00').getTime() - 86400000))
      : monthEndOf(monthStartOf(monthAgoStr))
  const cmp = comparePeriods(input.dir, '', cS, today, ps, pe)
  const topEvents = (() => {
    const ev: Record<string, number> = {}
    for (const d of loadDailyRange(input.dir, cS, today)) {
      if (!d.present) continue
      for (const [k, v] of Object.entries(d.stats.events)) ev[k] = (ev[k] ?? 0) + v
    }
    return Object.entries(ev).sort((a, b) => b[1] - a[1]).slice(0, 5) as [string, number][]
  })()
  const md = buildReportMarkdown({
    title: input.mode === 'week' ? '陪伴周报' : '陪伴月报',
    generatedAt: new Date().toLocaleString('zh-CN'),
    range: `${cS} 至 ${today}`,
    previousRange: `${ps} 至 ${pe}`,
    compare: cmp,
    topEvents
  })
  const dir = join(app.getPath('documents'), 'DesktopPet', '报告')
  const file = join(dir, `陪伴${input.mode === 'week' ? '周报' : '月报'}-${input.mode === 'week' ? weeklyReportKey(today) : monthlyReportKey(today)}-${today}.md`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(file, md, 'utf-8')
  return { path: file }
}
```

注意：测试中 `dir` 参数仅用于加载统计数据，落盘目录固定为 `app.getPath('documents')` 下；测试断言文件名与内容，不依赖落盘目录可写性以外的环境（app.getPath 在 vitest node 环境无 app → 需要在测试中 mock）。若 mock 不便，改为 generateReportFile 的落盘目录也由参数传入（`outputDir`），主进程传 `join(app.getPath('documents'), 'DesktopPet', '报告')`：

```ts
export function generateReportFile(input: {
  dir: string
  outputDir: string
  mode: 'week' | 'month'
  today?: string
}): { path: string }
```

（**采用后者**：`outputDir` 参数化，测试传临时目录，零 Electron 依赖，符合纯函数原则。测试断言 `out.path` 以 `陪伴周报-2026-08-03-2026-08-06.md` 结尾，且位于 outputDir 内。）

- [ ] **Step 4: 更新测试断言使用 outputDir**

将 Step 1 测试改为 `generateReportFile({ dir, outputDir: tmpOut, mode: 'week', today })`，其中 `tmpOut = mkdtempSync(...)`，断言 `out.path === join(tmpOut, '陪伴周报-2026-08-03-2026-08-06.md')`。

- [ ] **Step 5: 运行确认通过**

Run: `npx vitest run src/main/stats/report.test.ts`
Expected: 现有 4 例 + 新 2 例全 pass

- [ ] **Step 6: 改造 handler（src/main/index.ts:680-723）**

将 `stats:report:generate` handler 主体替换为：

```ts
ipcMain.handle('stats:report:generate', async (_e, mode: unknown) => {
  const m = mode === 'month' ? 'month' : mode === 'week' ? 'week' : null
  if (!m) return { ok: false, error: 'mode 应为 week 或 month' }
  try {
    const { path } = generateReportFile({
      dir: statsDir,
      outputDir: join(app.getPath('documents'), 'DesktopPet', '报告'),
      mode: m
    })
    log('info', '[stats:report:generate] saved', path)
    return { ok: true, path }
  } catch (err) {
    log('error', '[stats:report:generate]', err)
    return { ok: false, error: '报告写入失败' }
  }
})
```

删除已搬走的 weekStart/monthStart/monthEnd 局部函数（若 handler 外无其他使用），并更新 import（report.ts 导出 generateReportFile）。

- [ ] **Step 7: typecheck + 全量测试**

Run: `npm run typecheck; npm test`
Expected: typecheck 通过；260+2 全绿

- [ ] **Step 8: Commit**

```bash
git add src/main/stats/report.ts src/main/stats/report.test.ts src/main/index.ts
git commit -m "refactor(stats): extract generateReportFile for manual/auto reuse (v0.7)"
```

---

### Task 3: 触发与补发纯函数（autoReport.ts）

**Files:**
- Create: `src/main/stats/autoReport.ts`
- Test: `src/main/stats/autoReport.test.ts`

**Interfaces:**
- Consumes: `AutoReportConfig`（shared/ipc）、`weeklyReportKey`/`monthlyReportKey`（report.ts）
- Produces:
  - `hhmmOf(now: Date): string`
  - `isPastTriggerTime(time: string, now: Date): boolean`
  - `shouldFireWeekly(cfg: AutoReportConfig, now: Date): boolean`
  - `shouldFireMonthly(cfg: AutoReportConfig, now: Date): boolean`
  - `shouldCatchUpWeekly(cfg: AutoReportConfig, now: Date, reportExists: (key: string) => boolean): boolean`
  - `shouldCatchUpMonthly(cfg: AutoReportConfig, now: Date, reportExists: (key: string) => boolean): boolean`

- [ ] **Step 1: 写失败的测试**

`src/main/stats/autoReport.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import type { AutoReportConfig } from '../../shared/ipc'
import {
  hhmmOf,
  isPastTriggerTime,
  shouldCatchUpMonthly,
  shouldCatchUpWeekly,
  shouldFireMonthly,
  shouldFireWeekly
} from './autoReport'

const cfg: AutoReportConfig = {
  weekly: { enabled: true, dayOfWeek: 0, dayOfMonth: 1, time: '21:00' },
  monthly: { enabled: true, dayOfWeek: 0, dayOfMonth: 1, time: '09:00' }
}
const now = (s: string): Date => new Date(s + ':00')

describe('hhmmOf', () => {
  it('返回 HH:mm', () => {
    expect(hhmmOf(new Date(2026, 7, 6, 8, 5, 30))).toBe('08:05')
  })
})

describe('isPastTriggerTime', () => {
  it('同分钟视为已过', () => {
    expect(isPastTriggerTime('21:00', now('2026-08-06T21:00'))).toBe(true)
  })
  it('未到时间 → false', () => {
    expect(isPastTriggerTime('21:00', now('2026-08-06T20:59'))).toBe(false)
  })
  it('已过 → true', () => {
    expect(isPastTriggerTime('21:00', now('2026-08-06T21:01'))).toBe(true)
  })
})

describe('shouldFireWeekly', () => {
  it('命中：星期与时间匹配', () => {
    expect(shouldFireWeekly(cfg, now('2026-08-02T21:00'))).toBe(true) // 2026-08-02 是周日
  })
  it('星期不符 → false', () => {
    expect(shouldFireWeekly(cfg, now('2026-08-03T21:00'))).toBe(false)
  })
  it('时间不符 → false', () => {
    expect(shouldFireWeekly(cfg, now('2026-08-02T21:01'))).toBe(false)
  })
  it('禁用 → false', () => {
    expect(shouldFireWeekly({ ...cfg, weekly: { ...cfg.weekly, enabled: false } }, now('2026-08-02T21:00'))).toBe(false)
  })
})

describe('shouldFireMonthly', () => {
  it('命中：日与时间匹配', () => {
    expect(shouldFireMonthly(cfg, now('2026-08-01T09:00'))).toBe(true)
  })
  it('日期不符 → false', () => {
    expect(shouldFireMonthly(cfg, now('2026-08-02T09:00'))).toBe(false)
  })
  it('31 号在无 31 日的月份永不触发', () => {
    const c = { ...cfg, monthly: { ...cfg.monthly, dayOfMonth: 31 } }
    expect(shouldFireMonthly(c, now('2026-09-30T09:00'))).toBe(false)
  })
  it('禁用 → false', () => {
    expect(shouldFireMonthly({ ...cfg, monthly: { ...cfg.monthly, enabled: false } }, now('2026-08-01T09:00'))).toBe(false)
  })
})

describe('shouldCatchUpWeekly', () => {
  const exists = (key: string): boolean => key === '2026-08-03' // 本周一
  it('已过触发点且本周未生成 → true', () => {
    expect(shouldCatchUpWeekly(cfg, now('2026-08-06T21:05'), exists)).toBe(true)
  })
  it('今日未到触发点 → false', () => {
    expect(shouldCatchUpWeekly(cfg, now('2026-08-06T20:59'), exists)).toBe(false)
  })
  it('本周已生成 → false', () => {
    expect(shouldCatchUpWeekly(cfg, now('2026-08-06T21:05'), () => true)).toBe(false)
  })
  it('触发点是今天且未到点 → false', () => {
    expect(shouldCatchUpWeekly(cfg, now('2026-08-02T20:59'), exists)).toBe(false)
  })
})

describe('shouldCatchUpMonthly', () => {
  const exists = (key: string): boolean => key === '2026-08'
  it('已过触发点且本月未生成 → true', () => {
    expect(shouldCatchUpMonthly(cfg, now('2026-08-15T09:05'), exists)).toBe(true)
  })
  it('本月已生成 → false', () => {
    expect(shouldCatchUpMonthly(cfg, now('2026-08-15T09:05'), () => true)).toBe(false)
  })
  it('未到触发点 → false', () => {
    expect(shouldCatchUpMonthly(cfg, now('2026-08-01T08:59'), exists)).toBe(false)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/main/stats/autoReport.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 autoReport.ts**

```ts
import type { AutoReportConfig } from '../../shared/ipc'
import { monthlyReportKey, weeklyReportKey } from './report'

/** 取 HH:mm（补前导 0） */
export function hhmmOf(now: Date): string {
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

/** now 的时分是否 >= time（字符串比较，HH:mm 定宽） */
export function isPastTriggerTime(time: string, now: Date): boolean {
  return hhmmOf(now) >= time
}

export function shouldFireWeekly(cfg: AutoReportConfig, now: Date): boolean {
  const w = cfg.weekly
  if (!w.enabled) return false
  if (now.getDay() !== w.dayOfWeek) return false
  return hhmmOf(now) === w.time
}

export function shouldFireMonthly(cfg: AutoReportConfig, now: Date): boolean {
  const m = cfg.monthly
  if (!m.enabled) return false
  if (now.getDate() !== m.dayOfMonth) return false
  return hhmmOf(now) === m.time
}

/** 错过补发判定（周报）：本周期未生成 && 今日已过触发时间（周期键=本周一） */
export function shouldCatchUpWeekly(
  cfg: AutoReportConfig,
  now: Date,
  reportExists: (key: string) => boolean
): boolean {
  const w = cfg.weekly
  if (!w.enabled) return false
  if (!isPastTriggerTime(w.time, now)) return false
  return !reportExists(weeklyReportKey(now))
}

/** 错过补发判定（月报）：本周期未生成 && 今日已过触发时间（周期键=YYYY-MM） */
export function shouldCatchUpMonthly(
  cfg: AutoReportConfig,
  now: Date,
  reportExists: (key: string) => boolean
): boolean {
  const m = cfg.monthly
  if (!m.enabled) return false
  if (!isPastTriggerTime(m.time, now)) return false
  return !reportExists(monthlyReportKey(now))
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/main/stats/autoReport.test.ts`
Expected: 16 pass

- [ ] **Step 5: typecheck**

Run: `npm run typecheck`
Expected: 通过

- [ ] **Step 6: Commit**

```bash
git add src/main/stats/autoReport.ts src/main/stats/autoReport.test.ts
git commit -m "feat(stats): auto report fire/catch-up pure functions (v0.7)"
```

---

### Task 4: 主进程接入（IPC + 分钟级 ticker + 启动补发）

**Files:**
- Create: `src/main/stats/autoReportTicker.ts`
- Test: `src/main/stats/autoReportTicker.test.ts`
- Modify: `src/main/index.ts`

**Interfaces:**
- Consumes: `shouldFireWeekly/Monthly`（autoReport.ts）、`AutoReportConfig`（shared/ipc）、`AutoReportFired`、`Notification`（Electron）
- Produces:
  - `createAutoReportTicker(opts: { getConfig: () => AutoReportConfig; now?: () => Date; onWeeklyFire: () => void; onMonthlyFire: () => void }): { tick(now?: Date): void; start(): void; stop(): void }`

- [ ] **Step 1: 写失败的测试（src/main/stats/autoReportTicker.test.ts）**

```ts
import { describe, expect, it, vi } from 'vitest'
import type { AutoReportConfig } from '../../shared/ipc'
import { createAutoReportTicker } from './autoReportTicker'

const cfg: AutoReportConfig = {
  weekly: { enabled: true, dayOfWeek: 0, dayOfMonth: 1, time: '21:00' },
  monthly: { enabled: true, dayOfWeek: 0, dayOfMonth: 1, time: '09:00' }
}

describe('createAutoReportTicker', () => {
  it('命中周报 → onWeeklyFire 一次，月报不触发', () => {
    const weekly = vi.fn()
    const monthly = vi.fn()
    const t = createAutoReportTicker({ getConfig: () => cfg, onWeeklyFire: weekly, onMonthlyFire: monthly })
    t.tick(new Date('2026-08-02T21:00:00'))
    expect(weekly).toHaveBeenCalledTimes(1)
    expect(monthly).not.toHaveBeenCalled()
  })

  it('命中月报 → onMonthlyFire 一次', () => {
    const weekly = vi.fn()
    const monthly = vi.fn()
    const t = createAutoReportTicker({ getConfig: () => cfg, onWeeklyFire: weekly, onMonthlyFire: monthly })
    t.tick(new Date('2026-08-01T09:00:00'))
    expect(monthly).toHaveBeenCalledTimes(1)
    expect(weekly).not.toHaveBeenCalled()
  })

  it('同一分钟多次 tick 只触发一次（防重复）', () => {
    const weekly = vi.fn()
    const t = createAutoReportTicker({ getConfig: () => cfg, onWeeklyFire: weekly, onMonthlyFire: vi.fn() })
    t.tick(new Date('2026-08-02T21:00:00'))
    t.tick(new Date('2026-08-02T21:00:30'))
    expect(weekly).toHaveBeenCalledTimes(1)
  })

  it('下一个周期继续可触发', () => {
    const weekly = vi.fn()
    const t = createAutoReportTicker({ getConfig: () => cfg, onWeeklyFire: weekly, onMonthlyFire: vi.fn() })
    t.tick(new Date('2026-08-02T21:00:00'))
    t.tick(new Date('2026-08-09T21:00:00'))
    expect(weekly).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/main/stats/autoReportTicker.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 autoReportTicker.ts**

```ts
import type { AutoReportConfig } from '../../shared/ipc'
import { shouldFireMonthly, shouldFireWeekly } from './autoReport'

export interface AutoReportTickerOptions {
  getConfig: () => AutoReportConfig
  now?: () => Date
  onWeeklyFire: () => void
  onMonthlyFire: () => void
}

/** 分钟级自动报告调度：tick 判定命中即回调（同一分钟内防重复，仿 scheduler） */
export function createAutoReportTicker(options: AutoReportTickerOptions): {
  tick(now?: Date): void
  start(): void
  stop(): void
} {
  const nowFn = options.now ?? (() => new Date())
  let lastFiredMinute = -1
  let timer: NodeJS.Timeout | null = null

  const tick = (now: Date = nowFn()): void => {
    const minuteKey = now.getTime() - (now.getTime() % 60_000)
    if (minuteKey === lastFiredMinute) return
    const cfg = options.getConfig()
    if (shouldFireWeekly(cfg, now)) {
      lastFiredMinute = minuteKey
      options.onWeeklyFire()
      return
    }
    if (shouldFireMonthly(cfg, now)) {
      lastFiredMinute = minuteKey
      options.onMonthlyFire()
    }
  }

  return {
    tick,
    start: () => {
      if (timer) return
      timer = setInterval(() => tick(), 60_000)
    },
    stop: () => {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    }
  }
}
```

注意：测试 3 期望「同一分钟不重复触发」，用注入的 now 序列验证（间隔 30s 同分钟）；`lastFiredMinute` 跨周期复位由分钟变化自然达成（测试 4 间隔 7 天）。

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/main/stats/autoReportTicker.test.ts`
Expected: 4 pass

- [ ] **Step 5: 主进程接入（src/main/index.ts）**

新增 import：

```ts
import { Notification } from 'electron'
import { generateReportFile, monthlyReportKey, weeklyReportKey } from './stats/report'
import { shouldCatchUpMonthly, shouldCatchUpWeekly } from './stats/autoReport'
import { createAutoReportTicker } from './stats/autoReportTicker'
import { loadAutoReports, saveAutoReports, validateAutoReportConfig, DEFAULT_AUTO_REPORT_CONFIG } from './stats/autoReportStore'
import type { AutoReportConfig, AutoReportFired } from '../shared/ipc'
```

模块级变量（靠近 `let statsDir`）：

```ts
let autoReportCfg: AutoReportConfig = { ...DEFAULT_AUTO_REPORT_CONFIG }
let autoReportFile = ''
let autoReportTicker: ReturnType<typeof createAutoReportTicker> | null = null
```

注册 IPC handler（放在 stats:report:generate 之后）：

```ts
ipcMain.handle('autoReport:get', () => ({ ok: true, config: autoReportCfg }))
ipcMain.handle('autoReport:set', (_e, cfg: unknown) => {
  const err = validateAutoReportConfig(cfg)
  if (err) return { ok: false, error: err }
  autoReportCfg = cfg as AutoReportConfig
  saveAutoReports(autoReportFile, autoReportCfg)
  return { ok: true }
})
```

报告生成 + 提醒辅助函数（模块级，供 ticker 与 catch-up 共用）：

```ts
function generateAutoReport(mode: 'week' | 'month', silent: boolean): void {
  try {
    const { path } = generateReportFile({
      dir: statsDir,
      outputDir: join(app.getPath('documents'), 'DesktopPet', '报告'),
      mode
    })
    log('info', `[autoReport:${mode}] saved`, path)
    if (silent) return
    const title = mode === 'week' ? '陪伴周报已生成' : '陪伴月报已生成'
    const body = path
    notifyPet('autoReport:fired', { type: mode, title, body } satisfies AutoReportFired)
    notifyCenter('autoReport:fired', { type: mode, title, body } satisfies AutoReportFired)
    try {
      new Notification({ title, body }).show()
    } catch (err) {
      log('error', '[autoReport] notification failed', err)
    }
  } catch (err) {
    log('error', `[autoReport:${mode}]`, err)
  }
}
```

启动时补发 + 启动 ticker（在 scheduler 启动附近，`scheduleLoadDone` 之后；启动顺序：先 loadAutoReports 文件，再执行 catch-up，最后 start ticker）：

```ts
function startAutoReports(): void {
  autoReportFile = join(app.getPath('userData'), 'autoReports.json')
  autoReportCfg = loadAutoReports(autoReportFile)
  const reportDir = join(app.getPath('documents'), 'DesktopPet', '报告')
  const reportExists = (key: string, prefix: string): boolean => {
    try {
      const files = readdirSync(reportDir)
      return files.some((f) => f.startsWith(prefix) && f.includes(key))
    } catch {
      return false
    }
  }
  const now = new Date()
  if (shouldCatchUpWeekly(autoReportCfg, now, (k) => reportExists(k, '陪伴周报-'))) {
    generateAutoReport('week', true)
  }
  if (shouldCatchUpMonthly(autoReportCfg, now, (k) => reportExists(k, '陪伴月报-'))) {
    generateAutoReport('month', true)
  }
  autoReportTicker = createAutoReportTicker({
    getConfig: () => autoReportCfg,
    onWeeklyFire: () => generateAutoReport('week', false),
    onMonthlyFire: () => generateAutoReport('month', false)
  })
  autoReportTicker.start()
  log('info', '[autoReport] started', JSON.stringify(autoReportCfg))
}
```

- 在 app 启动主流程调用 `startAutoReports()`；确保 `readdirSync` 已从 fs 导入。
- 说明：`reportExists` 用前缀+周期键匹配（如 `陪伴周报-2026-08-03-`），与 generateReportFile 的命名一致；readdir 失败（目录不存在）返回 false 触发补发——但 generateReportFile 会先 mkdir，属正常。

- [ ] **Step 6: typecheck + 全量测试**

Run: `npm run typecheck; npm test`
Expected: 全绿

- [ ] **Step 7: 实机冒烟（可选，若环境允许）**

Run: `npm run build`；启动应用，检查日志出现 `[autoReport] started` 且无错误。

- [ ] **Step 8: Commit**

```bash
git add src/main/stats/autoReportTicker.ts src/main/stats/autoReportTicker.test.ts src/main/index.ts
git commit -m "feat(stats): auto report main-process ticker + IPC + catch-up (v0.7)"
```

---

### Task 5: preload 与类型声明

**Files:**
- Modify: `src/preload/index.ts`（stats 区块后新增 autoReport）
- Modify: `src/preload/index.d.ts`
- Modify: `src/renderer/...`（如 PetApp/CenterApp 所在 .d.ts 或 window 声明处，跟随现有 events 声明）

**Interfaces:**
- Consumes: `AutoReportConfig/AutoReportFired/AutoReportGetResult/AutoReportSetResult`（shared/ipc）
- Produces: `window.desktopPet.autoReport.get()/set()`、`window.desktopPet.events.onAutoReportFired(cb)`

- [ ] **Step 1: 扩展 preload/index.ts**

在 `stats` 区块之后新增（仿 schedule/stats 风格）：

```ts
autoReport: {
  get: (): Promise<AutoReportGetResult> => ipcRenderer.invoke('autoReport:get'),
  set: (config: AutoReportConfig): Promise<AutoReportSetResult> =>
    ipcRenderer.invoke('autoReport:set', config)
},
```

在 `events` 区块 `onScheduleFired` 之后新增：

```ts
onAutoReportFired: (cb: (fired: AutoReportFired) => void): (() => void) => {
  const handler = (_e: Electron.IpcRendererEvent, fired: AutoReportFired): void => cb(fired)
  ipcRenderer.on('autoReport:fired', handler)
  return () => ipcRenderer.removeListener('autoReport:fired', handler)
},
```

- [ ] **Step 2: 更新 preload/index.d.ts**（镜像上述签名；import 补充 AutoReportConfig/AutoReportFired/AutoReportGetResult/AutoReportSetResult）

- [ ] **Step 3: 同步 window 类型声明（PetApp/CenterApp 所在 .d.ts）**——若项目对 window.desktopPet 有独立 d.ts，同步补 autoReport 与 events.onAutoReportFired 签名。

- [ ] **Step 4: typecheck**

Run: `npm run typecheck`
Expected: 通过

- [ ] **Step 5: Commit**

```bash
git add src/preload/index.ts src/preload/index.d.ts
git commit -m "feat(preload): expose autoReport API (v0.7)"
```

---

### Task 6: PetApp 气泡

**Files:**
- Modify: `src/renderer/src/pet/PetApp.tsx`

**Interfaces:**
- Consumes: `window.desktopPet.events.onAutoReportFired`、现有 `setSpeech`/`speechTimer` 气泡机制

- [ ] **Step 1: 添加监听**

在 `onScheduleFired` useEffect（PetApp.tsx ~136-147）之后新增：

```tsx
useEffect(() => {
  return window.desktopPet.events.onAutoReportFired((fired) => {
    const text = `${fired.title}：${fired.body}`
    lastSpeechText.current = text
    setSpeech({ key: 'autoReport', text })
    if (speechTimer.current) clearTimeout(speechTimer.current)
    speechTimer.current = setTimeout(() => setSpeech(null), 8000)
  })
}, [])
```

- [ ] **Step 2: typecheck + 全量测试**

Run: `npm run typecheck; npm test`
Expected: 通过

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/pet/PetApp.tsx
git commit -m "feat(pet): auto report fired bubble (v0.7)"
```

---

### Task 7: CenterApp 自动报告设置卡

**Files:**
- Modify: `src/renderer/src/center/CenterApp.tsx`

**Interfaces:**
- Consumes: `window.desktopPet.autoReport.get()/set()`、`AutoReportConfig`、现有 Card/CardHeader/CardTitle/CardContent/Button/Input/Select 组件与 `cn` 工具（沿用数据管理卡样式）

- [ ] **Step 1: 状态与加载**

在数据管理卡所在组件（stats tab 区块）新增 state：

```tsx
const [autoReportCfg, setAutoReportCfg] = useState<AutoReportConfig | null>(null)
const [autoReportMsg, setAutoReportMsg] = useState('')
const [autoReportSaving, setAutoReportSaving] = useState(false)
```

在 stats 数据加载 effect 中补充：

```tsx
void window.desktopPet.autoReport.get().then((res) => {
  if (res.ok && res.config) setAutoReportCfg(res.config)
})
```

- [ ] **Step 2: 保存函数**

```tsx
const handleAutoReportSave = async (): Promise<void> => {
  if (!autoReportCfg) return
  setAutoReportSaving(true)
  try {
    const res = await window.desktopPet.autoReport.set(autoReportCfg)
    setAutoReportMsg(res.ok ? '已保存' : `保存失败：${res.error ?? ''}`)
  } finally {
    setAutoReportSaving(false)
  }
}
```

- [ ] **Step 3: 渲染卡片**

在「数据管理」Card（CenterApp.tsx ~2393-2417）之后新增：

```tsx
<Card>
  <CardHeader>
    <CardTitle>自动报告</CardTitle>
  </CardHeader>
  <CardContent className="space-y-3">
    {autoReportCfg ? (
      <>
        <div className="flex items-center justify-between gap-2">
          <label className="text-sm">周报</label>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={autoReportCfg.weekly.enabled}
              onChange={(e) =>
                setAutoReportCfg((p) => (p ? { ...p, weekly: { ...p.weekly, enabled: e.target.checked } } : p))
              }
            />
            <select
              className="rounded border px-2 py-1 text-sm"
              value={autoReportCfg.weekly.dayOfWeek}
              onChange={(e) =>
                setAutoReportCfg((p) =>
                  p ? { ...p, weekly: { ...p.weekly, dayOfWeek: Number(e.target.value) } } : p
                )
              }
            >
              {['周日', '周一', '周二', '周三', '周四', '周五', '周六'].map((label, i) => (
                <option key={i} value={i}>{label}</option>
              ))}
            </select>
            <input
              type="time"
              className="rounded border px-2 py-1 text-sm"
              value={autoReportCfg.weekly.time}
              onChange={(e) =>
                setAutoReportCfg((p) => (p ? { ...p, weekly: { ...p.weekly, time: e.target.value } } : p))
              }
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <label className="text-sm">月报</label>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={autoReportCfg.monthly.enabled}
              onChange={(e) =>
                setAutoReportCfg((p) => (p ? { ...p, monthly: { ...p.monthly, enabled: e.target.checked } } : p))
              }
            />
            <input
              type="number"
              min={1}
              max={31}
              className="w-16 rounded border px-2 py-1 text-sm"
              value={autoReportCfg.monthly.dayOfMonth}
              onChange={(e) =>
                setAutoReportCfg((p) =>
                  p ? { ...p, monthly: { ...p.monthly, dayOfMonth: Number(e.target.value) } } : p
                )
              }
            />
            <span className="text-xs text-muted-foreground">日</span>
            <input
              type="time"
              className="rounded border px-2 py-1 text-sm"
              value={autoReportCfg.monthly.time}
              onChange={(e) =>
                setAutoReportCfg((p) => (p ? { ...p, monthly: { ...p.monthly, time: e.target.value } } : p))
              }
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => void handleAutoReportSave()} disabled={autoReportSaving}>
            {autoReportSaving ? '保存中…' : '保存'}
          </Button>
          {autoReportMsg && <span className="text-xs text-muted-foreground">{autoReportMsg}</span>}
        </div>
      </>
    ) : (
      <div className="text-sm text-muted-foreground">加载中…</div>
    )}
  </CardContent>
</Card>
```

- [ ] **Step 4: typecheck + 全量测试 + build**

Run: `npm run typecheck; npm test; npm run build`
Expected: 全绿

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/center/CenterApp.tsx
git commit -m "feat(center): auto report settings card (v0.7)"
```

---

### Task 8: 文档、版本、备份与收官

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `package.json`（version → 0.7.0806.01）
- Modify: `docs/使用说明.md`（新增「自动报告」章节）
- Modify: `docs/API设计.md`（新增 autoReport:get/set/fired 与 preload API）
- Modify: `docs/架构设计.md`（§9 路线图 v0.7 状态）
- 备份目录：`backup/backup_20260806_v07-01/`

- [ ] **Step 1: CHANGELOG 新增条目**

顶部新增 `## v0.7.0806.01（2026-08-06）报告自动化`：新增（独立自动报告配置 autoReports.json、周/月报定时触发、气泡+系统通知、错过静默补发；重构 generateReportFile 复用；IPC autoReport:get/set/fired）；修复节可空；记录 275 测试全绿（以实际为准）。

- [ ] **Step 2: 版本号**

package.json `"version": "0.7.0806.01"`。

- [ ] **Step 3: 文档同步**

使用说明新增「自动报告」小节（启用方式、触发时刻、补发行为、报告位置）；API 设计新增 autoReport 通道与事件；架构设计 §9 路线图 v0.7 行更新为「报告自动化（.0806.01）」并保留未做候选（多设备同步、HTML/PDF 导出）。

- [ ] **Step 4: 最终验证**

Run: `npm run typecheck; npm test; npm run build`
Expected: 全绿（以实际测试数为准，记录于 CHANGELOG）

- [ ] **Step 5: 备份**

```bash
# 复制 src/docs/CHANGELOG/package.json/package-lock.json 到 backup/backup_20260806_v07-01/
# （沿用 v0.6 备份脚本模式）
```

- [ ] **Step 6: Commit**

```bash
git add CHANGELOG.md package.json docs/使用说明.md docs/API设计.md docs/架构设计.md
git commit -m "docs: v0.7.0806.01 release notes + roadmap (v0.7)"
```

---

## Self-Review

**Spec 覆盖：**
- 独立定时设置（§3）→ Task 1（store + validate）+ Task 7（UI）✓
- 分钟级触发（§4）→ Task 3（纯函数）+ Task 4（ticker 60s）✓
- 气泡 + 系统通知（§4）→ Task 4（generateAutoReport 双通道）+ Task 6（PetApp）✓
- 错过静默补发（§4.1）→ Task 3（shouldCatchUp*）+ Task 4（启动调用，silent=true）✓
- 去重按周期键文件名（§2/§5）→ Task 2（命名含键）+ Task 4（reportExists 前缀匹配）✓
- generateReportFile 复用重构（§5）→ Task 2 ✓
- IPC/UI/PetApp（§6）→ Task 4/5/6/7 ✓
- 测试清单（§7）→ Task 1（store 6+5）、Task 2（+2）、Task 3（16）、Task 4（4）✓
- 交付与版本（§8）→ Task 8 ✓
- 风险：休眠恢复（§9）→ ticker 用 now() 实时取值，Task 4 实现 ✓

**类型一致性核对：** AutoReportConfig/Rule/Fired/GetResult/SetResult 全链一致（Task 1 定义 → Task 4 handler → Task 5 preload → Task 6/7 消费）；generateReportFile 签名 `{ dir, outputDir, mode, today? }` 在 Task 2 定义、Task 4 两处调用（手动 handler + generateAutoReport）一致；shouldCatchUp* 的 `reportExists(key)` 回调在 Task 3 定义、Task 4 注入一致。

**注意点（实现时复核）：**
- Task 2 采用 outputDir 参数化版本（零 Electron 依赖），最终签名以 Task 2 Step 3 修正后为准；若 dev 环境 node 版本不支持 `satisfies`，改普通断言。
- Task 4 Step 5 的 `reportExists` 前缀匹配需与 Task 2 文件名规则严格一致（`陪伴周报-<key>-`、`陪伴月报-<key>-`）。
- 测试计数：新增 6+2+16+4=28 例 → 收官约 288 例（以实际为准）。
