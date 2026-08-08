# 设计：事件通知页面（v1.0）

日期：2026-08-07
状态：待评审

## 背景

事件中心自 v0.2 起只维护**活跃事件集**（`addEvent` 按 source+type 原地替换，过期即消失），控制中心仅「首页」卡片展示当前活跃事件。v0.9 剪贴板/目录/前台/推送等事件源上线后，事件来源与频次上升，用户缺少一个可回溯、可筛选的完整视图。本文实现 `docs/API设计.md` §6「v1.0 规划：事件通知页面」纲要——事件中心架构保持不动，新增一个面向用户的事件流只读消费端页面。

## 目标

- 控制中心新增「事件」页签：展示**本次运行**的事件流（倒序），支持来源 / 状态归类 / 高优先级筛选与单条详情展开、手动清空。
- 事件流数据源：主进程维护一个有上限的环形缓冲，覆盖所有事件注入路径（system / plugin / passive / push / schedule）。

## 非目标

- 不做跨重启持久化（事件历史上限 200、关机即清）
- 不做气泡台词回溯（气泡文案瞬时不落盘，详情只含事件原始字段）
- 不重构事件中心 / sourceHub / 注入链路；schedule / pushApi 不迁移
- 不做时间区间筛选（近 200 条、仅本次运行，区间价值低）

## 决策摘要

1. **仅本次运行**：主进程内存环形缓冲，上限 200 条，FIFO 淘汰；不落盘、无跨会话序列化。
2. **只记"新增"不记"续交替"**：同 source+type 仍处于活跃态时被 `addEvent` 原地替换（如持续 cpu_high 每 4s 刷新）不算新记录，**只有真正追加新类型/新来源时**才写入历史——避免告警持续期间每 tick 刷屏。
3. **独立通道**：新增 `events:history`（初始化拉全量）、`pet:events:history`（每次新记录时广播全量快照，量小）、`events:historyClear`（清空）+ 广播清空；不扩展现有 `pet:events`（该通道语义是活跃快照，且 4s 周期广播）。
4. **高优先级口径**：`priority >= 8`（涵盖 cpu_high/memory_warning/battery_low 9、插件 10+、push 50、schedule 80；剔除 user_idle 6 与被动源 4/5）。
5. **分类共用**：`STATE_CATEGORIES` 上移到新建共享模块 `src/shared/eventState.ts`（eventCenter 改为从此导入，行为零变化；渲染端展示状态归类时复用，避免两份语义漂移），并新增纯函数 `stateOf(type)` / `groupLabel(source)` / `isHighPriority(p)`。
6. **新页签**：控制中心新增 `事件` 页签（key `events`，菜单/哈希映射同步补全）；首页现有「活跃事件」卡片保留不动。
7. **零新增依赖**：纯 JS/TS + 现有 UI 组件（Card/Select/Badge/Button），严格 TS，TDD。

## 数据流

```
[任一注入点]
  schedule:fireSchedule / pushApi / passive 源 / systemSource / pluginSource
   └─ applyEvent(ev)                      // 统一入口
        ├─ events = addEvent(events, ev)  // 活跃集照旧
        └─ 若命中"新增"（原活跃集无同 source+type）
              history.add(ev)
              notifyCenter('pet:events:history', { events: history.list(), now })   // 全量快照

[优化] events:history  handler → { ok:true, events }                              // 页签打开初始化
[优化] events:historyClear       → 清空 + notifyCenter('pet:events:history', { events: [] })

[CenterApp 事件页]
  订阅 pet:history → 替换本地全量 → 筛选/详情/清空
```

来源分组（`groupLabel`，按 source 首段映射，缺省显示原始 source）：

| source 前缀 | 组标签 |
| --- | --- |
| monitor | 系统监控 |
| plugin | 插件 |
| clipboard | 剪贴板 |
| folder | 目录 |
| foreground | 前台应用 |
| push | 推送 |
| schedule | 日程 |
| autoReport | 自动报告 |

## 模块

### 1. `src/shared/eventState.ts`（新增，纯函数）

- 迁移 `STATE_CATEGORIES`（从 `eventCenter.ts` 移入，`eventCenter.ts` 改 `import { STATE_CATEGORIES } from '../../shared/eventState'`，对外无行为变化）
- `stateOf(type: string): PetState`：type → 归类状态（warning/happy/sleep/focus/idle），列表倒查 `STATE_CATEGORIES`
- `groupLabel(source: string): string`：如上表
- `isHighPriority(priority: number): boolean`：`>= 8`

### 2. `src/main/event/eventHistory.ts`（新增，纯）

- `createEventHistory(limit = 200)` → `{ add(ev), list(), clear() }`
- `add`：追加队尾；超出 `limit` 移除最旧；同事件可重复入列（去重由调用方按"新增"语义决定）——本模块不判断活跃状态，保持单向职责
- `list()`：返回倒序拷贝（最新在前）

### 3. `src/shared/ipc.ts`（扩展）

- `EventHistoryResult { events: PetEventInfo[] }`（复用 `PetEventInfo`）
- 新通道：`events:history`（invoke，返回 `{ ok: true, events }`）、`events:historyClear`（invoke，返回 `{ ok: true }`）、`pet:events:history`（广播 `{ events }`）

### 4. `src/main/index.ts`（接线）

- 新增 `applyEvent(ev)`：`events = addEvent(events, ev)`；若追加为"新增"（原活跃集无同 source+type），`history.add(ev) + notifyCenter('pet:events:history', { events: history.list() })`
- `ctx.inject`（1191 行）与 5 处直接 `addEvent`（schedule 359、push 639、passive 测试 927/943/955）全部改走 `applyEvent`
- `events:history` / `events:historyClear` handler；history 缓冲实例在 whenReady 初始化
- 注意：替换型事件（add+replace 同一 source+type）已过期后再次出现 → `addEvent` 会**追加**（原记录已不在活跃集），此时记录新记录（两次分离的发生算两次）

### 5. `src/preload/index.ts`（扩展）

- `events.history(): Promise<EventHistoryResult>`、`events.clearHistory(): Promise<{ok:boolean}>`、`events.onHistoryChanged(cb)`

### 6. `src/renderer/src/center/CenterApp.tsx`（新增页签）

- `Tabs` 数组新增 `{ key:'events', label:'事件' }`；`applyTab` 哈希映射增加 `/events`
- 状态：`historyEntries`（全量快照替换式）
- 筛选：来源下拉（按当前历史中出现过的 group 动态去重）、状态归类下拉（warning/happy/sleep/focus/idle）、「仅高优先级」开关（`isHighPriority`）；过滤为纯函数 `filterHistory`
- 列表行（倒序）：时间（HH:mm:ss）、来源组标签、类型 tag、状态徽章（Badge）、优先级；点击展开显示原始字段（source/type/priority/durationMs/occurredAt）详情
- 「清空」按钮（二次确认）→ `events.clearHistory()`
- 空状态文案「暂无事件记录」

### 7. 测试（TDD）

- `src/shared/eventState.test.ts`：stateOf 全 type 归类、idle 缺省；groupLabel 全表 + 未知源 fallback；isHighPriority 边界（8 含、7 不含）
- `src/main/event/eventHistory.test.ts`：倒序、超限淘汰、clear、重复 add 不去重
- `src/main/event/eventCenter.test.ts` 保持全绿（STATE_CATEGORIES 移共享后行为不变）
- 回归：typecheck 0 + 全量测试 + build
- e2e（CDP）：打开控制中心「事件」页 → 触发剪贴板/目录/推送 → 列表出现对应条目；筛选/清空生效

## 实施顺序

1. `src/shared/eventState.ts`（迁移 + 纯函数 + 测试），eventCenter.ts 改为 import 共享模块
2. `src/main/event/eventHistory.ts`（+ 测试）
3. `src/shared/ipc.ts` 通道与类型
4. `src/main/index.ts` applyEvent 接线 + history handlers
5. `src/preload/index.ts` 暴露
6. `CenterApp.tsx` 事件页签（列表/筛选/详情/清空 + applyTab 映射）
7. typecheck / test / build 回归 + CDP 端到端