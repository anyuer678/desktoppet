# DesktopPet API 设计

版本：1.0（内容核验至 v1.0 正式版）
范围：渲染进程 <-> 主进程 IPC 契约（v0.1 实现部分 + v0.2+ 预留）

---

## 1. 通信规则

- 渲染进程依赖：`contextIsolation` + `sandbox`，无 Node 访问。
- 唯一入口：preload 暴露的 `window.desktopPet`。
- 请求-响应：`ipcMain.handle` / `ipcRenderer.invoke`。
- 事件推送（主进程 → 渲染）：`webContents.send`，渲染侧 `on/off` 订阅。
- 同名 channel 前后端 TypeScript 类型强制对齐（`src/shared/ipc.ts`）。

---

## 2. preload 暴露面（v0.1）

```ts
window.desktopPet = {
  settings: { get(): Promise<Settings>, set(patch): Promise<Settings> },
  character: { list(), get(id), select(id), pick(): Promise<string | null>, import(zipPath, overwrite?): Promise<ImportResult> },
  window: { hide(), setSize(px), setOpacity(v), setIgnoreMouseEvents(b) },
  center: { open(tab?) },
  menu: { popup() },
  perf: { report(fps), start(): Promise<PerfReport> },
  events: { onCharacterChanged, onTogglePause, onPetState, onSettingsChanged },
  stats: { get(): Promise<StatsReport>, range(start, end): Promise<StatsRangeResult>, reportInteraction(kind: InteractionKind) }   // v0.5
  autoReport: { get(): Promise<AutoReportGetResult>, set(config: AutoReportConfig): Promise<AutoReportSetResult> }   // v0.7
  events.onAutoReportFired(cb)   // v0.7：自动报告生成事件
  pushApi: { get(): Promise<PushApiGetResult>, setEnabled(b): Promise<PushApiSetEnabledResult>, resetToken(): Promise<PushApiResetTokenResult>, test(): Promise<PushApiTestResult> }   // v0.8
  events.onPushFired(cb)   // v0.8：第三方推送事件（气泡展示）
  passive: { get(): Promise<PassiveGetResult>, set(config: PassiveSourcesConfig): Promise<PassiveSetResult>, test(sourceId): Promise<PassiveTestResult> }   // v0.9
  events.history()            // v1.0：事件历史全量（events:history）
  events.clearHistory()       // v1.0：清空本次运行事件历史（events:historyClear）
  events.onHistoryChanged(cb) // v1.0：事件历史变化广播（pet:events:history）
}
```

不允许暴露 `ipcRenderer` 裸 API、Node `fs`、`path`。

---

## 3. Channel 一览（v0.1）

### settings:*

| Channel | 方向 | 参数 | 返回 |
| --- | --- | --- | --- |
| settings:get | R→M | — | Settings |
| settings:set | R→M | Partial<Settings> | Settings（合并后整体） |
| settings:filePath | R→M | — | string（配置文件绝对路径，仅展示用） |

Settings（v0.1）：

```ts
interface Settings {
  position: { x: number; y: number };
  size: number;
  opacity: number;        // 0.3~1
  autoLaunch: boolean;
  activeCharacterId: string;
  speech: SpeechPools;            // 气泡消息池（可自定义，空池表示该场景不说话）
  shortcutsEnabled: boolean;      // 全局快捷键开关（Ctrl+Shift+P 显示/隐藏、Ctrl+Shift+C 控制中心）
}
```

### character:*

| Channel | 方向 | 参数 | 返回 |
| --- | --- | --- | --- |
| character:list | R→M | — | CharacterSummary[] |
| character:get | R→M | id | CharacterDetail \| CharacterLoaded（角色包详情/加载结果） |
| character:select | R→M | id | CharacterLoaded（切换桌宠显示的角色） |
| character:pick | R→M | — | string \| null（主进程 dialog 选择 .pet/.zip，取消返回 null；sandbox 渲染层无法直接选文件） |
| character:import | R→M | zipPath:string, overwrite?:boolean | ImportResult（安全导入角色包到角色仓库；overwrite=true 时允许覆盖导入已存在角色） |
| character:delete | R→M | id:string | ImportResult（删除角色目录；删除激活角色时自动回退到剩余第一个角色） |
| character:export | R→M | id:string | ImportResult（保存对话框选路径后打包 .pet；path 为导出路径，取消返回 error「已取消导出」） |
| character:update | R→M | id, patch:CharacterPatch | CharacterLoaded（编辑角色 config；成功后广播 character:changed 重载桌宠） |

```ts
interface CharacterSummary {
  id: string; name: string; version: string; preview: string;
  supportedStates: string[];  // config animation.states 中合法者
}
interface CharacterLoaded {
  id: string; ok: boolean; error?: string;
}
interface ImportResult {
  ok: boolean; id?: string; name?: string; path?: string; error?: string;
  overwritten?: boolean;   // 覆盖导入成功时为 true（旧版已替换）
}
```

导入失败原因（character:import error）：无法读取压缩包（损坏或非 zip 格式）/ 压缩包根目录缺少 config.json / 压缩包包含非法路径 / 压缩包路径越界 / config.json 解析失败或缺少 id/name / 角色 id 只允许小写字母/数字/下划线/短横线 / 角色「id」已存在 / 导入失败。

CharacterPatch（character:update）：

```ts
interface StateTemplatePatch {
  breatheScale?: number; breatheDuration?: number;
  floatY?: number; floatDuration?: number;
}
// 交互动作枚举
type InteractionAction = 'open_center' | 'menu' | 'speak' | 'none';
interface CharacterPatch {
  name?: string;
  version?: string;
  defaultSize?: number;        // 钳制 96~512
  allowResize?: boolean;
  interaction?: Partial<{        // 交互动作：非法值回退默认（open_center/menu/speak/none）
    click: InteractionAction; doubleClick: InteractionAction; rightClick: InteractionAction;
  }>;
  idle?: StateTemplatePatch;   // 兼容旧契约（等价 states.idle）
  states?: Record<string, StateTemplatePatch>; // 按状态名编辑（不存在的状态自动创建）
  overlays?: {
    night?: {                  // 夜间叠加层：时间取模 0~23，强度钳制
      start?: number; end?: number;
      opacity?: number;        // 0.1~1
      breatheScale?: number; floatY?: number;  // 0~1
      speed?: number;          // 0.2~2
    };
  };
}
```

编辑仅写回涉及字段，其余配置保留；空名称/版本与损坏 config 拒绝。

### window:*

| Channel | 方向 | 参数 | 返回 |
| --- | --- | --- | --- |
| window:hide | R→M | — | — |
| window:dragBy | R→M | dx, dy:number | —（按像素增量平移桌宠窗口位置；已实现） |
| window:quit | R→M | — | — |
| window:setSize | R→M | size | number |
| window:setOpacity | R→M | opacity | number |
| window:setIgnoreMouseEvents | R→M | ignore:boolean | —（forward:true，透明区可穿透、仍转发 mousemove） |

### perf:*

| Channel | 方向 | 参数 | 返回 |
| --- | --- | --- | --- |
| perf:start | R→M | — | PerfReport（5s×1Hz 采样：主进程 CPU%/RSS、渲染进程工作集、兔兔窗口 fps） |
| perf:fps（send） | R→M | fps:number | —（兔兔窗口每秒上报动画帧率） |

### app:*（已实现）

| Channel | 方向 | 参数 | 返回 |
| --- | --- | --- | --- |
| app:version | R→M | — | string（应用版本号；preload 对应 desktopPet.version()） |

### schedule:*（日程系统，已实现）

| Channel | 方向 | 参数 | 返回 |
| --- | --- | --- | --- |
| schedule:list | R→M | — | ScheduleItem[]（持久化于 userData/schedules.json） |
| schedule:create | R→M | input: ScheduleInput | { ok:boolean; item?: ScheduleItem; error?: string }（id 由主进程分配） |
| schedule:update | R→M | id, input: ScheduleInput | { ok:boolean; item?: ScheduleItem; error?: string } |
| schedule:delete | R→M | id | OpResult |
| schedule:toggle | R→M | id, enabled:boolean | OpResult（启用/停用；once 类型触发后自动置 false） |
| schedule:test | R→M | id | OpResult（立即触发一次指定日程，复用真实触发链路） |

```ts
type ScheduleType = 'once' | 'daily' | 'weekly';
interface ScheduleItem {
  id: string; title: string; message: string; type: ScheduleType;
  trigger: string;         // once：YYYY-MM-DDTHH:mm:00（本地时区）；daily/weekly：HH:mm
  daysOfWeek: number[];    // weekly 生效：周日=0..周六=6
  enabled: boolean; lastFiredAt: number | null; createdAt: number;
}
interface ScheduleInput { title: string; message: string; type: ScheduleType; trigger: string; daysOfWeek: number[]; enabled: boolean }
interface ScheduleFired { id: string; title: string; message: string; firedAt: number }  // schedule:fired 事件数据
```

### market:*（本地角色市场，已实现）

| Channel | 方向 | 参数 | 返回 |
| --- | --- | --- | --- |
| market:catalog | R→M | — | MarketEntryWithStatus[]（市场目录 + 安装状态 installed/installedVersion + previewDataUrl） |
| market:install | R→M | entryId:string | ImportResult（安装市场角色到角色仓库） |

### plugin:*（已实现）

| Channel | 方向 | 参数 | 返回 |
| --- | --- | --- | --- |
| plugin:list | R→M | — | PluginInfo[]（{ id, name, version, description, eventCount, enabled }） |

### stats:*（陪伴统计，v0.5）

| Channel | 方向 | 参数 | 返回 |
| --- | --- | --- | --- |
| stats:report | R→M | — | StatsReport（今日 DailyStats + 本周 WeekSummary + streak） |
| stats:range | R→M | start, end（YYYY-MM-DD） | StatsRangeResult（区间逐日统计；校验：格式 / start≤end / ≤90 天 / 不查未来） |
| stats:year | R→M | year:number | StatsYearResult（年度汇总；year 须为 2000~2100 整数） |
| stats:heatmap | R→M | year:number | StatsHeatmapResult（整年逐日 RangeDay[]，不受 90 天限制；当年未来日期 present=false 空统计不报错；year 须为 2000~2100 整数） |
| stats:achievements | R→M | — | StatsAchievementsResult（当前角色成就：连续/最长连续天数、累计陪伴秒、等级与下一个等级阈值、9 枚徽章解锁状态） |
| stats:trend | R→M | cStart, cEnd, pStart, pEnd（YYYY-MM-DD） | StatsTrendResult（本期 vs 上期 PeriodCompareResult；日期校验同 stats:range） |
| stats:report:generate | R→M | mode: 'week' \| 'month' | StatsReportGenerateResult（生成 Markdown 周报/月报到「文档/DesktopPet/报告/」，path 为落盘路径） |
| stats:openReportDir | R→M | — | OpResult（用系统默认方式打开报告目录「文档/DesktopPet/报告/」；已实现） |
| stats:exportExcel | R→M | year:number | StatsSpreadsheetResult（弹保存对话框导出全年 xlsx，含「每日明细」「汇总」两 Sheet；year 须为 2000~2100 整数） |
| stats:exportCsv | R→M | start, end（YYYY-MM-DD） | StatsExportResult（弹保存对话框导出 CSV，UTF-8 带 BOM；校验同 stats:range） |
| stats:deleteDay | R→M | date（YYYY-MM-DD） | OpResult（删除单日统计文件；若为今日则同步重置内存统计） |
| stats:clearAll | R→M | — | StatsClearResult（删除全部统计文件，并将今日内存重置为空的今日统计；will-quit 仍会写回空文件） |
| pet:interact（send） | R→M | kind:InteractionKind | —（渲染层上报用户主动互动：'click' \| 'drag' \| 'speak'；仅计入有实际动作的交互，事件通知/欢迎/问候不计） |
| autoReport:get | R→M | — | AutoReportGetResult（ok + config：{ weekly:{enabled,dayOfWeek,dayOfMonth,time}, monthly:{...} }，持久化于 userData/autoReports.json） |
| autoReport:set | R→M | config: AutoReportConfig | AutoReportSetResult（校验 dayOfWeek 0-6 / dayOfMonth 1-31 / time HH:mm，通过即落盘） |
| autoReport:fired | M→R | AutoReportFiredEvent（{type:'week'\|'month', title, body:报告路径}） | 事件：自动报告到点生成后广播给桌宠与控制中心（气泡展示） |
| pushApi:get | R→M | — | PushApiGetResult（ok + info：{ enabled, port, token }；port=端口，服务未启动为 0；token 32 位 hex） |
| pushApi:setEnabled | R→M | enabled:boolean | PushApiSetEnabledResult（启→启动 HTTP 服务并落盘；停→停止服务并落盘） |
| pushApi:resetToken | R→M | — | PushApiResetTokenResult（重新生成 32 位 hex token 并落盘，返回新 token） |
| pushApi:test | R→M | — | PushApiTestResult（本地发送一条示例推送验证链路，不经过 HTTP） |
| pushApi:state | M→C | { enabled:boolean, port:number } | 已实现（主进程内部推送 notifyCenter）：推送服务启动/停止时通知控制中心；preload 未订阅，desktopPet 未暴露订阅方法 |
| push:fired | M→R | PushApiFired（{kind?, reaction?, placeholder?, title?, body?, type?}） | 事件：第三方推送/被动数据源触发后广播给桌宠（气泡展示，8 秒）；push 源载荷 { kind:'push', reaction:'pushNote', title, body, type }，被动源载荷 { kind:'passive', reaction, placeholder } |
| passive:get | R→M | — | PassiveGetResult（ok + config：{ clipboard, folder, foreground }，持久化于 userData/passiveSources.json） |
| passive:set | R→M | config: PassiveSourcesConfig | PassiveSetResult（validatePassiveConfig 校验 pollMs/debounceMs/maxLen 正整数、patterns 非空字符串数组、mappings state ∈ focus/ignore；通过则落盘并重建数据源 hub 即时生效） |
| passive:test | R→M | sourceId: 'clipboard' \| 'folder' \| 'foreground' | PassiveTestResult（按当前配置模拟触发一次对应源，验证气泡链路；配置不符时返回错误原因） |

```ts
type InteractionKind = 'click' | 'drag' | 'speak';
interface DailyStats {
  date: string;                       // YYYY-MM-DD
  secondsByState: Record<string, number>; // 按 PetState 细分的在线秒数
  hours: number[];                    // 24 小时分段在线秒数（旧文件加载自动补零）
  events: Record<string, number>;     // 事件类型计数（cpu_high/battery_low/schedule...）
  interactions: Record<InteractionKind, number>;
  updatedAt: number;
}
interface WeekSummary {
  days: number;        // 自然周（本周一到今天）内有记录的天数
  totalSeconds: number;
  events: Record<string, number>;
  interactions: Record<InteractionKind, number>;
}
interface StatsReport { today: DailyStats; week: WeekSummary; streak: number }
interface RangeDay { date: string; present: boolean; stats: DailyStats }  // present=false=无记录文件
interface StatsRangeResult { ok: boolean; error?: string; days?: RangeDay[] }
interface YearSummary {
  year: number;
  totalSeconds: number;          // 全年总秒（四舍五入）
  activeDays: number;            // 有记录文件的天数
  avgSecondsPerActiveDay: number;// 日均 = 总秒 / 活跃天
  bestDay: { date: string; seconds: number } | null; // 最活跃日（无记录则 null）
}
interface StatsYearResult { ok: boolean; error?: string; summary?: YearSummary | null }
interface StatsHeatmapResult { ok: boolean; error?: string; days?: RangeDay[] }  // 全年逐日（含未来 present=false）
interface AchievementLevel { no: number; label: string; nextHours: number | null }  // nextHours=null 表示满级
interface AchievementBadge { id: string; label: string; unlocked: boolean }
interface Achievements {
  charId: string;        // sanitize 后的角色 id
  streak: number;        // 当前连续陪伴天数
  bestStreak: number;    // 最长连续陪伴天数（跨年扫描）
  totalSeconds: number;  // 累计陪伴秒（四舍五入）
  level: AchievementLevel;
  badges: AchievementBadge[];
}
interface StatsAchievementsResult { ok: boolean; error?: string; achievements?: Achievements }
interface PeriodMetric {
  totalSeconds: number;      // 区间累计陪伴秒
  activeDays: number;        // 区间内有记录的天数
  events: number;            // 事件总数
  interactions: number;      // 互动总次数（click+drag+speak）
}
interface PeriodCompareResult {
  current: PeriodMetric;
  previous: PeriodMetric;
  changeTotalPercent: number | null;  // 本期相对上期时长变化百分比；上期为零 → null
}
interface StatsTrendResult { ok: boolean; error?: string; compare?: PeriodCompareResult }
interface StatsReportGenerateResult { ok: boolean; error?: string; path?: string }
interface StatsSpreadsheetResult { ok: boolean; error?: string; canceled?: boolean; path?: string }
interface StatsExportResult { ok: boolean; error?: string; canceled?: boolean; path?: string }
interface StatsClearResult { ok: boolean; deleted?: number; error?: string }
interface PushApiFired {
  kind?: 'push' | 'passive';   // push=第三方推送；passive=被动数据源
  reaction?: string;           // 台词池 key（speech.ts SpeechPoolKey）
  placeholder?: string;        // 简短占位片段（域名/文件名/应用名/推送标题）
  title?: string; body?: string; type?: string;
}
```

存储：`%APPDATA%/DesktopPet/stats/<角色id>/YYYY-MM-DD.json`，按角色分目录、按天一个文件（角色 id 为 sanitize 后的 `settings.activeCharacterId`，如 `stats/rabbit/2026-08-06.json`；旧版平铺 `stats/*.json` 已自动迁移到当前角色子目录）；全部 `stats:*` 接口按当前角色过滤（渲染层无须传角色）；主进程 4s tick 按实际间隔累加当前状态时长（写入 `hours` 对应小时段），变更节流 2s 落盘（已有定时器合并、最长 2s 内收账），跨日自动切换文件，切换角色/退出时立即保存；`stats:report` 返回前先落盘今日内存统计（保证本周聚合含进行中的时长）。只读本地、不联网、不新增采样。

### 事件推送（主→渲染）
| 事件 | 数据 | 说明 |
| --- | --- | --- |
| pet:state | string（PetState） | ✔ v0.2 已实现：状态变更广播（idle/focus/sleep/happy/warning） |
| pet:settings-changed | {size:number, opacity:number} | ✔ v0.2 已实现：窗口尺寸/透明度变更广播 |
| character:changed | string（角色id） | ✔ 已实现：角色切换通知 |
| pet:toggle-pause | — | ✔ 已实现：暂停/恢复动画 |
| pet:events:history | {events: PetEventInfo[]} | ✔ v1.0 已实现：新增事件记录时广播历史全量快照 |
| pet:speech | string（事件类型） | ✔ 已实现：新增活跃事件类型时通知桌宠说台词（避免持续事件刷屏） |
| schedule:fired | ScheduleFired（{id, title, message, firedAt}） | ✔ 已实现：日程到点触发后广播给桌宠与控制中心（气泡展示 + 注入 alarm 事件） |
| plugin:event | Event | 预留：实际未落地——插件事件经 pluginSource → replaceBySource 注入事件中心（记入事件中心历史），不走该透传通道 |

---

## 4. 错误处理约定

- 所有 handle 回调必须 resolve 结构化结果，不 throw 裸错误给渲染层。
- 加载角色失败 → 返回 `{ ok:false, error: '可读原因' }`，渲染层显示降级 UI。
- 主进程日志落盘 `%APPDATA%/DesktopPet/logs/main-*.log`，不抛给 UI 控制台。
- 序列校验失败的角色包逐条错误追加到 `loading.warnings`（UI 可展示，不影响其他角色）。

---

## 5. 事件系统（v0.2 已落地）

事件中心位于主进程 `src/main/event/eventCenter.ts`（纯逻辑，含单元测试）：

```ts
interface Event {
  source: string;   // 谁发的（monitor:cpu / monitor:user / 插件 id ...）
  type: string;     // cpu_high / memory_warning / user_idle / success / alarm ...
  priority: 0..100; // 决策优先级
  durationMs: number; // 生效时长
  occurredAt: number;
}
```

事件 → 状态映射（`STATE_CATEGORIES`）：

| 状态 | 事件类型 |
| --- | --- |
| warning | cpu_high / memory_warning / battery_low / network_error / alarm / warning / error |
| happy | complete / success / reward |
| sleep | user_idle / sleep / away / lock_screen |
| focus | working / focus / busy / notice |

决策规则：取各状态命中事件的最大 priority，最高者胜；同级按 severity 序（warning > focus > sleep > happy）；无事件 → idle。详见 `eventCenter.test.ts` 用例。

---

## 6. v1.0 规划：事件通知页面（纲要）（已落地 2026-08-07，见 §2.14 使用说明与本版 CHANGELOG）

状态：规划中（v0.9 被动数据源之后的消费端演进；v1.0 展开实施，另行出 spec/plan）。

决策约束：
- 事件中心架构不重构：`sourceHub` / `EventSource` / `SourceContext` 保持 v0.9 现状；`schedule` / `pushApi` 不迁移。
- 本页是「只读消费端」：不新增事件源，不改注入链路，仅把主进程环形缓冲（`eventHistory`，上限 200、只记新增、活跃集判定）以列表形态呈现。

页面形态：控制中心新增「事件通知」页签（v0.9「开发者」页内被动源列表页的演进上位，从开发者工具升级为面向用户的通知页）。

拟议能力（大纲，v1.0 展开时取舍）：
1. 事件流列表：按时间倒序展示近 N 条事件（来源 / 类型 / 状态映射 / 发生时间 / 剩余时长），来源覆盖：系统监控（cpu/mem/battery/network）、插件事件、日程触发、v0.8 推送、v0.9 被动源（剪贴板/目录/前台）。
2. 筛选：按来源、状态（warning/happy/sleep/focus）、时间范围；「仅看高优先级」快捷开关。
3. 详情：点击单条展开——事件原始字段（type/priority/durationMs/occurredAt/source）+ 触发时的气泡台词（若可回溯）。
4. 气泡联动：气泡（8s 浮窗）是即时提示，通知页是「可回溯列表」；两者互补，气泡仍走 `push:fired` / `pet:speech` 通道不动。
5. 清理：手动清空 / 保留上限（如最近 200 条），主进程内存中事件表本身已有上限策略，页面只读快照。

涉及变更（v1.0 实施时）：
- 主进程：新增 `eventHistory` 环形缓冲（只记"新增"事件，活跃集判定）+ 广播 `pet:events:history`（新增记录时推全量快照），`applyEvent` 与 `replaceBySource` 均会记录历史并广播，但实现为两处独立逻辑。
- preload：`events.history()` / `events.clearHistory()` / `events.onHistoryChanged()`；`events:history` / `events:historyClear` 请求式 channel。
- 渲染：CenterApp 新增「事件」tab + 列表组件（零新依赖，沿用现有 UI 组件）；首页旧「事件中心」活跃事件卡片移除（2026-08-07 随 1.0.0807.02 下线）。