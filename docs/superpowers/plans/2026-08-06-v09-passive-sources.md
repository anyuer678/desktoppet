# v0.9 事件中心架构化 + 被动数据源 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构事件中心为可插拔数据源架构（sourceHub + EventSource），迁移既有 4 源（system/plugin/schedule/push）行为不变，并新增剪贴板 / 目录 / 前台应用三个被动数据源；控制中心新增「开发者」tab 供精调。

**Architecture:** 新建 `src/main/event/sourceHub.ts`（注册表 + tick 驱动 + ctx 委托）；迁移时事件 type/priority/durationMs/通道名全部不变（回归保绿）；新源各自独立文件、纯函数可单测；配置存 `userData/passiveSources.json`（passiveStore 模式仿 pushApiStore）；主进程 index.ts 只保留 tick 驱动与 diff/状态广播。

**Tech Stack:** Electron + TypeScript + vitest + Node `fs.watch` + Electron `clipboard` + `child_process` PowerShell（零新依赖）。

## Global Constraints

- 零新增依赖（spec §1）。
- 只读本地、不联网、主进程计算、纯函数可单测（spec §1）。
- 迁移时既有事件 type/priority/durationMs/通道名不变（spec §3.3），335 测试保绿。
- 前台检测仅取进程名+窗口标题（元数据，不读内容）（spec §4.3）。
- 默认低打扰：剪贴板开（默认规则）、目录关（需配置路径）、前台关（默认无映射不注入）（spec §2）。
- 分 3 构建：`.01` 架构迁移+剪贴板规则纯函数 / `.02` 剪贴板+目录源+配置 store+IPC / `.03` 前台源+开发者 tab+文档+备份 v09-complete。
- 版本 `v0.9.0806.01→.03`；测试 `npm test`、typecheck `npm run typecheck`、build `npm run build`。
- 文档每构建同步：CHANGELOG / 使用说明 / API设计 / 架构设计 §9。

---

### Task 1: 事件源接口 + SourceHub（sourceHub.ts）

**Files:**
- Create: `src/main/event/sourceHub.ts`
- Test: `src/main/event/sourceHub.test.ts`

**Interfaces:**
- Produces:
  - `SourceContext { inject(ev: PetEvent): void; notify(channel: string, payload?: unknown): void; count(type: string): void; log(level: 'info'|'warn'|'error', msg: string, ...args: unknown[]): void }`
  - `EventSource { id: string; kind: 'poll'|'watch'; enabled(): boolean; start(ctx: SourceContext): void; stop(): void; poll?(now: number): void }`
  - `createSourceHub(ctx: SourceContext, sources: EventSource[]): { tick(now: number): void; start(): void; stop(): void }`
  - `tick(now)`：驱动全部 `kind='poll'` 且 `enabled()` 的源调用 `poll(now)`；单源异常 try/catch 仅记日志不中断其他源。
  - `start()`：对每个源（先 enabled 检查）调 `start(ctx)`，watch 型注册回调；幂等（重复 start 不重复调用）。
  - `stop()`：全部 `stop()` 幂等。
- Consumes: `PetEvent`（`../event/eventCenter` 已有类型）。

**Steps:**
1. 新建 `src/main/event/sourceHub.ts`，定义 `SourceContext` / `EventSource` / `createSourceHub`。
2. 新建 `src/main/event/sourceHub.test.ts`：
   - poll 源被 tick 调用且次数正确；disabled 源不被调用。
   - poll 源抛异常 → 其他源仍被调用、log 收到 error。
   - watch 源 start 收到 ctx；stop 被调用；start 幂等（两次 start 只调一次源 start）。
   - stop 幂等。
3. `npm test -- sourceHub` 通过；typecheck。

---

### Task 2: 迁移 system + plugin 源（行为不变）

**Files:**
- Create: `src/main/event/sources/systemSource.ts`
- Create: `src/main/event/sources/pluginSource.ts`
- Modify: `src/main/index.ts`（tick 改用 sourceHub）

**Interfaces:**
- Produces:
  - `createSystemSource(sampleFn: () => SystemSample, cfg?: MonitorConfig): EventSource`（kind='poll'，enabled 恒 true；poll() 内部保持现有 `nextSystemEvents` 过滤 `monitor:*` 并重注入语义）
  - `createPluginSource(getPlugins: () => PluginManifest[]): EventSource`（kind='poll'，enabled 恒 true；poll() 内清除旧 `plugin:*` 再注入新事件）
- Consumes: `SystemSample` / `MonitorConfig` / `DEFAULT_MONITOR_CONFIG`（`../monitor/systemMonitor`）、`nextSystemEvents`（同文件）、`PluginManifest` / `pluginEventsToPetEvents`（`../plugin/pluginHost`）。
- 注意：两个源的 ctx.inject 只负责「更新 events 数组」：systemSource 的 poll 需操作**整表过滤+替换**——因此 ctx 增加一个能力：`replaceBySource(sourcePrefix: string, events: PetEvent[]): void`（在 SourceContext 中新增，Task 1 的 ctx 定义一并加上）。`replaceBySource` 从事件数组移除 `source.startsWith(prefix)` 的事件并追加新事件（保持现有语义：monitor 用 source 精确名 `monitor:cpu` 等，filter 用 `MONITOR_SOURCES` 集合；plugin 用 `source.startsWith('plugin:')`）。为统一，`replaceBySource(prefix: string, evs: PetEvent[])` 用 `startsWith(prefix)` 过滤，system 用前缀 `monitor:`，plugin 用前缀 `plugin:`（现有 `MONITOR_SOURCES` 均为 `monitor:*`，语义等价）。

**Steps:**
1. 在 Task 1 的 `sourceHub.ts` 中给 `SourceContext` 追加 `replaceBySource(prefix: string, events: PetEvent[]): void`；测试补一条用例（替换前缀事件）。
2. 新建 `src/main/event/sources/systemSource.ts`：
   ```ts
   export function createSystemSource(sampleFn, cfg = DEFAULT_MONITOR_CONFIG): EventSource {
     return {
       id: 'system',
       kind: 'poll',
       enabled: () => true,
       start: () => {},
       stop: () => {},
       poll(now) {
         ctx.replaceBySource('monitor:', nextSystemEvents([], sampleFn(), now, cfg))
       }
     }
   }
   ```
   （ctx 经 start 闭包捕获；`nextSystemEvents([], ...)` 传空数组因替换语义等价。）
3. 新建 `src/main/event/sources/pluginSource.ts`：
   ```ts
   export function createPluginSource(getPlugins): EventSource {
     return {
       id: 'plugin', kind: 'poll', enabled: () => true, start: () => {}, stop: () => {},
       poll(now) { ctx.replaceBySource('plugin:', pluginEventsToPetEvents(getPlugins(), now)) }
     }
   }
   ```
4. 修改 `src/main/index.ts`：
   - import `createSourceHub`、`createSystemSource`、`createPluginSource`。
   - whenReady 内（原 tick 位置）：构建 `sourceCtx`（`inject: (ev) => { events = addEvent(events, ev) }`、`replaceBySource: (p, evs) => { events = [...events.filter((e) => !e.source.startsWith(p)), ...evs] }`、`notify: notifyPet`、`count: (t) => recordStats((s) => countEvent(s, t))`、`log`）。
   - `const sourceHub = createSourceHub(sourceCtx, [createSystemSource(() => ({ ...sampler(), battery: batterySampler.get() })), createPluginSource(() => loadedPlugins)])`；`sourceHub.start()`；tick 内调用 `sourceHub.tick(now)` 替代原 `nextSystemEvents` + plugin 刷新两段。
   - 移除 `nextSystemEvents`/`pluginEventsToPetEvents`/`loadPlugins` 相关 import 若不再被别处使用（保留 `loadedPlugins` 声明与 `seedDefaultPlugins`）。
5. `npm test` 全量保绿（335）；typecheck；build。

---

### Task 2b: ~~迁移 schedule + push 源（行为不变）~~ — 已砍（2026-08-06 决策）

**决策记录**：schedule/push 现有启动路径稳定、行为不变，本迭代无迁移需求；若仅建源文件会成未接线死代码（YAGNI）。全量迁移留待后续版本按需进行。**本迭代不创建 scheduleSource.ts / pushSource.ts。**

### Task 3: 剪贴板规则纯函数（clipboard.ts）

**Files:**
- Create: `src/main/event/clipboard.ts`
- Test: `src/main/event/clipboard.test.ts`

**Interfaces:**
- Produces:
  - `ClipboardRules { onlyPatterns: string[]; ignorePatterns: string[]; maxLen: number }`
  - `clipboardShouldNotify(text: string, rules: ClipboardRules): { ok: boolean; reason?: string }`
    - 空/空白文本 → `{ ok:false, reason:'empty' }`
    - ignorePatterns 任一匹配 → `{ ok:false, reason:'ignored' }`
    - onlyPatterns 非空且全部不匹配 → `{ ok:false, reason:'not-matched' }`
    - 否则 `{ ok:true }`
  - `clipboardBody(text: string, maxLen: number): string`（截断到 maxLen，超长加 `…`）
- Consumes: 无（纯函数）。

**Steps:**
1. 新建 `src/main/event/clipboard.ts` 实现三个纯函数（正则用 `new RegExp(p)`，非法正则跳过）。
2. 新建 `src/main/event/clipboard.test.ts`：
   - 空文本拒绝；纯数字 ignorePatterns `^\d+$` 拒绝；超长文本按 ignorePatterns `^.{2001,}$` 拒绝。
   - onlyPatterns `['^http']`：命中通过、未命中拒绝；空 onlyPatterns 全部通过。
   - ignorePatterns 优先于 onlyPatterns。
   - 非法正则（`'['`）不抛异常且不匹配。
   - clipboardBody：≤maxLen 原样、超长截断加 `…`。
3. `npm test -- clipboard` 通过；typecheck。

---

### Task 4: passiveStore（配置存储）

**Files:**
- Create: `src/main/event/passiveStore.ts`
- Test: `src/main/event/passiveStore.test.ts`
- Modify: `src/shared/ipc.ts`（末尾追加类型）

**Interfaces:**
- Produces:
  - `PassiveClipboardConfig { enabled: boolean; pollMs: number; onlyPatterns: string[]; ignorePatterns: string[]; maxLen: number }`
  - `PassiveFolderConfig { enabled: boolean; dir: string; patterns: string[]; debounceMs: number }`
  - `PassiveForegroundConfig { enabled: boolean; pollMs: number; mappings: { process: string; state: 'focus'|'ignore' }[] }`
  - `PassiveSourcesConfig { clipboard: PassiveClipboardConfig; folder: PassiveFolderConfig; foreground: PassiveForegroundConfig }`
  - `DEFAULT_PASSIVE_SOURCES_CONFIG: PassiveSourcesConfig`（clipboard `{enabled:true, pollMs:3000, onlyPatterns:[], ignorePatterns:['^\\d+$','^\\s*$'], maxLen:120}`；folder `{enabled:false, dir:'', patterns:['*'], debounceMs:500}`；foreground `{enabled:false, pollMs:15000, mappings:[]}`）
  - `loadPassiveConfig(filePath): PassiveSourcesConfig`（缺字段逐项补默认；损坏 JSON 回默认）
  - `savePassiveConfig(filePath, cfg): void`
  - `validatePassiveConfig(cfg: unknown): string | null`（pollMs/debounceMs 正整数、patterns 非空字符串数组、only/ignorePatterns 字符串数组、mappings 数组且 process 非空、state ∈ {'focus','ignore'}、dir 字符串、maxLen 正整数）
- Consumes: 无。

**Steps:**
1. `src/shared/ipc.ts` 追加上述 5 个类型（含 JSDoc；`PassiveSourcesConfig` 等）。
2. 新建 `src/main/event/passiveStore.ts`：默认值、load（逐节 normalize）、save（mkdirSync + writeFileSync UTF-8）、validate。
3. 新建 `src/main/event/passiveStore.test.ts`：默认值形状、文件不存在→默认、缺字段逐项补默认、损坏 JSON 容错、validate 各非法值（pollMs 0/负数、patterns 含空串、mappings 非法 state、dir 非字符串）拒绝、合法通过、round-trip。
4. `npm test -- passiveStore` 通过；typecheck。

---

### Task 5: 剪贴板源 + 目录源（clipboardSource.ts / folderSource.ts）

**Files:**
- Create: `src/main/event/sources/clipboardSource.ts`
- Create: `src/main/event/sources/folderSource.ts`
- Test: `src/main/event/sources/clipboardSource.test.ts`
- Test: `src/main/event/sources/folderSource.test.ts`

**Interfaces:**
- Produces:
  - `createClipboardSource(readText: () => string, cfg: () => PassiveClipboardConfig): EventSource`
    - kind='poll'；poll(now)：`readText()` → 与上次非空且不同 → `clipboardShouldNotify` → 通过则 `ctx.count('clipboard')` + `ctx.inject({source:'clipboard', type:'clipboard', priority:5, durationMs:8000, occurredAt:now})` + `ctx.notify('push:fired', {title:'剪贴板', body: clipboardBody(text, cfg().maxLen)})`。
    - 内部记 lastText；轮询间隔由 hub tick 频率决定（剪贴板源不自行 setInterval，poll 内自己判断时间差 `now - lastPollAt >= cfg().pollMs` 才执行，未到则跳过）。
  - `createFolderSource(cfg: () => PassiveFolderConfig, listFiles: (dir: string) => string[]): EventSource`
    - kind='watch'；start(ctx)：`dir` 为空/不存在 → log warn 不启动；记录基线快照；`fs.watch(dir, {persistent:false}, cb)`；cb 收到事件 → 防抖 `debounceMs` 后重新 `listFiles` 与基线 diff → 新增文件逐个过 `folderShouldNotify` → 通过则 `ctx.count('folder')` + `ctx.inject({source:'folder', type:'folder', priority:5, durationMs:8000, occurredAt:now})` + `ctx.notify('push:fired', {title:fileName, body:路径})`；更新基线。stop() 关 watcher + 清定时器。
    - `listFiles` 注入便于测试；生产实现 = `readdirSync(dir)`（文件名数组）。
  - `folderShouldNotify(fileName: string, patterns: string[]): boolean`（glob 转正则：`*`→`.*`、`?`→`.`，全匹配任一即 true；空 patterns 视为 `['*']`）
- Consumes: `clipboardShouldNotify`/`clipboardBody`（Task 3）、`PassiveClipboardConfig`/`PassiveFolderConfig`（Task 4）、`EventSource`/`SourceContext`（Task 1）。

**Steps:**
1. 新建 `src/main/event/sources/clipboardSource.ts`（按上述接口；lastText 初始 ''）。
2. 新建 `src/main/event/sources/folderSource.ts`（含 `folderShouldNotify` 导出）。
3. 新建 `src/main/event/sources/clipboardSource.test.ts`：
   - 内容变化且通过规则 → inject/count/notify 各一次；相同内容不重复。
   - ignorePatterns 命中 → 不 inject。
   - 未到 pollMs 间隔 → 跳过。
   - 空文本变化 → 不触发。
4. 新建 `src/main/event/sources/folderSource.test.ts`：
   - `folderShouldNotify`：`*.png` 命中 a.png、拒绝 a.txt；`*report*` 命中；空 patterns=全匹配。
   - 注入 `listFiles`：start 后基线不触发；新增文件出现 → 触发一次；防抖期内多次 change → 合并为一次。
   - dir 为空 → start 不注册 watcher（log warn）。
5. `npm test -- sources` 通过；typecheck。

---

### Task 6: 前台应用源（foregroundSource.ts）

**Files:**
- Create: `src/main/event/sources/foregroundSource.ts`
- Test: `src/main/event/sources/foregroundSource.test.ts`

**Interfaces:**
- Produces:
  - `ForegroundApp { process: string; title: string }`
  - `getForegroundApp(runner: (cmd: string) => Promise<string>): Promise<ForegroundApp | null>`
    - runner 执行 PowerShell 脚本（spec §4.3 脚本），输出 `进程名|标题`；空/异常 → null（调用方记日志不崩）。
  - `foregroundMapping(app: ForegroundApp, mappings: { process: string; state: 'focus'|'ignore' }[]): { process: string; state: 'focus'|'ignore' } | null`（进程名精确匹配，不区分大小写）
  - `createForegroundSource(getCfg: () => PassiveForegroundConfig, runner: (cmd: string) => Promise<string>): EventSource`
    - kind='poll'；poll(now)：间隔未到跳过（同剪贴板）；`getForegroundApp(runner)` → null 则返回；进程未变化跳过；映射 → state='focus' → `ctx.inject({source:'foreground', type:'working', priority:4, durationMs: cfg().pollMs*2, occurredAt:now})`；任何变化 `ctx.count('foreground')`；映射 null/ignore 不注入。
- Consumes: `PassiveForegroundConfig`（Task 4）、`EventSource`（Task 1）。

**Steps:**
1. 新建 `src/main/event/sources/foregroundSource.ts`（PowerShell 脚本字符串常量 `FOREGROUND_PS_SCRIPT`）。
2. 新建 `src/main/event/sources/foregroundSource.test.ts`：
   - `foregroundMapping`：精确匹配、大小写不敏感、无匹配返回 null、ignore 返回。
   - `getForegroundApp`：注入 runner 返回 `code.exe|编辑器` → 解析正确；返回 `|` → process=''；reject → null。
   - `createForegroundSource`（注入 fake runner）：间隔未到跳过；进程变化+focus 映射 → inject working + count；无映射 → 仅 count；进程相同 → 不重复。
3. `npm test -- foregroundSource` 通过；typecheck。

---

### Task 7: 主进程接入被动源 + IPC/preload（.02）

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/shared/ipc.ts`（`PassiveGetResult`/`PassiveSetResult`/`PassiveTestResult`）
- Modify: `src/preload/index.ts`、`src/preload/index.d.ts`

**Interfaces:**
- Produces（index.ts 模块级）:
  - `let passiveCfg: PassiveSourcesConfig`（whenReady 加载 `userData/passiveSources.json`）
  - `passiveConfigPath()`
  - `let passiveHub: ReturnType<typeof createSourceHub> | null`（注册 system/plugin/clipboard/folder/foreground 全部源）
  - 现有 `sourceHub`（Task 2 的）替换为 `passiveHub`（Task 2 已注册 system/plugin，此处补 clipboard/folder/foreground）。
  - `passive:get` → `{ ok: true, config: passiveCfg }`
  - `passive:set`（validatePassiveConfig 通过 → 落盘 → **重建 hub**：stop 旧、load 新配置、createSourceHub 重新 start）→ `{ ok } | { ok:false, error }`
  - `passive:test`（sourceId: 'clipboard'|'folder'|'foreground'）→ 直接调用对应源逻辑模拟一次触发（剪贴板：`onClipboardChanged(force=true)`；目录：若未配置返回 `{ok:false,error:'未配置目录'}`，否则模拟第一条基线外文件；前台：若已启用调用其 poll 逻辑；返回 `{ ok: true }`）
- preload 暴露 `passive.get() / set(cfg) / test(sourceId)`。
- Consumes: Task 1~6 全部导出。

**Steps:**
1. index.ts：import `createSourceHub`、`createSystemSource`、`createPluginSource`、`createClipboardSource`、`createFolderSource`、`createForegroundSource`、`loadPassiveConfig`/`savePassiveConfig`/`validatePassiveConfig`、`DEFAULT_PASSIVE_SOURCES_CONFIG`。
2. whenReady：`passiveCfg = loadPassiveConfig(passiveConfigPath())`；构建 `sourceCtx`（同 Task 2）+ `rebuildPassiveHub()` 函数（创建/重建 hub 并 start；stop 旧 hub）。
3. tick 内 `passiveHub.tick(now)`（替换 Task 2 的 sourceHub 调用）。
4. registerIpc 追加 `passive:get/set/test` 三个 handler。
5. preload + index.d.ts 暴露 `passive` 三方法。
6. typecheck；build；`npm test` 保绿。

---

### Task 8: 控制中心「开发者」tab（.03）

**Files:**
- Modify: `src/renderer/src/center/CenterApp.tsx`

**Interfaces:**
- Produces:
  - Tab 类型加 `'dev'`；TABS 加 `{ key:'dev', label:'开发者' }`（位于「推送」之后、「设置」之前）。
  - state：`passiveCfg: PassiveSourcesConfig | null`、`passiveMsg: string`、`passiveSaving: boolean`。
  - handlers：`loadPassiveCfg()`、`handlePassiveSave()`、`handlePassiveTest(sourceId)`。
  - JSX：三个源卡片（剪贴板/目录/前台应用）——每卡：启用 Switch、关键参数 Input（pollMs / maxLen / dir / patterns（逗号分隔 textarea）/ mappings（`进程:focus,进程:ignore` textarea））、每源「测试」按钮；底部「保存」按钮 + 状态消息；目录可选「选择目录」按钮调 `window.desktopPet.dialog?.pickDirectory` 若 preload 存在（否则文本输入）。
- Consumes: preload `passive.get/set/test`。

**Steps:**
1. 加 `'dev'` 到 Tab 联合与 TABS。
2. import `PassiveSourcesConfig` 类型；加 state + handlers。
3. 挂载时（tab==='dev'）`loadPassiveCfg`。
4. 新增 JSX 区块（仿「推送」tab 卡片风格）：三源卡片 + 保存 + 测试按钮。
5. `npm run build` 通过；typecheck。

---

### Task 9: 文档、版本与备份（.03 收尾）

**Files:**
- Modify: `CHANGELOG.md`、`docs/使用说明.md`、`docs/API设计.md`、`docs/架构设计.md`、`package.json`、`package-lock.json`
- Create: `backup/backup_20260806_v09-01`、`backup/backup_20260806_v09-02`、`backup/backup_20260806_v09-complete`（或按实际构建节奏：.01/.02/.03 各自备份）

**Steps:**
1. 每个构建完成时（.01/.02/.03）用 node 脚本 bump 版本 `0.9.0806.01 → 0.9.0806.03`（**勿用 PowerShell Set-Content**）。
2. CHANGELOG 顶部新增 v0.9 条目（按构建分节）：架构化（sourceHub + 4 源迁移，行为不变）、剪贴板源、目录源、前台应用源、开发者 tab、passive IPC；记录测试数（以实际为准）。
3. 使用说明：新增「开发者选项 / 事件源」小节（§2.13 事件源与开发者选项：三个源的能力与默认行为、配置路径、精调入口）；控制中心 tab 列表加「开发者」。
4. API 设计文档：`passive:get/set/test` 契约 + preload `passive.*`。
5. 架构设计 §9 路线图新增 v0.9 行（含 .01/.02/.03 说明）。
6. 每构建备份：`backup/backup_20260806_v09-0X/`（src/docs/CHANGELOG/package.json/package-lock.json，仿 v08-01）；最后 `v09-complete`。
7. 全量回归：`npm test` 全绿、typecheck 0 错误、build 成功。

---

## Verification Checklist

- [ ] Task 1~7 单测全绿（sourceHub / clipboard / folder / foreground / passiveStore）。
- [ ] Task 2 迁移后既有 335 测试保绿。
- [ ] Task 6/8 typecheck + build 通过。
- [ ] Task 9 全量 npm test / typecheck / build；文档四件套同步；备份含最终代码。
- [ ] 实机（可选人工）：开发者 tab 开启目录源选目录、放新文件 → 气泡；剪贴板复制 → 气泡；前台映射 focus → 桌宠进入专注。
