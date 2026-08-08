# v0.7 报告自动化 设计文档

日期：2026-08-06

## 1. 目标与范围

v0.6 已提供手动周报/月报生成（`stats:report:generate`）与趋势对比。v0.7 在此之上实现**报告自动化**：

1. **独立定时设置**：周报/月报各自可配置（启用开关 + 触发星期/日期 + 时间），独立于日程系统与设置文件。
2. **到点自动触发**：主进程分钟级扫描，命中则生成报告。
3. **双通道提醒**：桌宠气泡 + Windows 系统通知（Electron Notification）。
4. **错过补发（静默）**：应用启动时若本周期未生成且已过触发点，自动补生成，但仅落盘不提醒。

明确不做：多设备同步、HTML/PDF 导出、报告推送到外部（均留 v0.7 后续候选）。

约束沿袭 v0.5/v0.6：只读本地、不联网、主进程计算、纯函数可单测、实机驱动验证、零新增依赖。

## 2. 设计决策

| 决策点 | 选择 | 理由 |
| --- | --- | --- |
| 配置存放 | 新文件 `userData/autoReports.json` | 独立职责；settings.json 管外观/台词，schedules.json 管日程，autoReports.json 管报告定时 |
| 触发机制 | 主进程独立分钟级 setInterval（60s），纯函数判定 | 复用 `shouldFire` 的判定思路但不耦合日程调度器（每秒扫描对报告过重） |
| 去重 | 报告文件名含周期键（周报=本周起始日，月报=YYYY-MM），生成前检查同键文件 | 手动/自动生成互斥，无需额外状态字段 |
| 周内 dayOfWeek | 存储用 JS 惯例 `0=周日..6=周六`；UI 显示映射中文「周一..周日」 | 与 `getDay()` 一致，纯函数好测 |
| 报告生成复用 | 抽取 handler 内联逻辑为 `generateReportFile()` | 手动与自动共用，消除重复 |

## 3. 数据模型与存储

### 3.1 autoReports.json

```ts
export interface AutoReportRule {
  enabled: boolean
  dayOfWeek: number   // 周报：0=周日..6=周六
  dayOfMonth: number  // 月报：1..31
  time: string        // HH:mm
}

export interface AutoReportConfig {
  weekly: AutoReportRule
  monthly: AutoReportRule
}
```

- 默认 `{ enabled: false, dayOfWeek: 0, dayOfMonth: 1, time: '21:00' }`。
- 新模块 `src/main/stats/autoReportStore.ts`：`DEFAULT_AUTO_REPORT_CONFIG`、`loadAutoReports(filePath)`（缺字段补默认、容错损坏 JSON）、`saveAutoReports(filePath, cfg)`、`validateAutoReportConfig(cfg)`（dayOfWeek 0-6、dayOfMonth 1-31、time 匹配 `HH:mm` 且 0<=h<24、0<=m<60）。仿 `schedule/store.ts` 模式，配单测。

## 4. 触发与补发（src/main/stats/autoReport.ts，全部纯函数）

```ts
shouldFireWeekly(cfg, now: Date): boolean   // enabled && now.getDay()===dayOfWeek && HH:mm 匹配
shouldFireMonthly(cfg, now: Date): boolean  // enabled && now.getDate()===dayOfMonth && HH:mm 匹配
```

- 时间匹配粒度分钟（秒忽略），与 `shouldFire`（scheduler.ts）一致。
- 主进程新增 `startAutoReportTicker(...)`：每分钟 tick，命中 → `generateReportFile()` + 气泡（新通道 `autoReport:fired` 发 PetApp，含 title/body）+ 系统通知（`new Notification({title, body}).show()`）；错误仅记日志不崩。

### 4.1 错过补发（启动时一次）

- 启动时调用 `catchUpAutoReport(...)`：
  - 周报：`today` 与本周一的差 >= 0 且 `now` 已过今日 `time`、本周报告文件不存在 → 静默生成。
  - 月报：本月报告文件不存在且 `now` 已过今日 `time` → 静默生成。
  - 判定规则与到点触发统一为 `shouldCatchUpWeekly/Monthly(cfg, now, existingKey)`：本周期未生成 && 今日已过触发时间 && 当前日期 >= 周期起始日（周报的起始日即本周一；若今天就是周一的触发时刻也成立，因为到点 tick 也会覆盖）。
  - 补发不弹气泡/不弹通知（静默）。

## 5. 报告生成复用（重构 stats:report:generate）

- 将 `src/main/index.ts` handler 内联逻辑抽为 `generateReportFile(dir, roleId, mode, today)` 放入 `src/main/stats/report.ts`：
  - 复用现有 `weekStart/monthStart/monthEnd` 区间推导与 `buildReportMarkdown`。
  - 返回 `{ path, range }`；文件名带周期键：`陪伴周报-<本周一>-<today>.md`、`陪伴月报-<YYYY-MM>-<today>.md`。
  - 落盘目录不变：`文档/DesktopPet/报告/`。
- handler 改为调用该函数（行为不变，手动按钮照旧）。

## 6. IPC 与 UI

### 6.1 IPC（shared/ipc.ts + preload + index.d.ts）

- 类型：`AutoReportRule`、`AutoReportConfig`、`AutoReportFired`（{ title, body }）。
- `autoReport:get` → `{ ok: true, config }`
- `autoReport:set`（AutoReportConfig，经 validate）→ `{ ok } | { ok:false, error }`
- `autoReport:fired`（主进程→渲染层，PetApp 气泡）
- preload 暴露：`autoReport.get()` / `autoReport.set(config)` / `events.onAutoReportFired(handler)`

### 6.2 CenterApp 自动报告卡

- 统计页「数据管理」卡下方新增「自动报告」卡：
  - 周报：启用开关、星期选择（周一..周日，存值 1..0 映射 UI 文案）、时间输入（HH:mm）。
  - 月报：启用开关、日期选择（1..31）、时间输入。
  - 「保存」按钮调 `autoReport.set`，成功提示。初始值从 `autoReport.get` 加载（仿现有表单与卡片风格）。

### 6.3 PetApp 气泡

- 监听 `autoReport:fired`：显示气泡（标题+body），显示时长 8s（仿 schedule:fired 处理）。

## 7. 测试

| 模块 | 用例 |
| --- | --- |
| autoReport.ts | shouldFireWeekly/Monthly 命中与不命中（星期错/时间错/禁用）、边界（23:59、00:00、跨月 31 号不存在日） |
| autoReport.ts | shouldCatchUpWeekly/Monthly：本周期已生成→false；已过时间未生成→true；未过时间→false；周期内最早可补发判定 |
| autoReportStore.ts | 默认值、缺字段补默认、非法 JSON 容错、validate 各非法值拒绝、round-trip |
| report.ts | generateReportFile：周/月模式文件名含周期键、内容含 title/range、落盘可读回 |
| 回归 | 既有 260 测试全绿；typecheck；build |

## 8. 交付与版本

- 版本 `v0.7.0806.01`（首个 v0.7 构建）。
- CHANGELOG 新条目 + v0.7 首个记录；使用说明新增「自动报告」章节；API 设计文档同步；架构设计 §9 路线图 v0.7 标记「报告自动化（.0806.01）」。
- 备份 `backup/backup_20260806_v07-01/`（含最终 src/docs/CHANGELOG/package.json/package-lock.json）。
- 实机驱动验证：启动后日志无错误；手动触发 tick 验证生成与提醒（可选人工确认）。

## 9. 风险与对策

| 风险 | 对策 |
| --- | --- |
| 分钟级 tick 在休眠/待机后失效 | 启动 catch-up 兜底；tick 用 `now()` 实时取值，休眠唤醒后下一次 tick 正常判定 |
| 31 号在无 31 日的月份永不触发 | 月报周期键按 YYYY-MM，当日到点才触发；补发判定以「本周期未生成且已过今日时间」为条件，不产生孤儿周期报告 |
| 通知权限/不可用（无通知环境） | Notification 失败仅记日志，气泡与落盘不受影响 |
