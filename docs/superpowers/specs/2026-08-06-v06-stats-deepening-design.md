# v0.6 统计深化 设计文档

日期：2026-08-06

## 1. 目标与范围

v0.5 已完成陪伴统计基础（状态时长/事件/互动按天落盘、区间查询、热力图、24h 分布、streak、年度汇总、CSV 导出）。v0.6 在既有统计数据之上做五类深化：

1. **多角色统计分离**：统计按当前角色分别记录与查询。
2. **整年热力图**：GitHub 风格全年单视图。
3. **陪伴成就/里程碑**：连续陪伴徽章、累计时长等级。
4. **趋势对比 + 周报/月报**：本期 vs 上期对比，一键生成 Markdown 报告落盘。
5. **Excel 导出**：按年导出 `.xlsx`（引入 `exceljs`）。

约束沿袭 v0.5：只读本地、不联网、主进程计算、纯函数可单测、实机驱动验证。新增一条依赖 `exceljs`（Build 5），其余构建保持零新依赖。

## 2. 分解与顺序

| 构建 | 内容 | 数据模型影响 | 版本 |
| --- | --- | --- | --- |
| Build 1 | 多角色统计分离（目录结构 + 全接口按角色过滤） | 大（存储布局） | v0.6.0806.01 |
| Build 2 | 整年热力图（新 IPC `stats:heatmap`） | 无 | v0.6.0806.02 |
| Build 3 | 成就/里程碑（纯函数 + 卡片） | 无 | v0.6.0806.03 |
| Build 4 | 趋势对比 + 周报/月报生成 | 无 | v0.6.0806.04 |
| Build 5 | Excel 按年导出 + v0.6 收官存档 | 无 | v0.6.0806.05 |

顺序理由：多角色分离动存储布局与全部查询，必须最先；其余四块彼此独立，按依赖/大小排布。

## 3. Build 1：多角色统计分离

### 3.1 存储布局变更

现：`stats/YYYY-MM-DD.json`（平铺，单文件无法承载同日多角色）。
改：`stats/<roleId>/YYYY-MM-DD.json`（按角色子目录）。

- 角色 id 即现有角色包目录名（`settings.activeCharacterId`），安全化：`sanitizeRoleId(id)` 将非 `[a-zA-Z0-9_.-]` 字符替换为 `_`。
- `dailyStatsPath(dir, roleId, date)` 计算；`statsDir` 语义改为「stats 根目录」，各函数接收 `dir` + `roleId`。

### 3.2 迁移

新增 `migrateStatsLayout(dir, defaultRoleId)`（幂等，启动时调用）：
- 扫描根目录 `*.json`（旧平铺文件，不含子目录）。
- 移动到 `stats/<defaultRoleId>/<原文件名>`；若目标已存在，比较 `updatedAt` 保留较新者。
- 无平铺文件则直接返回（幂等，Build 1 后不再产生平铺文件）。
- 幂等测试：重复调用无副作用、无平铺残留。

旧版无法追溯当时角色，统一归入 `defaultRoleId`（启动时 `settings.activeCharacterId`，退化 `rabbit`）。

### 3.3 数据模型

- `DailyStats` 保持结构不变（不新增字段）——角色体现在**所属目录**，而非文件字段；单测无需改 DailyStats 断言。
- 可在文件内冗余 `roleId` 字段便于自查（可选，不做强制）。

### 3.4 查询过滤

- 主进程 `stats:report / range / heatmap / year / exportCsv / exportExcel / achievements / report:generate` 全部隐式读取 `settings.activeCharacterId`，向 `stats/*` 函数传 `roleId`；渲染层无需传角色参数（preload 签名不变，后端行为切换）。
- 异常路径：`activeCharacterId` 无对应子目录 → 空数据而非报错（目录不存在时聚合返回 0）。
- `stats:clearAll` 仅清当前角色目录；`stats:deleteDay` 同样限定当前角色。

### 3.5 今日文件切换

- `ensureStatsDate()` 需感知角色：`(activeRoleId, statsDate)` 双键。现状仅 `statsDate`。
- 今日跨角色切换：同一天可能存在 `rabbit/2026-XX-XX.json` 与 `cat/2026-XX-XX.json` 两个文件，互不覆盖——这正是子目录方案的收益。
- tick/落盘读当前角色文件。

### 3.6 测试
- 新增 `migrateStatsLayout` 单测：平铺→子目录、目标存在冲突保留新、幂等。
- 现有 dailyStats 单测适配 `roleId` 参数签名（改签名不破坏断言 中已有 243 例直接过）。
- 实机：切换角色后首页/统计页数据归属变化；同日双角色并存。

## 4. Build 2：整年热力图

### 4.1 新 IPC `stats:heatmap`

| 名称 | 参数 | 返回 |
| --- | --- | --- |
| `stats:heatmap` | `year:number`（2000~2100） | `StatsHeatmapResult{ ok; error?; days?: RangeDay[] }` |

- 语义：拉取全年逐日记录（**不受 `stats:range` 90 天限制**，专属 `loadDailyRangeFullYear(dir, roleId, year)`），只读到今天（未来日期不返回，不发错误）。
- Handler：读 `settings.activeCharacterId`。

### 4.2 渲染层

- 统计页新增「年度热力图」卡，置于「月度热力图」之后：
  - 布局：12 行（1~12 月）× 31 列格林，第一列标注月；星期不需要，按行聚合即可；右上角年份 `‹ ›` 切换（前后 2 年即可？可自由）。
  - 复用 `heatColor(sec, max)` 四档配色；`max` 为全年最大日时长（与月热力图独立）。
  - 每格 title：`YYYY-MM-DD · 时长（或无记录）`；点击弹该天明细（复用月度热力图的 `selectedDay` 明细 + 删除逻辑，共用一套状态）。
  - legend 复用现有「无 → 多」色带。
  - 拆分：不改 `heatColor`；把月度/年度数据加载抽小工具 `useHeatmapData`（可选，够用即可不抽）。

## 5. Build 3：陪伴成就/里程碑

### 5.1 纯函数（`src/main/stats/achievements.ts` 新建）

```ts
interface AchievementBadge { id: string; label: string; threshold: number; unit: 'day' | 'hour' | 'event'; unlocked: boolean }
interface Achievements {
  charId: string;
  streak: number;          // 当前连续陪伴（复用 computeStreak）
  bestStreak: number;      // 历史最长连续（全年扫描）
  totalSeconds: number;    // 累计陪伴总时长
  level: { no: number; label: string; nextHours: number | null };  // Lv1~Lv10，满级 nextHours=null
  badges: { id: string; label: string; unlocked: boolean }[];      // 里程碑徽章
}
export function computeAchievements(dir, roleId, today): Achievements
```

规则（固定常量，误删）：
- 等级：累计陪伴时长（小时）分 10 档 —— `0/10/50/100/250/500/1000/2000/3500/5000`（单位：小时），对应 Lv1~Lv10；超出后 `nextHours = null`（满级）。
- 徽章（连续陪伴天数 open）：
  - `streak-7`：连续 7 天
  - `streak-30`：连续 30 天
  - `streak-100`：连续 100 天
  - `streak-365`：连续 365 天
  - `total-100h`：累计陪伴 100 小时
  - `total-500h`：累计陪伴 500 小时
  - `total-1000h`：累计陪伴 1000 小时
  - `days-30`、`days-100`：活跃天数里程碑
- 渲染：统计页新增「成就」卡（进度条：当前等级进度 = 时长/下一级阈值；徽章网格，获得彩色、未获得灰显）。

### 5.2 IPC

- `stats:achievements`（R→M，无参）→ `{ ok; achievements?: Achievements }`。主进程传 `roleId`。

数据全部实时计算（不落盘里程碑），无新存储。

## 6. Build 4：趋势对比 + 周报/月报

### 6.1 纯函数（信号增量入 `dailyStats.ts` 或独立 `report.ts`）

```ts
interface PeriodCompare {
  current: { totalSeconds: number; activeDays: number; events: number; interactions: number }
  previous: { totalSeconds: number; activeDays: number; events: number; interactions: number }
  changeTotalPercent: number | null   // 上期为 0 → null（无比较）
}
export function comparePeriods(dir, roleId, currentStart, currentEnd, previousStart, previousEnd): PeriodCompare
export function buildReportMarkdown(report: { title; generatedAt; periods; compare: PeriodCompare; topEvents: [string,number][] }): string
```

- 对比粒度由渲染层决定参数（近 7 天 vs 前 7 天、本月 vs 上月、本年 vs 上年），主进程只做区间聚合，不给定期。
- 报告：标题、生成时间、本期/上期对比表、变化百分比、Top5 事件、热门状态占比。
- Markdown 落盘（主进程）：`文档\DesktopPet\报告\陪伴报告-YYYY-MM-DD-HHmm.md`（`app.getPath('documents')`），返回路径；渲染层显示「已生成：路径」并提示可打开。

### 6.2 IPC

- `stats:trend`（R→M：`currentStart/currentEnd/previousStart/previousEnd`）→ `StatsTrendResult`。
- `stats:report:generate`（R→M：`mode:'week'|'month'`）→ `{ ok; path?; error? }`（内部自动定区间，本期=最近自然周/自然月）。

渲染层：统计页新增「趋势对比」卡（当前展示本期/上期/变化%，`‹ ›` 切换 近7天/本月/本年）+「生成周报/月报」按钮。

## 7. Build 5：Excel 导出

- 依赖：新增 `exceljs`（运行时依赖，electron-builder 打包含 node_modules）。
- IPC `stats:exportExcel`（`R→M: year:number`）→ `StatsSpreadsheetResult`：
  - 主进程弹保存对话框，默认 `陪伴统计-<roleId>-<year>.xlsx`。
  - Sheet「每日明细」：日期/总陪伴秒（格式化 hh:mm:ss）/各状态秒/事件总数/互动；Sheet「汇总」：年度 total 行、活跃天数、日均、Top 事件。
  - 写入 `await workbook.xlsx.writeFile(filePath)`；失败返回 `{ok:false,error}`。
- preload 与 index.d.ts 同步；UI：数据管理卡新增「导出 Excel（当前年份）」按钮。

## 8. 共享设计决定

- **错误处理**：所有新 IPC 保持 `{ ok: boolean; error?: string; ... }` 模式；范围/格式错误沿用 `validateRange` 文案。
- **角色安全化**：`sanitizeRoleId` 对所有参与角色目录的函数生效（防 `../` 注入）。
- **测试**：纯函数（achievements/report 的 compare/渲染、migrate）vitest 单测；构建接口与 IPC 走 typecheck + 实机驱动；无渲染层测试框架沿用「typecheck:web + 驱动验证」。
- **文档与交付惯例**（每构建）：
  - package.json 版本号递增（v0.6.0806.01 ~ .05）
  - CHANGELOG 记新增/修复
  - `docs/使用说明.md`、`docs/API设计.md`、`docs/架构设计.md`（§9 路线图逐构建更新）
  - 备份：`backup/backup_20260806_v06-0X`；最终 `backup_20260806_v06-complete`
  - Build 5 后把「§9 路线图 v0.6」状态改「已完成」并把候选项从功能调整为下代（v0.7 候选）

## 9. 风险与决策

| 风险/分歧 | 决策 |
| --- | --- |
| 历史平铺文件无角色归属 | 启动迁移归入默认角色（`activeCharacterId`，退化 rabbit），文档注明旧数据归旧角色 |
| `stats:range` 90 天限制阻碍全年视图 | 新增专用 `loadDailyRangeFullYear`，`stats:heatmap` 不走 90 天校验（但仍不查未来） |
| 角色 id 路径注入 | `sanitizeRoleId` 普遍防线 |
| Excel 依赖 | 用户确认方案 A（exceljs），替换原「零依赖」记录口径 |
| 同日多角色 | 用子目录规避覆盖，同一天可并存两文件 |

## 验收

1. Build1 后切角色，统计全部跟随所选角色；同日双角色并存不互踩。
2. Build2 整年热力图正确 12 月分格、未来日期无格。
3. Build3 成就数值与手算一致，徽章解锁/未解锁渲染正确。
4. Build4 周报/月报落盘正确、对比百分比正确、上期为 0 显示「—」。
5. Build5 xlsx 双 Sheet 内容正确，Excel/WPS 可开。
6. 每构建 `typecheck && vitest && build` 全绿；实机驱动逐构建写进 CHANGELOG 交付摘要。

## 范围外（本版不做）

- 插件 / API 支持（v1.0）
- 统计云端同步 / 多设备
- 报告定时自动触发（仅手动生成）