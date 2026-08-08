# 事件通知页面（v1.0）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 控制中心新增「事件」页签，展示本次运行的事件流（倒序、上限 200、可筛选/详情/清空），主进程以环形缓冲记录所有事件注入路径的新增事件。

**Architecture:** 新增共享纯模块 `src/shared/eventState.ts`（状态归类/来源分组/优先级口径/筛选，`STATE_CATEGORIES` 从 eventCenter 迁入）；新增 `src/main/event/eventHistory.ts` 环形缓冲；主进程所有注入点统一走 `applyEvent()`（活跃集 addEvent 照旧 + 命中"新增"时写入历史并广播 `pet:events:history` 全量快照）；渲染层新页签订阅快照 + 拉取 `events:history` 初始化。只读消费端，事件中心/sourceHub 架构不动。

**Tech Stack:** TypeScript 严格模式、vitest（现有 415 测试）、Electron、零新依赖。

## Global Constraints

- **零新增依赖**：不得 `npm install` 任何新包。
- **类型严格**：`npm run typecheck`（node + web 两个 tsc）必须 0 错误。
- **回归绿**：`npm test` 全部通过（当前 415 条，完成后只增不减）；`npm run build` 成功。
- **本项目无 git**：所有任务省略 commit 步骤，任务末尾以 `npm run typecheck` + 相关 vitest 文件跑通作为验收；全部 6 个任务完成后统一 bump 版本 + 更新 CHANGELOG。
- 命令规范：单文件测试 `npx vitest run <path>`；全量 `npm test`。
- 代码不写注释、不加 emoji（遵守仓库风格）。

---

### Task 1: 共享事件状态模块（迁移 STATE_CATEGORIES + 纯函数）

**Files:**
- Create: `src/shared/eventState.ts`
- Create: `src/shared/eventState.test.ts`
- Modify: `src/main/event/eventCenter.ts`

**Interfaces:**
- Consumes: `PetEventInfo`（`src/shared/ipc.ts`，已存在）。
- Produces（供 Task 5 与后续使用）：
  - `export const PET_STATES: readonly ['idle','focus','sleep','happy','warning']`
  - `export type PetState = (typeof PET_STATES)[number]`
  - `export const STATE_CATEGORIES: Record<Exclude<PetState, 'idle'>, readonly string[]>`
  - `export function stateOf(type: string): PetState`
  - `export function groupLabel(source: string): string`
  - `export function isHighPriority(priority: number): boolean`
  - `export interface HistoryFilter { source: string; state: string; highOnly: boolean }`
  - `export function filterHistory(events: PetEventInfo[], filter: HistoryFilter): PetEventInfo[]`
- eventCenter.ts 改从 shared 导入并 re-export（保持所有现有 import 方不变）。

- [ ] **Step 1: 写失败测试**

`src/shared/eventState.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { filterHistory, groupLabel, isHighPriority, stateOf } from './eventState'
import type { PetEventInfo } from './ipc'

describe('stateOf', () => {
  it('已知类型归类', () => {
    expect(stateOf('cpu_high')).toBe('warning')
    expect(stateOf('success')).toBe('happy')
    expect(stateOf('user_idle')).toBe('sleep')
    expect(stateOf('notice')).toBe('focus')
  })
  it('未知类型 → idle', () => {
    expect(stateOf('whatever')).toBe('idle')
  })
})

describe('groupLabel', () => {
  it('首段映射', () => {
    expect(groupLabel('monitor:cpu')).toBe('系统监控')
    expect(groupLabel('plugin:weather')).toBe('插件')
    expect(groupLabel('clipboard')).toBe('剪贴板')
    expect(groupLabel('folder')).toBe('目录')
    expect(groupLabel('foreground')).toBe('前台应用')
    expect(groupLabel('push:abc')).toBe('推送')
    expect(groupLabel('schedule:1')).toBe('日程')
    expect(groupLabel('autoReport:week')).toBe('自动报告')
  })
  it('未知 source 原样返回', () => {
    expect(groupLabel('strange:x')).toBe('strange:x')
  })
})

describe('isHighPriority', () => {
  it('阈值 8', () => {
    expect(isHighPriority(8)).toBe(true)
    expect(isHighPriority(80)).toBe(true)
    expect(isHighPriority(7)).toBe(false)
    expect(isHighPriority(4)).toBe(false)
  })
})

describe('filterHistory', () => {
  const ev = (over: Partial<PetEventInfo> = {}): PetEventInfo => ({
    source: 'clipboard',
    type: 'clipboard',
    priority: 5,
    durationMs: 8000,
    occurredAt: 1,
    ...over
  })
  it('空筛选全部保留', () => {
    const list = [ev({ type: 'clipboard' }), ev({ type: 'success', source: 'plugin:x' })]
    expect(filterHistory(list, { source: '', state: '', highOnly: false })).toHaveLength(2)
  })
  it('按来源组过滤', () => {
    const list = [ev({ type: 'clipboard' }), ev({ type: 'success', source: 'plugin:x' })]
    expect(filterHistory(list, { source: '插件', state: '', highOnly: false })).toEqual([list[1]])
  })
  it('按状态过滤', () => {
    const list = [ev({ type: 'clipboard' }), ev({ type: 'cpu_high', source: 'monitor:cpu', priority: 9 })]
    expect(filterHistory(list, { source: '', state: 'warning', highOnly: false })).toEqual([list[1]])
  })
  it('仅高优先级', () => {
    const list = [ev({ type: 'clipboard' }), ev({ type: 'cpu_high', source: 'monitor:cpu', priority: 9 })]
    expect(filterHistory(list, { source: '', state: '', highOnly: true })).toEqual([list[1]])
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/shared/eventState.test.ts`
Expected: 编译报错（`./eventState` 模块不存在）。

- [ ] **Step 3: 实现 `src/shared/eventState.ts`**

```ts
import type { PetEventInfo } from './ipc'

export const PET_STATES = ['idle', 'focus', 'sleep', 'happy', 'warning'] as const
export type PetState = (typeof PET_STATES)[number]

export const STATE_CATEGORIES: Record<Exclude<PetState, 'idle'>, readonly string[]> = {
  warning: ['cpu_high', 'memory_warning', 'battery_low', 'network_error', 'alarm', 'warning', 'error'],
  happy: ['complete', 'success', 'reward'],
  sleep: ['user_idle', 'sleep', 'away', 'lock_screen'],
  focus: ['working', 'focus', 'busy', 'notice']
}

export function stateOf(type: string): PetState {
  for (const state of PET_STATES) {
    if (state === 'idle') continue
    if (STATE_CATEGORIES[state].includes(type)) return state
  }
  return 'idle'
}

const GROUP_LABELS: Record<string, string> = {
  monitor: '系统监控',
  plugin: '插件',
  clipboard: '剪贴板',
  folder: '目录',
  foreground: '前台应用',
  push: '推送',
  schedule: '日程',
  autoReport: '自动报告'
}

export function groupLabel(source: string): string {
  const key = source.split(':')[0]
  return GROUP_LABELS[key] ?? source
}

export function isHighPriority(priority: number): boolean {
  return priority >= 8
}

export interface HistoryFilter {
  source: string
  state: string
  highOnly: boolean
}

export function filterHistory(events: PetEventInfo[], filter: HistoryFilter): PetEventInfo[] {
  return events.filter((e) => {
    if (filter.source !== '' && groupLabel(e.source) !== filter.source) return false
    if (filter.state !== '' && stateOf(e.type) !== filter.state) return false
    if (filter.highOnly && !isHighPriority(e.priority)) return false
    return true
  })
}
```

- [ ] **Step 4: 改造 `src/main/event/eventCenter.ts` 用共享模块**

把文件头部的 `PET_STATES`/`PetState`/`STATE_CATEGORIES` 定义（第 1-17 行）删除，改为：

```ts
import type { PetState } from '../../shared/eventState'
import { PET_STATES, STATE_CATEGORIES } from '../../shared/eventState'

export { PET_STATES, STATE_CATEGORIES }
export type { PetState }
```

`PetEvent` 接口与 `RANK`、`addEvent`/`activeEvents`/`diffEventTypes`/`computeState` 保持原样不动（`computeState` 内引用的 `PET_STATES`/`STATE_CATEGORIES` 现在来自 import）。

- [ ] **Step 5: 测试通过**

Run: `npx vitest run src/shared/eventState.test.ts src/main/event/eventCenter.test.ts`
Expected: 新测试全过，eventCenter 既有测试全过（行为零变化）。

- [ ] **Step 6: 全量回归**

Run: `npm run typecheck` 0 错误；`npm test` 全过。

---

### Task 2: 事件历史环形缓冲（纯模块）

**Files:**
- Create: `src/main/event/eventHistory.ts`
- Create: `src/main/event/eventHistory.test.ts`

**Interfaces:**
- Consumes: `PetEvent`（`src/main/event/eventCenter.ts` 导出，type-only import）。
- Produces（供 Task 4 使用）：
  - `export interface EventHistory { add(ev: PetEvent): void; list(): PetEvent[]; clear(): void; readonly size: number }`
  - `export function createEventHistory(limit?: number): EventHistory`（默认 200；add 追加、超出移除最旧；list 返回最新在前的拷贝；clear 清空）

- [ ] **Step 1: 写失败测试**

`src/main/event/eventHistory.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { createEventHistory } from './eventHistory'
import type { PetEvent } from './eventCenter'

function ev(over: Partial<PetEvent> = {}): PetEvent {
  return { source: 'a', type: 't', priority: 5, durationMs: 8000, occurredAt: 1, ...over }
}

describe('createEventHistory', () => {
  it('add 后 list 倒序（最新在前）', () => {
    const h = createEventHistory()
    h.add(ev({ source: 'a', occurredAt: 1 }))
    h.add(ev({ source: 'b', occurredAt: 2 }))
    expect(h.list().map((e) => e.source)).toEqual(['b', 'a'])
  })
  it('超出 limit 淘汰最旧', () => {
    const h = createEventHistory(2)
    h.add(ev({ source: 'a' }))
    h.add(ev({ source: 'b' }))
    h.add(ev({ source: 'c' }))
    expect(h.list().map((e) => e.source)).toEqual(['c', 'b'])
    expect(h.size).toBe(2)
  })
  it('重复 add 不去重（去重由调用方按"新增"语义负责）', () => {
    const h = createEventHistory()
    h.add(ev({ source: 'a', type: 't' }))
    h.add(ev({ source: 'a', type: 't' }))
    expect(h.size).toBe(2)
  })
  it('clear 清空', () => {
    const h = createEventHistory()
    h.add(ev({}))
    h.clear()
    expect(h.list()).toEqual([])
    expect(h.size).toBe(0)
  })
  it('list 返回拷贝，外部修改不影响内部', () => {
    const h = createEventHistory()
    h.add(ev({}))
    const l = h.list()
    l[0]!.source = 'mutated'
    expect(h.list()[0]!.source).toBe('a')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/main/event/eventHistory.test.ts`
Expected: 模块未定义报错。

- [ ] **Step 3: 实现 `src/main/event/eventHistory.ts`**

```ts
import type { PetEvent } from './eventCenter'

export interface EventHistory {
  add(ev: PetEvent): void
  list(): PetEvent[]
  clear(): void
  readonly size: number
}

export function createEventHistory(limit = 200): EventHistory {
  const items: PetEvent[] = []
  function add(ev: PetEvent): void {
    items.push(ev)
    while (items.length > limit) items.shift()
  }
  function list(): PetEvent[] {
    return [...items].reverse()
  }
  function clear(): void {
    items.length = 0
  }
  return { add, list, clear, get size(): number { return items.length } }
}
```

- [ ] **Step 4: 测试通过 + 全量回归**

Run: `npx vitest run src/main/event/eventHistory.test.ts`；然后 `npm run typecheck` + `npm test`。

---

### Task 3: IPC 类型 + preload 暴露

**Files:**
- Modify: `src/shared/ipc.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`

**Interfaces:**
- Produces（供 Task 4/5 使用）：
  - `export interface EventHistoryResult { ok: boolean; events: PetEventInfo[] }`
  - `export interface HistoryChanged { events: PetEventInfo[] }`
  - `window.desktopPet.events.history(): Promise<EventHistoryResult>`（invoke `events:history`）
  - `window.desktopPet.events.clearHistory(): Promise<{ ok: boolean }>`（invoke `events:historyClear`）
  - `window.desktopPet.events.onHistoryChanged(cb: (payload: HistoryChanged) => void): () => void`（监听 `pet:events:history`）

- [ ] **Step 1: 扩展 `src/shared/ipc.ts`**

在 `EventSnapshot`（约 155-160 行）之后追加：

```ts
/** 事件历史：初始化拉取结果（主进程 → 控制中心） */
export interface EventHistoryResult {
  ok: boolean
  events: PetEventInfo[]
}

/** 事件历史：新增记录时广播的全量快照 */
export interface HistoryChanged {
  events: PetEventInfo[]
}
```

- [ ] **Step 2: 扩展 `src/preload/index.ts`**

import 区（第 11 行附近）追加 `HistoryChanged`（与 `EventSnapshot` 同源 import）。

`events` 对象内 `snapshot` 方法之后追加：

```ts
    history: (): Promise<EventHistoryResult> => ipcRenderer.invoke('events:history'),
    clearHistory: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('events:historyClear'),
    onHistoryChanged: (cb: (payload: HistoryChanged) => void): (() => void) => {
      const handler = (_e: Electron.IpcRendererEvent, payload: HistoryChanged): void => cb(payload)
      ipcRenderer.on('pet:events:history', handler)
      return () => ipcRenderer.removeListener('pet:events:history', handler)
    },
```

import 区同步加 `EventHistoryResult` 类型引用（返回值标注用）。

- [ ] **Step 3: 扩展 `src/preload/index.d.ts`**

`events` 接口（123 行起）内 `snapshot()` 行后追加：

```ts
    history(): Promise<EventHistoryResult>
    clearHistory(): Promise<{ ok: boolean }>
    onHistoryChanged(cb: (payload: HistoryChanged) => void): () => void
```

import 区（第 10 行附近）加 `EventHistoryResult, HistoryChanged`。

- [ ] **Step 4: 全量回归**

Run: `npm run typecheck` 0 错误；`npm test` 全过。

---

### Task 4: 主进程接线（applyEvent + history handlers）

**Files:**
- Modify: `src/main/index.ts`

**Interfaces:**
- Consumes: `createEventHistory`（Task 2）、`PetEvent`（已 import）。
- Produces：
  - 模块级 `const eventHistory = createEventHistory()`（默认 200）
  - `function applyEvent(ev: PetEvent): void`：活跃集 `addEvent` 照旧；若原活跃集**无**同 source+type（即"新增"）→ `eventHistory.add(ev)` + `notifyCenter('pet:events:history', { events: eventHistory.list() })`
  - `ipcMain.handle('events:history', ...)` → `{ ok: true, events: eventHistory.list() }`
  - `ipcMain.handle('events:historyClear', ...)` → 清空 + 广播空快照 + `{ ok: true }`

- [ ] **Step 1: 加历史实例与 applyEvent**

`let events: PetEvent[] = []`（约 112 行）之后加：

```ts
const eventHistory = createEventHistory()
```

`buildEventSnapshot()` 定义（约 335 行）之后加：

```ts
function applyEvent(ev: PetEvent): void {
  const isNew = !events.some((e) => e.source === ev.source && e.type === ev.type)
  events = addEvent(events, ev)
  if (isNew) {
    eventHistory.add(ev)
    notifyCenter('pet:events:history', { events: eventHistory.list() })
  }
}
```

文件头 import 区追加：`import { createEventHistory } from './event/eventHistory'`。

- [ ] **Step 2: 替换全部注入点为 applyEvent**

逐处替换（搜索 `events = addEvent(events,`，共 5 处 + 1 处 inject）：
- `fireSchedule` 内（约 359 行）：`events = addEvent(events, alarmEvent)` → `applyEvent(alarmEvent)`
- `onPushApiEvent` 内（约 636 行）：`events = addEvent(events, {` 开头的整段 → `applyEvent({` 同参对象，末尾 `})` 闭合不变
- `passive:test` clipboard（约 927 行）：`events = addEvent(events, { source: 'clipboard', ... })` → `applyEvent({ source: 'clipboard', ... })`
- `passive:test` folder（约 943 行）：同法
- `passive:test` foreground（约 955 行）：同法
- `sourceHub` ctx.inject（约 1191 行）：`inject: (ev) => { events = addEvent(events, ev) }` → `inject: (ev) => applyEvent(ev)`

替换后全项目不再有任何直接 `addEvent` 调用（可用 `Select-String -Path src\main\index.ts -Pattern "addEvent"` 复核，仅剩 applyEvent 内部）。

- [ ] **Step 3: 新增两个 handler**

`events:snapshot` handler（约 802 行）之后追加：

```ts
  ipcMain.handle('events:history', () => ({ ok: true, events: eventHistory.list() }))
  ipcMain.handle('events:historyClear', () => {
    eventHistory.clear()
    notifyCenter('pet:events:history', { events: [] })
    return { ok: true }
  })
```

- [ ] **Step 4: 全量回归**

Run: `npm run typecheck` 0 错误；`npm test` 全过；`npm run build` 成功。

---

### Task 5: 控制中心「事件」页签

**Files:**
- Modify: `src/renderer/src/center/CenterApp.tsx`

**Interfaces:**
- Consumes: `filterHistory`/`groupLabel`/`stateOf`（Task 1）、`EventHistoryResult`/`HistoryChanged`/`PetEventInfo`（Task 3 ipc）、`window.desktopPet.events.history/clearHistory/onHistoryChanged`（Task 3 preload）。
- Produces: Tab 类型 `'events'`、TABS 项 `{ key: 'events', label: '事件' }`（push 之后）、哈希 `#/events` 映射、事件页 JSX。

- [ ] **Step 1: 类型与常量**

- 第 31 行 `type Tab = ...` 在 `'push'` 后加 `| 'events'`：
  ```ts
  type Tab = 'home' | 'characters' | 'market' | 'speech' | 'schedule' | 'stats' | 'push' | 'events' | 'dev' | 'settings'
  ```
- TABS 数组（约 40 行）`{ key: 'push', label: '推送' },` 之后加：
  ```ts
  { key: 'events', label: '事件' },
  ```
- import 区（第 7 行 `EventSnapshot` 同一 import 块）追加 `EventHistoryResult, HistoryChanged, PetEventInfo`；第 21 行附近追加：
  ```ts
  import { filterHistory, groupLabel, stateOf } from '../../../shared/eventState'
  ```

- [ ] **Step 2: 状态与订阅**

在 `const [eventSnapshot, setEventSnapshot] = useState<EventSnapshot | null>(null)`（约 398 行）附近追加：

```ts
  const [historyEvents, setHistoryEvents] = useState<PetEventInfo[]>([])
  const [histSource, setHistSource] = useState('')
  const [histState, setHistState] = useState('')
  const [histHighOnly, setHistHighOnly] = useState(false)
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)
```

初始化 effect（约 506 行 `events.snapshot()` 块）内、`offEvents` 声明后追加：

```ts
    const offHistory = window.desktopPet.events.onHistoryChanged((payload: HistoryChanged) =>
      setHistoryEvents(payload.events)
    )
    void window.desktopPet.events.history().then((r: EventHistoryResult) => setHistoryEvents(r.events)).catch((err) => {
      console.error('[events.history] failed:', err)
    })
```

cleanup（约 519-524 行 return 块）追加 `offHistory()`。

handleClear 函数（放在 handlePassiveTest 附近任意 handler 区）：

```ts
  const handleClearHistory = (): void => {
    if (historyEvents.length === 0) return
    if (!window.confirm('清空全部事件记录？')) return
    void window.desktopPet.events.clearHistory()
  }
```

- [ ] **Step 3: 哈希映射**

applyTab（约 537 行 `else if (h.includes('/push'))` 之后）加：

```ts
      else if (h.includes('/events')) setTab('events')
```

- [ ] **Step 4: 事件页 JSX**

在 `{tab === 'dev' && (` 块（约 2740 行）**之前**插入：

```tsx
      {tab === 'events' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>事件通知</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={histSource}
                  onChange={(e) => setHistSource(e.target.value)}
                  className="w-36 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                >
                  <option value="">全部来源</option>
                  {[...new Set(historyEvents.map((e) => groupLabel(e.source)))].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <select
                  value={histState}
                  onChange={(e) => setHistState(e.target.value)}
                  className="w-32 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                >
                  <option value="">全部状态</option>
                  {['warning', 'happy', 'sleep', 'focus', 'idle'].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={histHighOnly}
                    onChange={(e) => setHistHighOnly(e.target.checked)}
                  />
                  仅高优先级
                </label>
                <Button variant="outline" size="sm" onClick={handleClearHistory}>
                  清空
                </Button>
              </div>
              {filterHistory(historyEvents, { source: histSource, state: histState, highOnly: histHighOnly }).length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">暂无事件记录</div>
              ) : (
                <div className="divide-y divide-border rounded-md border border-border">
                  {filterHistory(historyEvents, { source: histSource, state: histState, highOnly: histHighOnly }).map((e, i) => (
                    <div key={`${e.source}-${e.occurredAt}-${i}`}>
                      <button
                        type="button"
                        onClick={() => setExpandedIndex(expandedIndex === i ? null : i)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left"
                      >
                        <Badge variant="muted">{stateOf(e.type)}</Badge>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {new Date(e.occurredAt).toLocaleTimeString('zh-CN', { hour12: false })}
                        </span>
                        <span className="text-sm font-medium">{groupLabel(e.source)}</span>
                        <span className="text-sm text-muted-foreground">{e.type}</span>
                        <span className="ml-auto text-xs text-muted-foreground">P{e.priority}</span>
                      </button>
                      {expandedIndex === i && (
                        <div className="break-all border-t border-border px-3 py-2 text-xs text-muted-foreground">
                          <div>source: {e.source}</div>
                          <div>type: {e.type}</div>
                          <div>priority: {e.priority}</div>
                          <div>durationMs: {e.durationMs}</div>
                          <div>occurredAt: {new Date(e.occurredAt).toISOString()}</div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
```

（`filterHistory` 调用了两次；可接受，列表 ≤200 条开销可忽略。若想更整洁可在 return 前加 `const visible = filterHistory(...)` 缓存——二选一即可，功能一致。）

- [ ] **Step 5: 全量回归**

Run: `npm run typecheck` 0 错误；`npm test` 全过；`npm run build` 成功。

---

### Task 6: 收盘（文档同步 + CHANGELOG + bump + 备份 + 端到端）

**Files:**
- Modify: `docs/使用说明.md`（§2.6 控制中心页签列表 + §2.13 之后可加一行指向）
- Modify: `docs/API设计.md`（§3 preload 面与通道表、§6 标记已落地）
- Modify: `CHANGELOG.md`
- （脚本）`node .superpowers\sdd\bump-version.js 0.9.0807.01 1.0.0807.01` + `node .superpowers\sdd\copy-backup.js "backup\backup_20260807_v1.0-event-notifications"`

- [ ] **Step 1: 使用说明同步**

`docs/使用说明.md` §2.6 列表在「**推送**」行之后加：

```md
- **事件**：事件通知页（本次运行的事件流：来源/状态/高优先级筛选、单条详情、清空，见 §2.14）。
```

文件末尾（§6 之前或之后）新增小节：

```md
### 2.14 事件通知页（v1.0）

控制中心「事件」页签展示**本次运行**的事件流（最新在前，上限 200 条，重启清空，不落盘）：

- 覆盖来源：系统监控 / 插件 / 剪贴板 / 目录 / 前台应用 / 推送 / 日程 / 自动报告。
- 筛选：来源下拉（按当前历史实际出现的来源分组）、状态归类下拉（warning/happy/sleep/focus/idle）、「仅高优先级」（priority ≥ 8，即系统告警/插件/推送/日程，不含被动源与空闲）。
- 点击行展开详情（source/type/priority/durationMs/occurredAt 原始字段）；「清空」二次确认后清空本次记录。
- 只记"新发生"的事件：同一来源+类型持续活跃时反复刷新不算新记录，避免刷屏。
```

- [ ] **Step 2: API设计.md 同步**

§3 preload 暴露面代码块 `events` 段补三行（或与现有风格合并）：

```ts
  events.history()            // v1.0：事件历史全量（events:history）
  events.clearHistory()       // v1.0：清空本次运行事件历史（events:historyClear）
  events.onHistoryChanged(cb) // v1.0：事件历史变化广播（pet:events:history）
```

§3「事件推送（主→渲染）」表格补一行：

```md
| pet:events:history | {events: PetEventInfo[]} | ✔ v1.0 已实现：新增事件记录时广播历史全量快照 |
```

§6「v1.0 规划：事件通知页面（纲要）」标题旁标注状态：`（已落地 2026-08-07，见 §2.14 使用说明与本版 CHANGELOG）`，正文保留作为历史纲要。

- [ ] **Step 3: CHANGELOG + bump + 备份**

`CHANGELOG.md` 顶部新增版本段：

```md
## v1.0.0807.01 (事件通知页面，开发版)

Date: 2026-08-07

新增：
- 控制中心新增「事件」页签：展示本次运行的事件流（最新在前，上限 200 条环形缓冲，重启清空），覆盖系统监控/插件/剪贴板/目录/前台/推送/日程/自动报告全部注入路径
- 来源分组筛选（系统监控/插件/剪贴板/目录/前台应用/推送/日程/自动报告）、状态归类筛选（warning/happy/sleep/focus/idle）、「仅高优先级」（priority ≥ 8）开关
- 单条展开详情（原始字段 source/type/priority/durationMs/occurredAt）；「清空」二次确认
- 历史只记录"新发生"事件：同 source+type 持续活跃的替换刷新不产生新记录，避免告警持续期间刷屏
- 状态归类/来源分组/优先级口径抽为共享纯模块（`src/shared/eventState.ts`，`STATE_CATEGORIES` 自 eventCenter 迁入，行为不变）
- 新增 IPC：`events:history` / `events:historyClear` / `pet:events:history`（全量快照广播）

已知问题：
- 事件历史仅本次运行内存保存，重启后清空（按设计非目标，不做持久化）
```

Run:

```bash
node .superpowers\sdd\bump-version.js 0.9.0807.01 1.0.0807.01
npm run typecheck
npm test
npm run build
node .superpowers\sdd\copy-backup.js "backup\backup_20260807_v1.0-event-notifications"
```

- [ ] **Step 4: 端到端验证（CDP）**

启动调试实例（沿用既有 CDP 端口习惯，如 `--remote-debugging-port=9226`；先杀旧实例再启动，避免单实例锁与半写渲染包白屏问题），参考 `C:\Users\30816\AppData\Local\Temp\opencode\cdp-*.mjs` 既有驱动脚本写法：

1. 打开控制中心 → `#/events` 哈希 → 事件页可见
2. 触发剪贴板（复制一个链接）→ 事件页出现「剪贴板」来源条目；触发推送测试（`push:test`）→ 出现「推送」条目
3. 打开「仅高优先级」→ 剪贴板条目（P5）消失、推送条目（P50）保留；切状态筛选 warning 仅剩推送
4. 点击行展开 → 详情字段完整；「清空」确认 → 列表空 + 空状态文案
5. 宠物侧回归：气泡行为不受影响（复制链接仍有台词气泡）

---

## Self-Review

- **Spec coverage**：spec 决策 1（本次运行环形 200）→ Task 2/4；决策 2（只记新增）→ Task 4 applyEvent；决策 3（三通道）→ Task 3/4；决策 4（阈值 8）→ Task 1 isHighPriority；决策 5（分类共用 + 迁移）→ Task 1；决策 6（新页签、首页卡片保留）→ Task 5；决策 7（零依赖/TDD）→ 各任务约束；模块 1-7 → Task 1-6 一一对应；实施顺序 → 任务顺序一致。
- **Placeholder scan**：全部 Step 带真实代码或明确替换目标；无 TBD/「按需处理」措辞。Task 5 明确 `filterHistory` 双调用可接受或 `visible` 缓存二选一（有取舍无模糊）。
- **Type consistency**：`createEventHistory` 签名 Task 2 定义、Task 4 使用一致；`EventHistoryResult`/`HistoryChanged` Task 3 定义、Task 4 handler 与 Task 5 渲染一致；`applyEvent` 在 Task 4 定义并被自身 6 处替换点使用；`groupLabel`/`stateOf`/`isHighPriority`/`filterHistory` 参数与返回在 Task 1 定义、Task 5 使用一致；preload 三方法名与 ipc 通道名（`events:history`/`events:historyClear`/`pet:events:history`）全链一致；版本 bump `1.0.0807.01` 在 Task 6 中所有引用一致。
