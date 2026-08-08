# v0.5 统计增强 设计文档

Date: 2026-08-05
Version: v0.5.0805.04（规划）
状态：已确认，待实施

## 1. 背景

v0.5「陪伴统计」已完成：按天记录（状态时长/事件/互动）、首页陪伴卡片、统计详情页（区间查询 + 4 图）、实时刷新、市场版本判定。用户确认继续增强五项：

1. 日历热力图（月度陪伴一览）
2. 24 小时时段分布
3. 连续陪伴天数 streak
4. 月度 / 年度汇总
5. 导出与数据管理

## 2. 数据模型

### 2.1 新增字段 `hours: number[]`

`DailyStats` 增加 `hours`（24 长度数组，`hours[i]` = 当日第 i 小时累计陪伴秒数，含小数），与现有字段同文件存储。

- `emptyStats()` 生成 24 个 0
- `loadDailyStats` 归一化：缺失 / 长度不足 → 补零到 24；多余截断。旧文件自动兼容
- `addStateTime(stats, state, seconds, now?)` 增加可选第 4 参 `now`（毫秒时间戳），按 `new Date(now).getHours()` 累加 `hours[hour]`；不传时行为不变（用当前时间），现有调用与测试不受影响
- 主进程 tick 调用点传入 `now`

### 2.2 兼容性

历史 JSON 无 `hours` 字段 → 加载时补零；历史日期在 24 小时图中无有效数据，图表显示提示文案「历史数据不包含时段分布（自本版本起记录）」。

## 3. 后端能力

### 3.1 纯函数（dailyStats.ts，全部可单测）

| 函数 | 说明 |
| --- | --- |
| `computeStreak(dir, todayISO)` | 连续陪伴天数：从今天（今天 totalSeconds=0 则从昨天）向前数 `totalSeconds>0` 的连续天数，遇 0 或空文件中断 |
| `summarizeYear(dir, year)` | 全年：总秒数 / 活跃天数 / 日均（=总/活跃天）/ 最活跃日（日期+秒数）；无数据返回 null |
| `buildStatsCsv(days: {date, stats}[])` | 区间 CSV：表头 `日期,陪伴秒数,待机秒,专注秒,睡眠秒,开心秒,告警秒,事件总数,点击,拖动,说话`，每日期一行 |
| `deleteDailyStatsFile(dir, dateISO)` | 删除单日文件，返回是否删除 |
| `clearStatsDir(dir)` | 删除统计目录内全部 `*.json`，返回删除数 |

`normalizeHours(stats)` 辅助函数供 `loadDailyStats` / `addStateTime` 复用。

### 3.2 IPC 新增（主进程 handler + preload + shared 类型）

| IPC | 入参 | 返回 | 校验 |
| --- | --- | --- | --- |
| `stats:year` | `year: number` | `{ok: true, summary: YearSummary \| null}` / `{ok: false, error}` | 整数 2000~2100 |
| `stats:exportCsv` | `start, end: string` | `{ok: true, path}` / `{ok: false, canceled: true}` / `{ok: false, error}` | 复用 stats:range 校验（格式 / start≤end / ≤90 天 / 不查未来），先校验后弹 `dialog.showSaveDialog` 写文件（UTF-8 BOM，Excel 中文兼容） |
| `stats:deleteDay` | `date: string` | `{ok: true}` / `{ok: false, error}` | `isValidDateStr`，文件不存在也算 ok |
| `stats:clearAll` | — | `{ok: true, deleted: number}` | — |

**复用不新增 IPC**：
- 热力图月份数据 → 现有 `stats:range`（月 ≤31 天，校验已覆盖）
- 月度汇总 → 渲染层由 range 数据计算
- streak → `stats:report` 响应增加 `streak: number` 字段（首页卡片 + 统计页年度卡显示）

### 3.3 行为细节

- `stats:clearAll`：删除全部统计文件后，同步把内存 `dailyStats` 重置为 `emptyStats()`、`statsDate` 保持今天，防止退出 will-quit 把旧数据写回
- `stats:deleteDay`：仅删当日文件；若删的是今天，同步重置内存（同上）
- 导出对话框取消 → `{ok:false, canceled:true}`，UI 静默不报错

## 4. 前端展示

### 4.1 统计页签（新增卡片，置于现有 4 图之后）

**月度热力图**
- 月份导航 ◀ ▶ + 「2026 年 8 月」标题；可自由切换（限 2000~2100），未来月份正常显示空
- 表头 一 二 三 四 五 六 日；首日星期留空、末日补满
- 配色：以当月最大陪伴时长为基准动态 4 档（0~25% / 25~50% / 50~75% / >75%），无记录灰、逐档加深绿（emerald-200→500）
- 今天格子加 ring 边框；悬停 title：`日期 · 陪伴时长`（无记录显示「无记录」）
- 点击某天 → 卡片下方展开当天明细：总时长、各状态时长、事件数、互动数 + 「删除这一天」按钮（内联二次确认）
- 切换月份重新 `stats:range` 加载

**24小时时段分布**
- 复用 VBarChart，24 根柱（区间内各小时累计秒数），柱顶数值标注，标签每 3 小时显示（0/3/6/…/21）
- 区间内所有日期均无 `hours` 数据（或全 0）→ 显示提示文案 + 图表占位

**年度汇总**
- 本年（1 月 1 日 ~ 12 月 31 日）：总陪伴、活跃天数、日均（活跃日口径）、最活跃日（日期+时长）、当前连续陪伴天数
- 数据源 `stats:year`

**管理按钮行**
- `导出 CSV（当前区间）`：以当前所选区间调 `stats:exportCsv`，成功提示保存路径
- `清空全部统计`：内联红色确认面板（「确认清空」二次点击执行），完成后刷新全页数据

### 4.2 首页卡片

陪伴统计卡片增加「连续陪伴 X 天」行（`stats:report.streak`）。

## 5. 测试计划

dailyStats.test.ts 新增约 14 例：

1. normalizeHours：旧文件缺失补零 / 长度不足补零 / 多余截断
2. addStateTime：固定 now 断言写入正确小时位；不传 now 行为不变
3. computeStreak：0 天 / 连续 1 天 / 连续 3 天 / 今天无数据从昨天起算 / 断档中断 / 跨月连续
4. summarizeYear：空年返回 null / 部分月份汇总 / 最活跃日与日均口径
5. buildStatsCsv：表头 / 多行数据 / 空区间
6. deleteDailyStatsFile / clearStatsDir：临时目录隔离、存在/不存在、返回删除数

验证：typecheck（node+web）、`npm test` 全绿、`npm run build`；运行时用调试驱动实测（热力图渲染、streak 显示、导出对话框、删除/清空后归零、重启持久化）。

## 6. 交付

- package.json → `0.5.0805.04`；CHANGELOG 新增 v0.5.0805.04 条目（含已知问题：历史日期无时段数据）
- docs 同步：使用说明 §2.11、API设计（新 IPC 与类型）、架构设计 §10（hours 字段 + 新能力 + 路线图状态）
- 备份 `backup/backup_20260805_v05-04/`

## 7. 风险与决策

- **数据模型扩展**：hours 为首个向后扩展字段，靠加载归一化兼容，无迁移脚本（v1.0 SQLite 前均可接受）
- **破坏性操作**：删除某天 / 清空全部均有显式确认，清空后内存同步重置防回写
- **口径**：streak 与日均均以「当日 totalSeconds > 0」判定活跃；24h 分布为区间聚合（非单日）
