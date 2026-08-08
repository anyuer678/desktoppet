# v0.9 事件中心架构化 + 被动数据源 设计文档

日期：2026-08-06

## 1. 目标与范围

v0.8 提供了事件推送 API，但依赖第三方主动接入；多数应用没有 API。v0.9 解决「无 API 应用如何接入」：

1. **事件中心架构化**：把散落在主进程 tick 的事件源（系统监控 / 插件 / 日程 / 推送）抽为统一可插拔的 `EventSource`，新数据源注册即接入，不再改动主进程核心。
2. **三个被动数据源**（无需对方配合）：
   - 剪贴板监听（轮询，规则过滤）
   - 目录监听（fs.watch，新文件匹配规则才通知）
   - 前台应用检测（Windows 前台窗口进程+标题 → 映射状态）
3. **开发者选项**：控制中心新增「开发者」tab，事件源全部参数可精调（规则 / 间隔 / 映射 / 目录），默认低打扰。

明确不做：读前台窗口内容、剪贴板历史、系统通知中心截获（Windows 无公开 API）、多源联动编排、UI 表单美化。

约束沿袭：零新增依赖、只读本地、主进程计算、纯函数可单测、每构建文档同步 + 备份。

## 2. 设计决策

| 决策点 | 选择 | 理由 |
| --- | --- | --- |
| 架构形态 | 事件源注册中心 `sourceHub.ts`（注册表 + 生命周期 + ctx 委托） | 统一「周期型 / 触发型」两类源，主进程只调 `sourceHub.tick()` |
| 源接口 | `EventSource { id, kind:'poll'\|'watch', enabled(), start(ctx), stop() }` | 与现有 monitor/plugin（poll 型）、schedule/push（watch 型）一一对应 |
| ctx 能力 | `inject(ev)` / `notify(channel, payload)` / `count(type)` | 一个源三个用途：状态驱动 / 气泡 / 统计 |
| 迁移策略 | 现有 4 个源行为等价迁移，不新增事件类型 | 回归保绿，风险可控 |
| 剪贴板获取 | Electron `clipboard.readText()` 轮询（默认 3000ms） | 主进程内可用，零依赖 |
| 目录监听 | Node `fs.watch`（回调型） | 零依赖；注意 Windows 上目录监听事件需防抖 |
| 前台应用 | `child_process` 调 PowerShell（user32 GetForegroundWindow + GetWindowThreadProcessId）取进程名+标题，异步 | Windows 无 Electron 原生 API；零依赖方案 |
| 规则过滤 | 每条源独立规则数组（glob 匹配 文件名 / 正则匹配 文本），全不匹配不触发 | 开发者精调 |
| 默认行为 | 剪贴板开（低打扰规则）；目录关（需配置路径）；前台映射默认空（仅记录不映射） | 默认不打扰，开发者启用 |
| 配置存储 | 新文件 `passiveSources.json`（仿 pushApi.json / autoReports.json 模式） | 独立职责、可测 |

## 3. 架构

### 3.1 事件源接口（src/main/event/sourceHub.ts 内定义）

```ts
export interface SourceContext {
  /** 注入单个事件到事件中心（驱动状态 + diff 触发气泡/统计） */
  inject(ev: PetEvent): void
  /** 直接广播气泡通道（如 push:fired 模式） */
  notify(channel: string, payload?: unknown): void
  /** 计入当日统计（countEvent） */
  count(type: string): void
  log(level: 'info' | 'warn' | 'error', msg: string, ...args: unknown[]): void
}

export interface EventSource {
  id: string
  /** poll=由 hub 定时轮询拉取（源实现 poll()）；watch=源自主监听（start 里注册回调） */
  kind: 'poll' | 'watch'
  enabled(): boolean
  start(ctx: SourceContext): void
  stop(): void
  /** kind='poll' 时 hub 每个 tick 调用 */
  poll?(now: number): void
}
```

### 3.2 SourceHub（纯逻辑 + 依赖注入）

- `createSourceHub(ctx, sources: EventSource[], tickMs)`：管理源启停；`tick()` 驱动所有 `kind='poll'` 的源；`start()/stop()` 幂等；单源异常仅记日志不崩（try/catch）。
- 主进程 `index.ts`：
  - 构建 `sourceCtx`：`inject` → `addEvent(events, ev)` + 若类型变化走既有 diff 逻辑；`notify` → `notifyPet`；`count` → `recordStats(countEvent)`。
  - `sourceHub.tick()` 在现有 4s tick 内调用（替代内联的 nextSystemEvents/plugin 刷新逻辑）。

### 3.3 迁移既有源（行为不变）

| 源 id | kind | 现有逻辑 | 迁移后 |
| --- | --- | --- | --- |
| system | poll | `nextSystemEvents(...)`（monitor 采样） | poll() 内采样并替换 monitor:* 事件 |
| plugin | poll | tick 内清除 plugin:* 再注入 | poll() 内同逻辑 |
| schedule | watch | `scheduleRepo.startScheduler` + fireSchedule | start 内启动 scheduler，fired 回调 → ctx.inject + notify |
| push | watch | `startPushApiService` + onPushApiEvent | start 内启动 HTTP 服务，事件 → ctx.inject + notify |

- 迁移后主进程 tick 只保留：`sourceHub.tick()`、`ensureStatsDate`、`addStateTime`、`diffEventTypes → speech/统计`、`computeState → notifyPet('pet:state')`、`notifyCenter('pet:events')`。
- 不改变任何事件 type / priority / durationMs / 通道名 → 现有测试全部保绿。

## 4. 三个被动数据源

### 4.1 剪贴板源（id=clipboard，poll，默认启用）

- `poll(now)`：读 `clipboard.readText()`；内容与上次不同且非空 → 过规则 → `ctx.inject({source:'clipboard', type:'clipboard', priority:5, durationMs:8000})` + `ctx.count('clipboard')` + `ctx.notify('push:fired', {title:'剪贴板', body: 截断文本})`（复用气泡通道）。
- 规则（passiveSources.json 配置）：
  - `ignorePatterns: string[]`（正则，默认如 `^\d+$`、超长 >2000 字符）— 匹配则忽略。
  - `onlyPatterns: string[]`（正则，空=全部通过）。
  - 纯函数 `clipboardShouldNotify(text, rules): {ok:boolean; reason?:string}` 可单测。
- 配置项：`enabled`、`pollMs`（默认 3000）、`ignorePatterns`、`onlyPatterns`、`maxLen`（默认 120 截断）。

### 4.2 目录源（id=folder，watch，默认关闭）

- `start(ctx)`：`fs.watch(dir, {persistent:false}, cb)`；事件 `rename`/`change` 防抖 500ms 合并，比较「目录快照」找出**新增文件**（首轮扫描记基线，不触发）。
- 新文件名匹配规则（glob：`*.png`、`*report*`、`build/**`）才触发：`ctx.inject({source:'folder', type:'folder', priority:5, durationMs:8000})` + `ctx.count('folder')` + 气泡（title=文件名，body=路径，截断）。
- 纯函数 `folderShouldNotify(fileName: string, rules: string[]): boolean`（glob 转正则）可单测。
- 配置项：`enabled`、`dir`（空=未配置，不启动）、`patterns: string[]`（默认 `*`）、`debounceMs`。

### 4.3 前台应用源（id=foreground，poll，默认关闭）

- `poll(now)`（间隔建议 10000ms 以上，`pollMs` 配置）：异步调 PowerShell 取 `{process, title}`（窗口标题可空；不读内容）；进程名变化才处理。
- 映射配置 `mappings: {process: string; state: 'focus'|'ignore'}[]`：
  - `focus`：`ctx.inject({source:'foreground', type:'working', priority:4, durationMs: pollMs*2})`（归 focus 类）。
  - 默认无映射时仅 `ctx.count('foreground')` 记录（可查统计），不注入事件不打扰。
- 获取逻辑 `getForegroundApp(cmdRunner): Promise<{process,title}>` 注入 runner 以便单测；生产 runner 用 PowerShell。
- PowerShell 脚本（零依赖，仅元数据）：
  ```powershell
  Add-Type @'
  using System;
  using System.Runtime.InteropServices;
  public class Fg { [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid); }
  '@; $h=[Fg]::GetForegroundWindow(); [uint32]$p=0; [Fg]::GetWindowThreadProcessId($h,[ref]$p)|Out-Null; $proc=Get-Process -Id $p -ErrorAction SilentlyContinue; if($proc){$proc.ProcessName + "|" + $proc.MainWindowTitle}else{"|"}
  ```
- 配置项：`enabled`、`pollMs`（默认 15000）、`mappings`。

## 5. 配置与存储

### 5.1 passiveSources.json（userData/）

```ts
export interface PassiveSourcesConfig {
  clipboard: { enabled: boolean; pollMs: number; onlyPatterns: string[]; ignorePatterns: string[]; maxLen: number }
  folder: { enabled: boolean; dir: string; patterns: string[]; debounceMs: number }
  foreground: { enabled: boolean; pollMs: number; mappings: { process: string; state: 'focus' | 'ignore' }[] }
}
```

- `src/main/event/passiveStore.ts`：`DEFAULT_PASSIVE_SOURCES_CONFIG`、`loadPassiveConfig(filePath)`（缺字段逐项补默认）、`savePassiveConfig(filePath, cfg)`、`validatePassiveConfig(cfg)`（pollMs 正数、patterns 非空字符串数组、mappings process 非空、state 枚举、dir 字符串）。仿 pushApiStore 模式，配单测。

## 6. IPC 与 UI

### 6.1 IPC（shared/ipc.ts + preload + index.d.ts）

- `passive:get` → `{ ok, config }`
- `passive:set`（config，经 validate）→ `{ ok } | { ok:false, error }`
- `passive:test`（sourceId: 'clipboard'|'folder'|'foreground'）→ 本地触发一次该源事件链路（返回 ok；folder 未配置返回错误）— 用于开发者测试
- preload 暴露 `passive.get() / set(cfg) / test(sourceId)`

### 6.2 控制中心「开发者」tab（新 tab，位于「推送」之后）

- **事件源总览**：三个源卡片（剪贴板 / 目录 / 前台应用），各自 启用开关 + 关键参数（pollMs、maxLen、dir、patterns、mappings 的文本编辑）。
- 「保存」按钮 → `passive.set`；成功提示；失败显示原因。
- 「测试」按钮（每源一个）→ `passive.test`，气泡验证链路。
- 参数编辑用简单文本框 + 说明文字（开发者场景，不做富表单）。

## 7. 测试

| 模块 | 用例 |
| --- | --- |
| sourceHub.ts | 注册/poll 驱动/启停幂等；poll 源异常不中断其他源；watch 源 start/stop 回调接线 |
| clipboard.ts | clipboardShouldNotify：默认规则（纯数字忽略、超长忽略）、onlyPatterns 命中/未命中、ignorePatterns 优先、maxLen 截断 |
| folder.ts | folderShouldNotify：glob 匹配（*.png、*report*）、目录快照 diff 出新增、首轮基线不触发、防抖合并 |
| foreground.ts | getForegroundApp 注入 runner：解析进程+标题、mapping focus 注入 working、无映射仅 count、失败降级（记日志不注入） |
| passiveStore.ts | 默认值、缺字段补默认、非法 JSON 容错、validate 拒绝、round-trip |
| 回归 | 迁移后既有 335 测试保绿（system/plugin/schedule/push 行为不变）；typecheck；build |

## 8. 交付与版本

- 分 3 个构建（每构建文档同步 + 备份）：
  - `.01`：抽取 sourceHub + 迁移 4 个现有源（回归保绿）+ 剪贴板规则纯函数
  - `.02`：剪贴板源 + 目录源 + passiveStore + IPC/preload（先只接剪贴板目录）
  - `.03`：前台应用源（PowerShell 获取）+ 控制中心「开发者」tab + 文档四件套 + 备份 v09-complete
- CHANGELOG / 使用说明 / API设计 / 架构设计 §9 路线图逐构建更新；备份 `backup/backup_20260806_v09-0X`。

## 9. 风险与对策

| 风险 | 对策 |
| --- | --- |
| 前台检测 PowerShell 每 15s 起进程开销 | 异步不阻塞、间隔可配；失败静默降级（不注入只记日志） |
| fs.watch 在 Windows 上事件重复/乱序 | 目录快照 diff + 防抖；对不存在目录容错（记日志不崩） |
| 剪贴板误报打扰 | 默认 ignorePatterns（纯数字/超长）+ 可关；规则开发者可调 |
| 迁移回归风险 | 迁移时事件 type/priority/duration/通道名不变，335 测试保绿为准 |
| 开发者误配置 | validate 校验 + 保存前校验提示；非法值拒绝不落盘 |
