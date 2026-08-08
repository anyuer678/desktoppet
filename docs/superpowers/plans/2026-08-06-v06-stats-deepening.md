# v0.6 统计深化 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 v0.5 陪伴统计之上交付五类深化：多角色分离 / 整年热力图 / 成就里程碑 / 趋势对比+周报月报 / Excel 导出。

**Architecture:** 存储从 `stats/*.json` 平铺改为 `stats/<roleId>/*.json` 按角色子目录（dailyStats.ts 的 `dir` 参数语义即"角色目录"，改动收敛在 index.ts 与新增迁移函数）。其余四功能均为独立纯函数（achievements.ts、report.ts）+ 新 IPC + 渲染层卡片，遵循 v0.5 模式（纯函数 vitest → handler → preload → CenterApp）。

**Tech Stack:** Electron + TypeScript + Vite（electron-vite）、vitest、tailwind-merge/CVA 纯 CSS 图表；Build 5 引入 `exceljs`。

## Global Constraints

- 不联网、只读本地；主进程计算；渲染层只消费 IPC。
- 所有新 IPC 返回范式：`{ ok: boolean; error?: string; ... }`；日期格式错误文案沿用 `validateRange`：`日期格式应为 YYYY-MM-DD`。
- 角色 id 安全化专用 `sanitizeRoleId`；遍历角色目录的函数必须先经过它。
- cookie 常量（Spec §5、§7）：等级阈值（小时）`[0,10,50,100,250,500,1000,2000,3500,5000]`；徽章想定。
- 版本号逐构建递增：v0.6.0806.01 → v0.6.0806.06。每构建更新 CHANGELOG / 使用说明 / API设计 / 架构设计§9 路线图，并建 `backup/backup_20260806_v06-0X`。Build 6 结束建 `backup_20260806_v06-complete`。
- 无 git（仓库非 git）：每个任务末尾用「全量回归 `npx vitest run` + `npm run typecheck` 通过」作为关卡，替代提交步骤。

---

### Task 1: 多角色统计分离（v0.6.0806.01）

**Files:**
- Modify: `src/main/stats/dailyStats.ts`
- Modify: `src/main/index.ts`
- Test: `src/main/stats/dailyStats.test.ts`

**Interfaces:**
- Consumes: 现有 `dailyStats.ts` 全部导出、`statsDir` 根目录语义、`settings.activeCharacterId`
- Produces:
  - `sanitizeRoleId(id: string): string` —— 非 `[a-zA-Z0-9_.-]` 替换为 `_`，空串兜底 `'role'`
  - `migrateStatsLayout(rootDir: string, defaultRoleId: string): number` —— 幂等迁移平铺文件→子目录，返回移动数
  - 主进程 `roleStatsDir(): string`（角色目录 = `join(statsRoot, sanitizeRoleId(activeRoleId))`）

- [ ] **Step 1: 写失败测试**

在 `dailyStats.test.ts` 追加：

```ts
import { migrateStatsLayout, sanitizeRoleId } from './dailyStats'

describe('sanitizeRoleId', () => {
  it('保留合法字符', () => {
    expect(sanitizeRoleId('rabbit-2')).toBe('rabbit-2')
    expect(sanitizeRoleId('cat')).toBe('cat')
  })
  it('非法字符替换为下划线', () => {
    expect(sanitizeRoleId('../evil')).toBe('.._evil')
  })
  it('空串兜底 role', () => {
    expect(sanitizeRoleId('')).toBe('role')
  })
})

describe('migrateStatsLayout', () => {
  it('平铺文件移入默认角色子目录', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mig-'))
    saveDailyStats(dir, { ...emptyStats('2026-08-01'), updatedAt: 1 })
    saveDailyStats(dir, { ...emptyStats('2026-08-02'), updatedAt: 2 })
    const moved = migrateStatsLayout(dir, 'rabbit')
    expect(moved).toBe(2)
    expect(existsSync(join(dir, 'rabbit', '2026-08-01.json'))).toBe(true)
    expect(existsSync(join(dir, '2026-08-01.json'))).toBe(false)
  })
  it('目标已存在时保留更新者', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mig-'))
    mkdirSync(join(dir, 'rabbit'), { recursive: true })
    // 目标更新：old
    saveDailyStats(join(dir, 'rabbit'), { ...emptyStats('2026-08-01'), updatedAt: 500 })
    // 源更新：new
    saveDailyStats(dir, { ...emptyStats('2026-08-01'), updatedAt: 1000 })
    migrateStatsLayout(dir, 'rabbit')
    const kept = JSON.parse(readFileSync(join(dir, 'rabbit', '2026-08-01.json'), 'utf-8'))
    expect(kept.updatedAt).toBe(1000)
  })
  it('幂等：二次调用返回 0', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mig-'))
    saveDailyStats(dir, { ...emptyStats('2026-08-01'), updatedAt: 1 })
    migrateStatsLayout(dir, 'rabbit')
    expect(migrateStatsLayout(dir, 'rabbit')).toBe(0)
  })
})
```

（`mkdtempSync / mkdirSync / tmpdir / readFileSync / join / existsSync` 已 import 或从 `node:fs`、`node:os`、`node:path` 补引。）

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/main/stats/dailyStats.test.ts`
Expected: 新增 6 例 FAIL（`sanitizeRoleId is not defined` / `migrateStatsLayout is not defined`）

- [ ] **Step 3: 实现 dailyStats.ts 两个函数**

在 `dailyStats.ts` 文件末尾追加：

```ts
/** 角色 id 安全化：非 [a-zA-Z0-9_.-] 字符替换为下划线；空串兜底 role */
export function sanitizeRoleId(id: string): string {
  const s = String(id ?? '').replace(/[^a-zA-Z0-9_.-]/g, '_')
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
```

（顶部 import 增加 `renameSync`。）

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/main/stats/dailyStats.test.ts`
Expected: 原 32 例 + 新 6 例全绿。

- [ ] **Step 5: 主进程接入角色目录**

`src/main/index.ts`：

(a) 顶部 glob 变量注释与定义处（`let statsDir = ''` 附近）加：

```ts
let activeStatsRoleId = 'rabbit'
let statsRoot = ''
```

(b) `statsFilePath()` 保持返回根目录。在 whenReady 内初始化处（`statsDir = statsFilePath()` 前后）替换为：

```ts
    statsRoot = statsFilePath()
    activeStatsRoleId = sanitizeRoleId(settings.activeCharacterId || 'rabbit')
    migrateStatsLayout(statsRoot, activeStatsRoleId)
    statsDir = join(statsRoot, activeStatsRoleId)
    statsDate = todayStr()
    dailyStats = loadDailyStats(statsDir, statsDate)
    log('info', '[stats] dir=', statsRoot, 'role=', activeStatsRoleId)
```

(c) 新增角色目录构造 helper（放在 `statsFilePath()` 旁）：

```ts
function roleStatsDir(): string {
  return join(statsRoot, activeStatsRoleId)
}
```

(d) 角色切换：找到写 `settings = { ...settings, activeCharacterId: id }` 的 handler（约 L248 `center:open` select 处，即 `character:select` 或 settings:set 流程）。交换角色时需把旧角色今日统计落盘后切换。在 `character:select` handler 成功后追加：

```ts
    if (dailyStats) saveDailyStats(statsDir, dailyStats)
    activeStatsRoleId = sanitizeRoleId(settings.activeCharacterId || 'rabbit')
    migrateStatsLayout(statsRoot, activeStatsRoleId)
    statsDir = roleStatsDir()
    const today = todayStr()
    if (today !== statsDate) statsDate = today
    dailyStats = loadDailyStats(statsDir, statsDate)
```

（若 `statsDir` 赋值处依赖顺序，先确认 handler 内已 `saveDailyStats`。）

(e) `ensureStatsDate` 升级为同时感知角色（tick 每 4s 调用，保证角色切换后新角色 tick 正确落盘）：

```ts
function ensureStatsDate(now: number): void {
  const today = todayStr(new Date(now))
  const role = sanitizeRoleId(settings.activeCharacterId || 'rabbit')
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
```

（修复：切换角色分支立即重载今日并 return，避免旧角色快照写入新角色目录——Task 1 审查发现。）

（`settings.activeCharacterId` 是 `src/shared/ipc.ts` 中 `Settings` 的既有字段；`roleStatsDir()` 见 (c)。）

- [ ] **Step 6: 全量回归**

Run: `npm run typecheck` && `npx vitest run` && `npm run build`
Expected: typecheck 全绿；测试 ≤原 243+6=249 全绿；build 成功。

- [ ] **Step 7: 文档 / 版本 / 备份**

1. `package.json` version → `0.6.0806.01`。
2. CHANGELOG 顶部新增条目：
```markdown
## v0.6.0806.01 (统计深化：多角色分离，开发版)

Date: 2026-08-06

新增：
- 陪伴统计按角色分离：存储由 `stats/*.json` 平铺改为 `stats/<角色id>/*.json`；切换角色后首页/统计页/导出/清空均只反映当前角色
- 旧版平铺统计自动迁移到当前角色子目录（幂等、冲突按 updatedAt 保留较新者）

修复：
- 暂无

已知问题：
- 旧数据无法追溯原属角色，统一归入迁移时的当前角色
```
3. `docs/使用说明.md` §2.11 开头补充一句「统计按角色分别记录，切换角色后展示与导出随之切换」。
4. `docs/API设计.md` stats:* 小节存储段补充：`stats/YYYY-MM-DD.json` → `stats/<角色id>/YYYY-MM-DD.json`，接口全部按当前角色过滤（渲染层无须传角色）。
5. `docs/架构设计.md` §9 路线图 v0.6 状态行更新为 `进行中（.0806.01 多角色分离）`。
6. 备份：`backup/backup_20260806_v06-01`（复制 src/docs/CHANGELOG.md/package.json/package-lock.json）。

---

### Task 2: 整年热力图（v0.6.0806.02）

**Files:**
- Modify: `src/shared/ipc.ts`
- Modify: `src/main/stats/dailyStats.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts` + `src/preload/index.d.ts`
- Modify: `src/renderer/src/center/CenterApp.tsx`
- Test: `src/main/stats/dailyStats.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `statsDir`/`roleStatsDir` 角色目录语义
- Produces:
  - `loadDailyRangeFullYear(dir: string, year: number): RangeDay[]`（全年逐日，未来日期生效空统计）
  - `StatsHeatmap`（shared）：`StatsHeatmapResult { ok: boolean; error?: string; days?: RangeDay[] }`
  - preload：`stats.heatmap(year: number): Promise<StatsHeatmapResult>`
  - handler：`stats:heatmap`（参数 `year:number`，2000~2100）

- [ ] **Step 1: shared/ipc.ts 追加类型**

```ts
export interface StatsHeatmapResult {
  ok: boolean
  error?: string
  days?: RangeDay[]
}
```

- [ ] **Step 2: 写失败测试（dailyStats.test.ts）**

```ts
describe('loadDailyRangeFullYear', () => {
  it('返回整年逐日（含首尾）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'yr-'))
    saveDailyStats(dir, { ...emptyStats('2026-08-05'), updatedAt: 1 })
    const days = loadDailyRangeFullYear(dir, 2026)
    expect(days.length).toBe(365)
    expect(days[0].date).toBe('2026-01-01')
    expect(days[364].date).toBe('2026-12-31')
    expect(days.find((d) => d.date === '2026-08-05')?.present).toBe(true)
  })
  it('闰年 366 天', () => {
    const dir = mkdtempSync(join(tmpdir(), 'yr-'))
    expect(loadDailyRangeFullYear(dir, 2024).length).toBe(366)
  })
})
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npx vitest run src/main/stats/dailyStats.test.ts`
Expected: 2 例 FAIL（`loadDailyRangeFullYear is not defined`）

- [ ] **Step 4: 实现**

```ts
/** 全年逐日统计（不分上限 90 天；未来日期 present=false 不报错）；闰年自动 366 天 */
export function loadDailyRangeFullYear(dir: string, year: number): RangeDay[] {
  const start = `${year}-01-01`
  const end = `${year}-12-31`
  return iterateDates(start, end).map((date) => {
    const present = existsSync(dailyStatsPath(dir, date))
    return { date, present, stats: present ? loadDailyStats(dir, date) : emptyStats(date) }
  })
}
```

- [ ] **Step 5: 跑测试确认通过**（同上路径，Expected PASS）

- [ ] **Step 6: IPC + preload**

index.ts 在 `stats:year` handler 后追加：

```ts
  ipcMain.handle('stats:heatmap', (_e, year: unknown) => {
    if (typeof year !== 'number' || !Number.isInteger(year) || year < 2000 || year > 2100) {
      return { ok: false, error: '年份应在 2000~2100 之间' }
    }
    return { ok: true, days: loadDailyRangeFullYear(statsDir, year) }
  })
```

preload `stats` 命名空间加：

```ts
    heatmap: (year: number): Promise<StatsHeatmapResult> => ipcRenderer.invoke('stats:heatmap', year),
```

`index.d.ts` 同步补 `heatmap(year: number): Promise<StatsHeatmapResult>`；(import 列表加 `StatsHeatmapResult`)。

- [ ] **Step 7: 渲染层「年度热力图」卡**

CenterApp.tsx：
(a) 状态：`const [yearHeatYear, setYearHeatYear] = useState(() => new Date().getFullYear())` / `const [yearHeatDays, setYearHeatDays] = useState<RangeDay[] | null>(null)` / `const [yearHeatError, setYearHeatError] = useState('')`；并在现有 `monthDates` 旁加工具 `yearMonths = 12 行`。
(b) 加载函数放 `loadHeatmap` 旁：

```ts
  const loadYearHeatmap = async (year: number): Promise<void> => {
    setYearHeatError('')
    try {
      const res = await window.desktopPet.stats.heatmap(year)
      if (res.ok && res.days) setYearHeatDays(res.days)
      else setYearHeatError(res.error ?? '加载失败')
    } catch (err) {
      setYearHeatError(`加载失败: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
```

(c) 统计页 effect 追加 `void loadYearHeatmap(yearHeatYear)`；`[yearHeatYear]` 单独 effect（切年只重新加载年度热力图）。
(d) 在「月度热力图」Card 之后插入（节选关键 JSX，完整用与月度卡相同的 container/legend 样式）：

```tsx
<Card>
  <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
    <CardTitle>年度热力图</CardTitle>
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => setYearHeatYear((y) => y - 1)}>‹</Button>
      <span className="w-24 text-center text-sm font-medium">{yearHeatYear} 年</span>
      <Button variant="outline" size="sm" onClick={() => setYearHeatYear((y) => Math.min(2100, y + 1))}>›</Button>
    </div>
  </CardHeader>
  <CardContent>
    {yearHeatError && <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{yearHeatError}</div>}
    {yearHeatDays && (() => {
      const byDate = new Map(yearHeatDays.map((d) => [d.date, d.stats]))
      const max = Math.max(1, ...yearHeatDays.map((d) => dayTotalSeconds(d.stats)))
      const yearTotal = yearHeatDays.reduce((a, d) => a + dayTotalSeconds(d.stats), 0)
      const activeDays = yearHeatDays.filter((d) => d.present).length
      return (
        <div className="space-y-3">
          <div className="space-y-1">
            {Array.from({ length: 12 }, (_, m) => {
              const cells = monthDates(yearHeatYear, m + 1)
              return (
                <div key={m} className="flex items-center gap-2">
                  <div className="w-7 shrink-0 text-right text-[11px] text-muted-foreground">{m + 1}月</div>
                  <div className="grid flex-1 gap-[3px]" style={{ gridTemplateColumns: 'repeat(31, minmax(0, 1fr))' }}>
                    {cells.map((date) => {
                      const stats = byDate.get(date)
                      const sec = stats ? dayTotalSeconds(stats) : 0
                      return (
                        <button key={date} type="button" title={`${date} · ${sec > 0 ? formatDuration(sec) : '无记录'}`}
                          onClick={() => setSelectedDay(yearHeatDays.find((d) => d.date === date) ?? null)}
                          className={cn('aspect-square rounded-[3px]', heatColor(sec, max))} />
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span>{yearHeatYear} 年陪伴 {formatDuration(yearTotal)}</span>
            <span>活跃 {activeDays} 天</span>
            <span className="inline-flex items-center gap-1">无 <span className="size-2.5 rounded-sm bg-muted" /> <span className="size-2.5 rounded-sm bg-emerald-200" /> <span className="size-2.5 rounded-sm bg-emerald-300" /> <span className="size-2.5 rounded-sm bg-emerald-400" /> <span className="size-2.5 rounded-sm bg-emerald-500" /> 多</span>
          </div>
          {/* selectedDay 明细块与月度卡共用（含删除当天）——可直接复制该段 JSX */}
        </div>
      )
    })()}
  </CardContent>
</Card>
```

（网格用内联 `gridTemplateColumns: 'repeat(31, minmax(0, 1fr))'`，Tailwind 动态类不生效。点击删除逻辑复用月度卡的 `selectedDay` 明细/删除块 JSX。）

- [ ] **Step 8: typecheck + 全量回归 + 实机驱动**

1. `npm run typecheck:web` → 全绿。
2. `npm run typecheck` && `npx vitest run` && `npm run build` → 全绿。
3. 实机驱动（whenReady 末尾临时加，验证后删除）：打开中心 → 统计页 → 断言 `document.body.innerText.includes('年度热力图')` 且全年格 >0。

- [ ] **Step 9: 文档 / 版本 / 备份**
1. `package.json` → `0.6.0806.02`。
2. CHANGELOG 顶部条目（v0.6.0806.02：新增 `stats:heatmap`、统计页「年度热力图（GitHub 风格）」卡）。
3. 使用说明 §2.11、API设计.md（stats:heatmap 契约）、架构设计.md §9 v0.6 → `进行中（.0806.01 角色分离；.0806.02 年度热力图）`。
4. 备份 `backup_20260806_v06-02`。

---

### Task 3: 成就 / 里程碑（v0.6.0806.03）

**Files:**
- Create: `src/main/stats/achievements.ts`
- Create: `src/main/stats/achievements.test.ts`
- Modify: `src/shared/ipc.ts`、`src/main/index.ts`、`src/preload/index.ts` + `index.d.ts`、`src/renderer/src/center/CenterApp.tsx`

**Interfaces:**
- Consumes: `loadDailyRange`、`computeStreak`、`totalSeconds`、`todayStr`（dailyStats.ts）
- Produces:
  - `AchievementLevel { no: number; label: string; nextHours: number | null }`
  - `Achievements { charId: string; streak: number; bestStreak: number; totalSeconds: number; level: AchievementLevel; badges: { id: string; label: string; unlocked: boolean }[] }`
  - `computeAchievements(dir: string, roleId: string, today: string): Achievements`
  - `StatsAchievementsResult { ok: boolean; error?: string; achievements?: Achievements }`
  - handler `stats:achievements`；preload `stats.achievements()`

- [ ] **Step 1: shared/ipc.ts 追加类型**

```ts
export interface AchievementLevel { no: number; label: string; nextHours: number | null }
export interface AchievementBadge { id: string; label: string; unlocked: boolean }
export interface Achievements {
  charId: string
  streak: number
  bestStreak: number
  totalSeconds: number
  level: AchievementLevel
  badges: AchievementBadge[]
}
export interface StatsAchievementsResult { ok: boolean; error?: string; achievements?: Achievements }
```

- [ ] **Step 2: 写失败测试（新文件 `src/main/stats/achievements.test.ts`）**

```ts
import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { computeAchievements } from './achievements'
import { emptyStats, saveDailyStats, todayStr } from './dailyStats'

const writeDay = (dir: string, date: string, sec: number): void => {
  saveDailyStats(dir, { ...emptyStats(date), secondsByState: { idle: sec }, updatedAt: Date.now() })
}

function mk(): string {
  return mkdtempSync(join(tmpdir(), 'acv-'))
}

// 注意 computeAchievements 内部会复算 computeStreak(bestStreak 从整年扫描)
describe('computeAchievements', () => {
  it('空目录：streak 0 / level Lv1 / 无解锁徽章', () => {
    const dir = mk()
    const a = computeAchievements(dir, 'rabbit', '2026-08-06')
    expect(a.streak).toBe(0)
    expect(a.level.no).toBe(1)
    expect(a.level.nextHours).toBe(10)
    expect(a.bestStreak).toBe(0)
    expect(a.badges.every((b) => !b.unlocked)).toBe(true)
  })
  it('连续 7 天解锁 streak-7 与 days-7 逻辑（连续 7 天有记录）', () => {
    const dir = mk()
    for (let i = 0; i < 7; i++) {
      const d = todayStr(new Date(new Date('2026-08-06T00:00:00').getTime() - (6 - i) * 86400000))
      writeDay(dir, d, 60)
    }
    const a = computeAchievements(dir, 'rabbit', '2026-08-06')
    expect(a.streak).toBe(7)
    expect(a.badges.find((b) => b.id === 'streak-7')?.unlocked).toBe(true)
    expect(a.badges.find((b) => b.id === 'streak-30')?.unlocked).toBe(false)
  })
  it('累计 12 小时达 Lv2', () => {
    const dir = mk()
    writeDay(dir, '2026-08-01', 43200) // 12h
    const a = computeAchievements(dir, 'rabbit', '2026-08-06')
    expect(a.totalSeconds).toBe(43200)
    expect(a.level.no).toBe(2)
    expect(a.level.nextHours).toBe(50)
  })
})
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npx vitest run src/main/stats/achievements.test.ts`
Expected: 3 例 FAIL（`computeAchievements is not defined`）

- [ ] **Step 4: 实现 `src/main/stats/achievements.ts`**

```ts
import { computeStreak, loadDailyRange, sanitizeRoleId, todayStr } from './dailyStats'
import type { Achievements } from '../../shared/ipc'

const LEVEL_HOURS = [0, 10, 50, 100, 250, 500, 1000, 2000, 3500, 5000]
const BADGES: { id: string; label: string; kind: 'streak' | 'totalHours' | 'activeDays'; threshold: number }[] = [
  { id: 'streak-7', label: '连续陪伴 7 天', kind: 'streak', threshold: 7 },
  { id: 'streak-30', label: '连续陪伴 30 天', kind: 'streak', threshold: 30 },
  { id: 'streak-100', label: '连续陪伴 100 天', kind: 'streak', threshold: 100 },
  { id: 'streak-365', label: '连续陪伴 365 天', kind: 'streak', threshold: 365 },
  { id: 'total-100h', label: '累计陪伴 100 小时', kind: 'totalHours', threshold: 100 },
  { id: 'total-500h', label: '累计陪伴 500 小时', kind: 'totalHours', threshold: 500 },
  { id: 'total-1000h', label: '累计陪伴 1000 小时', kind: 'totalHours', threshold: 1000 },
  { id: 'days-30', label: '活跃 30 天', kind: 'activeDays', threshold: 30 },
  { id: 'days-100', label: '活跃 100 天', kind: 'activeDays', threshold: 100 }
]

function prevDay(d: string): string {
  return todayStr(new Date(new Date(d + 'T00:00:00').getTime() - 86400000))
}

export function computeAchievements(dir: string, roleId: string, today: string): Achievements {
  const year = Number(today.slice(0, 4))
  // 跨年扫描：从去年 1 月 1 日起，保证 bestStreak 不受年界截断
  const days = loadDailyRange(dir, `${year - 1}-01-01`, today).filter((d) => d.present)
  const presentDates = days.map((d) => d.date).sort()
  const totalSeconds = days.reduce((a, d) => a + totalSecondsOf(d.stats), 0)
  const activeDays = presentDates.length
  const totalHours = totalSeconds / 3600

  const streak = computeStreak(dir, today)
  let bestStreak = 0
  let run = 0
  let prev = ''
  for (const date of presentDates) {
    run = prev === '' || prevDay(date) === prev ? run + 1 : 1
    if (run > bestStreak) bestStreak = run
    prev = date
  }

  let no = 1
  for (let i = 0; i < LEVEL_HOURS.length; i++) {
    if (totalHours >= LEVEL_HOURS[i]) no = i + 1
  }
  const nextHours = no < LEVEL_HOURS.length ? LEVEL_HOURS[no] : null

  const badges = BADGES.map((b) => {
    const value = b.kind === 'streak' ? streak : b.kind === 'totalHours' ? totalHours : activeDays
    return { id: b.id, label: b.label, unlocked: value >= b.threshold }
  })

  return {
    charId: sanitizeRoleId(roleId),
    streak,
    bestStreak,
    totalSeconds: Math.round(totalSeconds),
    level: { no, label: `Lv${no}`, nextHours },
    badges
  }
}
```

（`totalSecondsOf` 即从 `./dailyStats` 导入的 `totalSeconds`——把 import 行改为 `import { computeStreak, loadDailyRange, sanitizeRoleId, todayStr, totalSeconds } from './dailyStats'`，函数体内 `totalSecondsOf` 全部替换为 `totalSeconds`。日期字符串 `prevDay(date) === prev` 依赖 YYYY-MM-DD 字典序连续性，成立。）

- [ ] **Step 5: 跑测试确认通过**

Run: `npx vitest run src/main/stats/achievements.test.ts` → 3 例 PASS。

- [ ] **Step 6: IPC + preload + 渲染**

index.ts：
```ts
  ipcMain.handle('stats:achievements', () => ({
    ok: true,
    achievements: computeAchievements(statsDir, activeStatsRoleId, todayStr())
  }))
```
（`statsDir` 为当前角色目录（Task 1）`let statsDir` 全局；`activeStatsRoleId` 同步；today 用 `todayStr()`。）

preload：`achievements: (): Promise<StatsAchievementsResult> => ipcRenderer.invoke('stats:achievements')`；index.d.ts 同步。

CenterApp：新增「成就」卡（统计页「年度汇总」Card 后）：
- 状态 `const [achievements, setAchievements] = useState<Achievements | null>(null)`；统计页加载 effect 追加 `void window.desktopPet.stats.achievements().then((r) => r.ok && setAchievements(r.achievements))`。
- 进度计算（组件内、JSX 前）：`const levelProgress = achievements && achievements.level.nextHours !== null ? Math.min(100, (achievements.totalSeconds / 3600 / achievements.level.nextHours) * 100) : 100`（`achievements` 为 null 时取 0）。
- JSX：
```tsx
<Card>
  <CardHeader><CardTitle>成就与里程碑</CardTitle></CardHeader>
  <CardContent className="space-y-3">
    {achievements ? (
      <>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <span>当前连续 <b>{achievements.streak}</b> 天</span>
          <span>最长连续 <b>{achievements.bestStreak}</b> 天</span>
          <span>累计陪伴 <b>{formatDuration(achievements.totalSeconds)}</b></span>
        </div>
        <div>
          <div className="mb-1 text-xs text-muted-foreground">
            {achievements.level.label}
            {achievements.level.nextHours !== null ? ` · 距 Lv${achievements.level.no + 1} 还需 ${Math.max(0, Math.ceil(achievements.level.nextHours - achievements.totalSeconds / 3600))} 小时` : ' · 已满级'}
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${levelProgress}%` }} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          {achievements.badges.map((b) => (
            <div key={b.id} className={cn('rounded-md border border-border p-2', b.unlocked ? '' : 'opacity-40')}>
              <div className={cn('mx-auto mb-1 flex size-8 items-center justify-center rounded-full', b.unlocked ? 'bg-emerald-500 text-white' : 'bg-muted text-muted-foreground')}>
                {b.unlocked ? '✓' : '🔒'}
              </div>
              <div className="truncate" title={b.label}>{b.label}</div>
            </div>
          ))}
        </div>
      </>
    ) : (
      <div className="text-sm text-muted-foreground">加载中…</div>
    )}
  </CardContent>
</Card>
```
（`levelProgress` 定义见本 Step 上方「进度计算」行；徽章图标「✓/🔒」用字符即可，不引入图标依赖。）

- [ ] **Step 7: typecheck + 全量回归 + build**（同 Task 2 Step 8，另加 `npm run typecheck:web`）

- [ ] **Step 8: 文档 / 版本 / 备份**
- package.json → `0.6.0806.03`；CHANGELOG（v0.6.0806.03：新增 `stats:achievements` 与「成就与里程碑」卡，含等级进度与徽章）；API 文档补 stats:achievements；架构 §9 v0.6 → include `.0806.03`；备份 .03。

---

### Task 4: 趋势对比 + 周报/月报（v0.6.0806.05）

**Files:**
- Create: `src/main/stats/report.ts`
- Create: `src/main/stats/report.test.ts`
- Modify: `src/shared/ipc.ts`、`src/main/index.ts`、`src/preload/index.ts`、`index.d.ts`、`CenterApp.tsx`

**Interfaces:**
- Consumes: `loadDailyRange`、`totalSeconds`、`todayStr`
- Produces:
  - `PeriodMetric { totalSeconds: number; activeDays: number; events: number; interactions: number }`
  - `comparePeriods(dir, roleId, cStart, cEnd, pStart, pEnd): { current: PeriodMetric; previous: PeriodMetric; changeTotalPercent: number | null }`
  - `buildReportMarkdown(meta: { title; generatedAt; currentRange; previousRange; compare: PeriodCompareResult; topEvents: [string, number][] }): string`
  - handlers `stats:trend`、`stats:report:generate`；preload `stats.trend(...)` / `stats.report.generate(...)`

- [x] **Step 1: shared/ipc.ts 追加**

```ts
export interface PeriodMetric { totalSeconds: number; activeDays: number; events: number; interactions: number }
export interface PeriodCompareResult {
  current: PeriodMetric
  previous: PeriodMetric
  changeTotalPercent: number | null
}
export interface StatsTrendResult { ok: boolean; error?: string; compare?: PeriodCompareResult }
export interface StatsReportGenerateResult { ok: boolean; error?: string; path?: string }
```

- [x] **Step 2: 写失败测试（report.test.ts）**

```ts
import { describe, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { comparePeriods, buildReportMarkdown } from './report'
import { emptyStats, saveDailyStats } from './dailyStats'

function mk() { return mkdtempSync(join(tmpdir(), 'rp-')) }
const writeDay = (dir: string, date: string, sec: number): void => saveDailyStats(dir, { ...emptyStats(date), secondsByState: { idle: sec }, updatedAt: 1 })

describe('comparePeriods', () => {
  it('两期均有时：changeTotalPercent=(cur-prev)/prev', () => {
    const dir = mk()
    writeDay(dir, '2026-08-05', 3600)  // prev: 2026-07-29..08-04
    writeDay(dir, '2026-08-06', 7200)  // cur: 08-05..08-06
    const r = comparePeriods(dir, 'rabbit', '2026-08-05', '2026-08-06', '2026-07-29', '2026-08-04')
    expect(r.current.totalSeconds).toBe(7200)
    expect(r.previous.totalSeconds).toBe(3600)
    expect(r.changeTotalPercent).toBeCloseTo(100)
  })
  it('上期为零 → changeTotalPercent null', () => {
    const dir = mk()
    writeDay(dir, '2026-08-06', 3600)
    const r = comparePeriods(dir, 'rabbit', '2026-08-05', '2026-08-06', '2026-07-29', '2026-08-04')
    expect(r.changeTotalPercent).toBeNull()
  })
  it('无任何记录 → 双方零', () => {
    const dir = mk()
    const r = comparePeriods(dir, 'rabbit', '2026-08-01', '2026-08-07', '2026-07-01', '2026-07-07')
    expect(r.previous.totalSeconds).toBe(0)
    expect(r.current.totalSeconds).toBe(0)
  })
})

describe('buildReportMarkdown', () => {
  it('包含标题与比较行', () => {
    const md = buildReportMarkdown({
      title: '陪伴周报',
      generatedAt: '2026-08-06 09:00',
      range: '2026-08-06..2026-08-12',
      previousRange: '2026-07-30..2026-08-05',
      compare: { current: { totalSeconds: 7200, activeDays: 2, events: 3, interactions: 4 }, previous: { totalSeconds: 3600, activeDays: 1, events: 1, interactions: 2 }, changeTotalPercent: 100 },
      topEvents: [['cpu_high', 3]]
    })
    expect(md).toContain('# 陪伴周报')
    expect(md).toContain('100%')
    expect(md).toContain('3600')
  })
})
```

- [x] **Step 3: 跑测试确认失败**

Run: `npx vitest run src/main/stats/report.test.ts`
Expected: FAIL（4 例 not defined）

- [x] **Step 4: 实现 `src/main/stats/report.ts`**

```ts
import { loadDailyRange, totalSeconds } from './dailyStats'
import type { PeriodCompareResult, PeriodMetric } from '../../shared/ipc'

function metricOf(dir: string, start: string, end: string): PeriodMetric {
  let sec = 0
  let activeDays = 0
  let events = 0
  let interactions = 0
  for (const d of loadDailyRange(dir, start, end)) {
    if (!d.present) continue
    sec += totalSeconds(d.stats)
    activeDays += 1
    events += Object.values(d.stats.events).reduce((a, b) => a + b, 0)
    interactions += d.stats.interactions.click + d.stats.interactions.drag + d.stats.interactions.speak
  }
  return { totalSeconds: sec, activeDays, events, interactions }
}

export function comparePeriods(
  dir: string,
  _roleId: string,
  cStart: string,
  cEnd: string,
  pStart: string,
  pEnd: string
): PeriodCompareResult {
  const current = metricOf(dir, cStart, cEnd)
  const previous = metricOf(dir, pStart, pEnd)
  const changeTotalPercent =
    previous.totalSeconds > 0
      ? Math.round(((current.totalSeconds - previous.totalSeconds) / previous.totalSeconds) * 100)
      : null
  return { current, previous, changeTotalPercent }
}

export function buildReportMarkdown(input: {
  title: string
  generatedAt: string
  range: string
  previousRange: string
  compare: PeriodCompareResult
  topEvents: [string, number][]
}): string {
  const fmt = (s: number): string => {
    const h = Math.floor(s / 3600)
    const m = Math.round((s % 3600) / 60)
    return h > 0 ? `${h} 小时 ${m} 分` : `${m} 分钟`
  }
  const change = input.compare.changeTotalPercent
  const changeText = change === null ? '—' : `${change >= 0 ? '+' : ''}${change}%`
  const lines = [
    `# ${input.title}`,
    '',
    `生成时间：${input.generatedAt}`,
    '',
    '## 统计范围',
    `- 本期：${input.range}`,
    `- 上期：${input.previousRange}`,
    '',
    '## 对比',
    '| 指标 | 本期 | 上期 | 变化 |',
    '| --- | --- | --- | --- |',
    `| 陪伴时长 | ${fmt(input.compare.current.totalSeconds)} | ${fmt(input.compare.previous.totalSeconds)} | ${changeText} |`,
    `| 活跃天数 | ${input.compare.current.activeDays} | ${input.compare.previous.activeDays} | |`,
    `| 事件总数 | ${input.compare.current.events} | ${input.compare.previous.events} | |`,
    `| 互动次数 | ${input.compare.current.interactions} | ${input.compare.previous.interactions} | |`,
    '',
    '## 事件 Top'
  ]
  lines.push(
    ...(input.topEvents.length > 0
      ? input.topEvents.map(([k, v]) => `- ${k}：${v} 次`)
      : ['- 无'])
  )
  return lines.join('\n')
}
```
（`_roleId` 保留为将来按角色差异化的扩展点；实现直接复用于当前角色目录。）

- [x] **Step 5: 跑测试确认通过**

Run: `npx vitest run src/main/stats/report.test.ts` → PASS。

- [x] **Step 6: IPC + preload**

index.ts（`stats:year` handler 旁追加）。先在模块内定义三个区间辅助（放 `todayStr` 等 stats 工具区附近）：

```ts
function weekStart(dateStr: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
  if (!m) return dateStr
  const day = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const dow = day.getDay()
  const monday = new Date(day.getFullYear(), day.getMonth(), day.getDate() - (dow === 0 ? 6 : dow - 1))
  return todayStr(monday)
}

function monthStart(dateStr: string): string {
  return `${dateStr.slice(0, 7)}-01`
}

function monthEnd(dateStr: string): string {
  const y = Number(dateStr.slice(0, 4))
  const m = Number(dateStr.slice(5, 7))
  const last = new Date(y, m, 0).getDate() // m=1..12，day=0 上月最后一天
  return `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`
}
```

```ts
  ipcMain.handle('stats:trend', (_e, cStart: unknown, cEnd: unknown, pStart: unknown, pEnd: unknown) => {
    const four = [cStart, cEnd, pStart, pEnd]
    if (!four.every((x) => typeof x === 'string')) return { ok: false, error: '日期格式应为 YYYY-MM-DD' }
    const [cs, ce, ps, pe] = four as string[]
    const v1 = validateRange(cs, ce)
    const v2 = validateRange(ps, pe)
    if (!v1.ok) return v1
    if (!v2.ok) return v2
    const compare = comparePeriods(statsDir, activeStatsRoleId, cs, ce, ps, pe)
    return { ok: true, compare }
  })

  ipcMain.handle('stats:report:generate', async (_e, mode: unknown) => {
    const m = mode === 'month' ? 'month' : mode === 'week' ? 'week' : null
    if (!m) return { ok: false, error: 'mode 应为 week 或 month' }
    const today = todayStr()
    const cS = m === 'week' ? weekStart(today) : monthStart(today)
    const cE = today
    // 上期：周报 = 上周一至上周日；月报 = 上月初至上月末
    const weekAgo = new Date(new Date(today + 'T00:00:00').getTime() - 7 * 86400000)
    const monthAgo = new Date(new Date(today + 'T00:00:00').getTime() - 86400000 * 30)
    const weekAgoStr = todayStr(weekAgo)
    const monthAgoStr = todayStr(monthAgo)
    const ps = m === 'week' ? weekStart(weekAgoStr) : monthStart(monthAgoStr)
    const pe =
      m === 'week'
        ? todayStr(new Date(new Date(weekStart(today) + 'T00:00:00').getTime() - 86400000))
        : monthEnd(monthStart(monthAgoStr))
    const cmp = comparePeriods(statsDir, activeStatsRoleId, cS, today, ps, pe)
    const topEvents = (() => {
      const ev: Record<string, number> = {}
      for (const d of loadDailyRange(statsDir, cS, today)) {
        if (!d.present) continue
        for (const [k, v] of Object.entries(d.stats.events)) ev[k] = (ev[k] ?? 0) + v
      }
      return Object.entries(ev).sort((a, b) => b[1] - a[1]).slice(0, 5) as [string, number][]
    })()
    const md = buildReportMarkdown({
      title: m === 'week' ? '陪伴周报' : '陪伴月报',
      generatedAt: new Date().toLocaleString('zh-CN'),
      range: `${cS} 至 ${today}`,
      previousRange: `${ps} 至 ${pe}`,
      compare: cmp,
      topEvents
    })
    const dir = join(app.getPath('documents'), 'DesktopPet', '报告')
    const file = join(dir, `陪伴${m === 'week' ? '周报' : '月报'}-${today}.md`)
    try {
      mkdirSync(dir, { recursive: true })
      writeFileSync(file, md, 'utf-8')
      log('info', '[stats:report:generate] saved', file)
      return { ok: true, path: file }
    } catch (err) {
      log('error', '[report generate]', err)
      return { ok: false, error: '报告写入失败' }
    }
  })
```

（`weekStart` 取本周一（周日归上周一）；`monthStart`/`monthEnd` 见本 Task 上方辅助块；`pe` 周报 = 本周一前一天即上周日，月报 = 上月最后一天。）

preload + index.d.ts：

```ts
    trend: (cStart: string, cEnd: string, pStart: string, pEnd: string): Promise<StatsTrendResult> =>
      ipcRenderer.invoke('stats:trend', cStart, cEnd, pStart, pEnd),
    reportGenerate: (mode: 'week' | 'month'): Promise<StatsReportGenerateResult> =>
      ipcRenderer.invoke('stats:report:generate', mode),
```

- [x] **Step 7: 渲染层「趋势对比」卡 + 「生成报告」按钮**

CenterApp：状态 `trendMode`（'7d'|'month'|'year'）、`trendData`（compare 结果）、`reportMsg`。计算区间函数：

```ts
  const getTrendRange = (mode: '7d' | 'month' | 'year') => {
    const today = todayStr()
    if (mode === '7d') {
      return { cS: daysAgoStr(6), cE: today, pS: daysAgoStr(13), pE: daysAgoStr(7) }
    }
    if (mode === 'month') {
      const now = new Date()
      const cS = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0).getDate()
      const pS = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-01`
      const pE = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
      return { cS, cE: today, pS, pE }
    }
    const y = new Date().getFullYear()
    return { cS: `${y}-01-01`, cE: today, pS: `${y - 1}-01-01`, pE: `${y - 1}-12-31` }
  }

  const loadTrend = async (mode: '7d' | 'month' | 'year'): Promise<void> => {
    setTrendBusy(true)
    try {
      const { cS, cE, pS, pE } = getTrendRange(mode)
      const res = await window.desktopPet.stats.trend(cS, cE, pS, pE)
      if (res.ok && res.compare) setTrendData(res.compare)
      else setTrendError(res.error ?? '查询失败')
    } catch (err) {
      setTrendError(`查询失败: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setTrendBusy(false)
    }
  }
```

`loadTrend` 完整实现见上文（含 `trendData/trendError/trendBusy` 状态命名：`setTrendData/setTrendError/setTrendBusy`）。统计页加载 effect 挂载后 `void loadTrend(trendMode)`；切换 mode 时 `setTrendMode(m)` 并通过 `useEffect(() => { if (tab === 'stats') void loadTrend(trendMode) }, [trendMode, tab])` 触发重载。

JSX（偏离深度控制在能直接粘贴；格式与既有卡一致）：

```tsx
<Card>
  <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
    <CardTitle>趋势对比</CardTitle>
    <div className="flex gap-1">
      {(['7d', 'month', 'year'] as const).map((m) => (
        <Button key={m} variant={trendMode === m ? 'default' : 'outline'} size="sm" onClick={() => setTrendMode(m)}>
          {m === '7d' ? '近7天' : m === 'month' ? '本月' : '本年'}
        </Button>
      ))}
    </div>
  </CardHeader>
  <CardContent>
    {trendData ? (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <TrendBox label="本期陪伴" value={formatDuration(trendData.current.totalSeconds)} />
        <TrendBox label="上期陪伴" value={formatDuration(trendData.previous.totalSeconds)} />
        <TrendBox label="变化" value={trendData.changeTotalPercent === null ? '—' : `${trendData.changeTotalPercent >= 0 ? '+' : ''}${trendData.changeTotalPercent}%`} />
        <TrendBox label="活跃天数" value={`${trendData.current.activeDays} / ${trendData.previous.activeDays}`} />
      </div>
    ) : (
      <div className="text-sm text-muted-foreground">加载中…</div>
    )}
  </CardContent>
</Card>
```
（`TrendBox` 复用既有 stats 卡片小 stat 样式，直接写 `<div className="rounded-md border border-border p-2.5">…</div>` 内联，不必定义组件。）

「生成报告」按钮放「数据管理」卡中：

```tsx
<div className="flex flex-wrap items-center gap-2">
  <Button variant="outline" size="sm" onClick={() => void generateReport('week')}>生成周报</Button>
  <Button variant="outline" size="sm" onClick={() => void generateReport('month')}>生成月报</Button>
  {reportMsg && <span className="text-xs text-muted-foreground">{reportMsg}</span>}
</div>
```
`generateReport` 调 `stats.reportGenerate(mode)`，成功后 `setReportMsg('已生成：' + r.path)`。

- [x] **Step 8: typecheck + 回归 + build**（同上）

- [x] **Step 9: 文档 / 版本 / 备份**
- package.json → 0.6.0806.05；CHANGELOG（stats:trend / stats:report:generate、趋势卡、周报月报生成按钮与落盘目录）；API 文档（两个新 channel + PeriodCompareResult/StatsReportGenerateResult）；§9 → .0806.05；备份 .05。

---

### Task 5: Excel 导出 + v0.6 收官（v0.6.0806.06）

**Files:**
- Modify: `package.json`（依赖）
- Create: `src/main/stats/spreadsheet.ts`（+ `spreadsheet.test.ts` 可选：只测 `buildWorkbook` 纯逻辑，不落盘）
- Modify: `src/shared/ipc.ts`、`src/main/index.ts`、`src/preload/index.ts`、`index.d.ts`、`CenterApp.tsx`
- Docs: CHANGELOG / 使用说明 / API / 架构

**Interfaces:**
- Consumes: `loadDailyRangeFullYear`（Task 2）、`totalSeconds`
- Produces:
  - `buildWorkbookRows(year, days): { daily: Record<string, unknown>[]; summary: Record<string, unknown>[] }`
  - handler `stats:exportExcel`（`R→M: year:number`）→ `StatsSpreadsheetResult { ok; error?; canceled?; path? }`

- [x] **Step 1: 安装依赖**

Run: `npm install exceljs`
Expected: package.json `dependencies` 新增 `exceljs`，package-lock 更新。

- [x] **Step 2: shared/ipc.ts 追加**

```ts
export interface StatsSpreadsheetResult { ok: boolean; error?: string; canceled?: boolean; path?: string }
```

- [x] **Step 3: 写测试（spreadsheet.test.ts）**

```ts
import { describe, it } from 'vitest'
import { buildWorkbookRows } from './spreadsheet'
import type { DailyStats } from '../../shared/ipc'

const d = (sec: number): DailyStats => ({ date: '2026-08-06', secondsByState: { idle: sec }, hours: new Array(24).fill(0), events: { cpu_high: 1 }, interactions: { click: 1, drag: 0, speak: 0 }, updatedAt: 1 })

describe('buildWorkbookRows', () => {
  it('daily 行含日期与总秒；summary 含总秒/活跃天/日均', () => {
    const { daily, summary } = buildWorkbookRows([{ date: '2026-08-05', stats: d(3600) }, { date: '2026-08-06', stats: d(7200) }])
    expect(daily).toHaveLength(2)
    expect(daily[0]).toMatchObject({ date: '2026-08-05', totalSeconds: 3600 })
    expect(summary[0]).toMatchObject({ totalSeconds: 4800, activeDays: 2, avgPerDay: 2400 })
  })
})
```

- [x] **Step 4: 跑测试确认失败** → FAIL（not defined）

- [x] **Step 5: 实现 `src/main/stats/spreadsheet.ts`**

```ts
import type { DailyStats } from '../../shared/ipc'
import { totalSeconds } from './dailyStats'
import { buildStatsCsv } from './dailyStats' // 若需要格式对齐可选；此处直接自推导
```

（实现 `buildWorkbookRows`：
```ts
export function buildWorkbookRows(days: { date: string; present: boolean; stats: DailyStats }[]) {
  const daily = days.map((d) => ({
    日期: d.date,
    陪伴秒: Math.round(totalSeconds(d.stats)),
    待机秒: d.stats.secondsByState.idle ?? 0,
    专注秒: d.stats.secondsByState.focus ?? 0,
    睡眠秒: d.stats.secondsByState.sleep ?? 0,
    开心秒: d.stats.secondsByState.happy ?? 0,
    告警秒: d.stats.secondsByState.warning ?? 0,
    事件数: Object.values(d.stats.events).reduce((a, b) => a + b, 0),
    点击: d.stats.interactions.click,
    拖动: d.stats.interactions.drag,
    说话: d.stats.interactions.speak
  }))
  const total = days.reduce((a, d) => a + totalSeconds(d.stats), 0)
  const active = days.filter((d) => d.present).length
  const summary = [{ 总陪伴秒: Math.round(total), 活跃天数: active, 日均秒: active > 0 ? Math.round(total / active) : 0 }]
  return { daily, summary }
}
```
+ `buildWorkbook(data) => Promise<Buffer>`：用 exceljs `new Workbook()` 填 2 个 Sheet（列宽、表头粗体、数据行 appendRows），返回 `await workbook.xlsx.writeBuffer()`。
）

- [x] **Step 6: 跑测试确认通过**

- [x] **Step 7: IPC handler + preload**

index.ts：
```ts
  ipcMain.handle('stats:exportExcel', async (_e, year: unknown) => {
    if (typeof year !== 'number' || !Number.isInteger(year) || year < 2000 || year > 2100) {
      return { ok: false, error: '年份应在 2000~2100 之间' }
    }
    const days = loadDailyRangeFullYear(statsDir, year)
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: '导出 Excel 统计',
      defaultPath: join(app.getPath('documents'), `陪伴统计-${activeStatsRoleId}-${year}.xlsx`),
      filters: [{ name: 'Excel', extensions: ['xlsx'] }]
    })
    if (canceled || !filePath) return { ok: false, canceled: true }
    try {
      const buf = await buildWorkbook(days)
      writeFileSync(filePath, buf)
      log('info', '[stats:exportExcel] saved', filePath)
      return { ok: true, path: filePath }
    } catch (err) {
      log('error', '[stats:exportExcel]', err)
      return { ok: false, error: '导出 Excel 失败' }
    }
  })
```

preload：`exportExcel: (year: number) => ipcRenderer.invoke('stats:exportExcel', year)`；index.d.ts 同步（`StatsSpreadsheetResult`）。

CenterApp「数据管理」卡追加按钮：
```tsx
<Button variant="outline" size="sm" onClick={() => void handleExportExcel()}>导出 Excel（{new Date().getFullYear()} 年）</Button>
```
`handleExportExcel`：调 `stats.exportExcel(new Date().getFullYear())`，成功后 `setExportMsg('已导出：' + res.path)`。

- [x] **Step 8: typecheck + 回归 + build + 实机驱动**

1. `npm run typecheck` && `npx vitest run`（含新增 3+1 例） && `npm run build`。
2. 实机：统计页「导出 Excel」弹保存框 → 保存 → 用 exceljs 命令行或手动 Excel 打开验证两 Sheet。
3. 确认停止所有 electron。

- [x] **Step 9: 文档 / 版本 / 收官**
1. package.json → `0.6.0806.06`。

2. CHANGELOG v0.6.0806.06（新增 stats:exportExcel、数据管理导出 Excel 按钮）＋ v0.6 收官记录（`backup/backup_20260806_v06-complete`；路线图 v0.6 状态改「已完成」并移除候选功能转移为下代候选）。
3. 使用说明 §2.11 补「导出 Excel（按年）」；API 文档补 stats:exportExcel；架构设计 §9 v0.6 `已完成（.0806.0X…，v06-complete 已备份）`，路线图新增 v0.7 候选行（由 v0.6 候选未做项平铺，如：报告定时自动触发、多设备同步）。
4. 备份 `backup_20260806_v06-05`，再建 `backup_20260806_v06-complete`（复制 src/docs/CHANGELOG.md/package.json/package-lock.json）。

---

## Self-Review 记录

- Spec §3（角色存储/迁移/过滤/今日文件）→ Task 1 覆盖（Step 3/5/6）；Spec §3.4「渲染层无须传角色」由 handler 隐式读 Settings 满足。
- Spec §4（stats:heatmap + 年度热力图卡）→ Task 2 Step 4/6/7 覆盖。
- Spec §5（computeAchievements + 徽章 + IPC + 成就卡）→ Task 3 覆盖；等级/徽章常量已在 Task 3 Step 4 内文定稿。
- Spec §6（comparePeriods/buildReportMarkdown + stats:trend/stats:report:generate）→ Task 4；「上期为 0 → changeTotalPercent null」测试已在 Task 4 Step 2 覆盖。
- Spec §7（exceljs + stats:exportExcel + 双 Sheet）→ Task 5。
- 无占位符：所有函数均含可直接运行代码或显式实现说明。
