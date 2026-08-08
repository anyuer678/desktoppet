# CHANGELOG

本项目遵循《软件项目开发规范（扩展版）》。

版本格式：`大版本号.日期.构建编号`
日期字段=月（前两位）日（后两位），当天构建号递增、跨日重置。

## v1.0 (正式版，由 1.0.0807.01~05 开发构建合并)

Date: 2026-08-07

正式版说明：v1.0 为 1.0.0807.01~05 五个开发构建的合并发布（事件通知页面 + 首页事件卡片下线 + 界面美化 + 潜在 bug 修复，各步详见下文开发构建记录）。

### 1.0.0807.05 (潜在 bug 修复，开发版)

Date: 2026-08-07

修复：
- 剪贴板图片去重失效：纯图片指纹原为每轮询唯一（`img:<时间戳>`）且去重判定仅对文本生效，剪贴板持续含图时每 3s 重复弹气泡——现图片用常量指纹 `img`，8s 窗口内不再重复，窗口过期后再现会重新通知（+2 测试）
- 推送 token 认证改恒定时间比较（`timingSafeEqual`），消除回环场景的时序侧信道
- 推送服务请求体超 8KB 时由 `req.pause()` 挂起改为继续排空请求体，避免 keep-alive 连接滞留
- 电池采样器退出时未停止（PowerShell 轮询残留）：`batterySampler` 提为模块级并在 `will-quit` 中 `stop()`
- 控制中心页脚版本号由硬编码改为 IPC 动态获取（`app:version`），消除发版忘记同步的过期显示
- 移除渲染层调试残留 `console.log('[pet-hit] map ready')`；清理 `src/main/ipc`、`src/main/windows` 空目录

## v1.0.0807.04 (控制中心界面美化·第二层，开发版)

Date: 2026-08-07

改进：
- 全应用状态分布/图表/图例统一到语义色体系（待机灰绿/专注绿/睡眠暮紫/开心珊瑚/告警琥珀，STATE_LABELS 自旧 emerald/sky/indigo 系迁移）
- 首页统计小卡分色磁贴（今日=绿、本周=暮紫、互动=珊瑚，浅底+同色描边），角色头像圆角+绿环+柔阴影
- 事件页筛选行收纳进柔和面板（圆角暖底），空状态加柔和绿点视觉
- 全局自定义滚动条（8px 暖色圆角细条，悬停加深）

## v1.0.0807.03 (控制中心界面美化，开发版)

Date: 2026-08-07

改进：
- 控制中心整体治愈系精修：暖米白+森林绿基调不变，卡片圆角提升（0.75rem）并换用双层柔暖阴影，按钮加按压微动效
- 新增状态语义色体系：warning 琥珀 / happy 珊瑚 / sleep 暮紫 / focus 绿 / idle 灰绿，配浅底变体；事件页行徽章与首页角色卡状态徽章改为语义分色（桌宠情绪色映射界面）
- 侧栏导航改胶囊按钮（选中主色底+白字+软阴影，悬停淡底），品牌名加绿点徽记，页脚版本号同步
- 页签切换内容淡入微动效（卡片交错 30ms 级，`prefers-reduced-motion` 下禁用）
- Badge 组件改为药丸形；事件列表行悬停淡底色、容器圆角化

## v1.0.0807.02 (首页事件中心卡片下线，开发版)

Date: 2026-08-07

移除：
- 控制中心首页「事件中心」活跃事件卡片下线（事件页已可回溯完整事件流，见 v1.0.0807.01）；同步删除其专属 IPC：`events:snapshot` handler、`pet:events` 广播（原每 4 秒一次）、preload `snapshot()` / `onPetEvents()`、共享类型 `EventSnapshot`，渲染层事件页走 `events:history` 通道不受影响

## v1.0.0807.01 (事件通知页面，开发版)

Date: 2026-08-07

新增：
- 控制中心新增「事件」页签：展示本次运行的事件流（最新在前，上限 200 条环形缓冲，重启清空），覆盖系统监控/插件/剪贴板/目录/前台/推送/日程全部注入路径
- 来源分组筛选（系统监控/插件/剪贴板/目录/前台应用/推送/日程）、状态归类筛选（warning/happy/sleep/focus/idle）、「仅高优先级」（priority ≥ 8）开关
- 单条展开详情（原始字段 source/type/priority/durationMs/occurredAt）；「清空」二次确认
- 历史只记录"新发生"事件：同 source+type 持续活跃的替换刷新不产生新记录，避免告警持续期间刷屏
- 状态归类/来源分组/优先级口径抽为共享纯模块（`src/shared/eventState.ts`，`STATE_CATEGORIES` 自 eventCenter 迁入，行为不变）
- 新增 IPC：`events:history` / `events:historyClear` / `pet:events:history`（全量快照广播）

已知问题：
- 事件历史仅本次运行内存保存，重启后清空（按设计非目标，不做持久化）

## v0.9.0807.01 (被动事件拟人化互动，开发版)

Date: 2026-08-07

改进：
- 被动数据源（剪贴板/目录/前台）气泡由「复述原文」改为拟人化台词互动：剪贴板原文不再下发到渲染层，改为按内容特征（链接/代码/长文/短文/图片）在 main 端分类，携带简短占位片段（域名/文件名/应用名），桌宠从台词池挑选台词并插值打出
- 剪贴板图片识别：剪贴板含图像时走 `clipImage` 台词（复用图片格式探测 `availableFormats`，配合 image 读取）
- 敏感内容保护：疑似 token/密码/卡号/验证码（`sk-`、AKIA、BEGIN PRIVATE KEY、13-19 位数字等）时仅显示 `clipSensitive` 台词，原文根本不进入 IPC
- 重复抑制：同一剪贴板内容 8 秒内不重复触发（过期指纹淘汰），避免连弹
- push 通道保留正文展示语义，套用「收到：{title}」台词包装（独立 `reactionReply` 渲染，正文第二行）
- 台词设置页新增 9 组可自定义台词池：剪贴板·链接/代码/长文/短文/图片/敏感、文件夹变化、前台应用、推送提醒；支持 `{placeholder}`（域名/文件名/进程名）、`{title}` 占位
- 前台应用切换命中 focus 映射时由「仅注入事件」升级为「注入 + 气泡反应」
- 预设台词扩充：基础池（欢迎/问候/互动/困倦/开心/警告）与新增被动池（链接/代码/长文/短文/图片/敏感/文件夹/前台/推送）各增至 4~5 句，保持时段正则约束与占位符约定

## v0.9.0806.03 (事件中心架构化 + 被动数据源，开发版)

Date: 2026-08-06

新增：
- 事件中心架构化：新增统一数据源接口 `EventSource`（poll / watch 两类）与注册中心 `sourceHub`（src/main/event/sourceHub.ts），`tick` 驱动 poll 源、start/stop 幂等、单源异常隔离（只记日志不中断其他源）；把原散落的 monitor / plugin 事件刷新逻辑迁移为 `systemSource` / `pluginSource`（行为不变，type/priority/durationMs/通道名零改动），随 `.01` 构建回归保绿
- 剪贴板源（默认开启）：每 3s 轮询剪贴板，复制内容变化且通过规则时气泡显示（有限长度截断 + 省略号）并计入当日统计（`clipboard` 事件）；过滤规则支持「仅通知正则（onlyPatterns）」与「忽略正则（ignorePatterns）」逐行配置
- 目录源（默认关闭）：`fs.watch` 监听指定目录，新出现且匹配通配符（`*` / `?`）的文件触发气泡与统计（`folder` 事件）；500ms 防抖合并变化
- 前台应用源（默认关闭）：零依赖 PowerShell（user32 `GetForegroundWindow` + `GetWindowThreadProcessId`）每 15s 取前台窗口进程名与标题（仅元数据，不读内容）；映射 `进程:focus` → 进入专注状态（working 事件、priority 4）、`进程:ignore` → 忽略；无映射仅计数（`foreground`）不打扰
- 「开发者」页签（控制中心）：三源卡片（剪贴板/目录/前台）可调启用、轮询间隔、正则/通配符/映射规则，逐源「测试」按钮 + 底部「保存」；保存后重建数据源 hub 即时生效（目录路径为文本输入）
- 配置持久化 `%APPDATA%/desktop-pet/passiveSources.json`（passiveStore：逐节注入默认、损坏容错、validate 校验）；新 IPC `passive:get` / `passive:set` / `passive:test` + preload `passive.*`

修复：
- `push:fired` 气泡此前 pet 渲染层未订阅（onPushFired 已暴露但无展示端），第三方推送 / 剪贴板 / 目录 / 前台源触发均无气泡——现 pet 窗口订阅并展示（标题 + 正文，8 秒）
- 控制中心地址栏到 tab 的映射缺失 `push` / `dev`：从菜单/哈希打开「推送」「开发者」页会错误落到首页；现补全映射（applyTab）

已知问题：
- 前台应用检测依赖 PowerShell 的 user32 调用，个别精简系统如无 PowerShell 将静默降级（不注入只记日志）。

## v0.8.0806.01 (事件推送 API，开发版)

Date: 2026-08-06

新增：
- 本地 HTTP 推送服务（Node 内置 http，零新依赖）：监听 127.0.0.1 随机空闲端口，`POST /api/event` 供第三方程序推送事件（curl/脚本/软件均可）
- Token 认证：`Authorization: Bearer <token>`（32 位随机 hex，首次启动生成持久化于 userData/pushApi.json，控制中心可重置）；缺/错 token 返回 401，请求体>8KB 返回 413，路径/方法/JSON/title/message 非法分别返回 404/405/400/400
- 事件转达：推送成功 → 注入事件中心（默认 type=notice 归「专注」，可选 type 如 complete/warning 驱动对应状态动画）+ 桌宠气泡（`push:fired` 事件，标题+正文，8 秒）+ 计入当日统计（countEvent('push')）
- 新增 IPC：`pushApi:get`（服务状态/端口/token）、`pushApi:setEnabled`（启停服务与配置）、`pushApi:resetToken`（重新生成并落盘）、`pushApi:test`（本地发送示例推送验证链路）
- 「推送」页签（控制中心）：服务状态徽标、地址行、Token（复制/重置）、启用开关、curl 调用示例、「发送测试」按钮
- 服务生命周期：应用启动即就绪、退出时幂等关闭；启动失败仅记日志不影响主程序

修复：
- 暂无

已知问题：
- 暂无

## v0.7.0806.01 (报告自动化，开发版)

Date: 2026-08-06

新增：
- 新增自动报告配置（持久化于 userData/autoReports.json）：周报（启用 + 星期 + HH:mm）与月报（启用 + 日期 + HH:mm），独立于日程与设置文件；默认全部关闭
- 新增 `autoReport:get` / `autoReport:set` IPC（set 经 validateAutoReportConfig 校验 dayOfWeek 0-6 / dayOfMonth 1-31 / time HH:mm）
- 主进程分钟级 ticker（60s 扫描，同一分钟防重复触发）：到点自动生成周报/月报，并双通道提醒——桌宠气泡（`autoReport:fired` 事件）+ Windows 系统通知（Electron Notification）
- 启动时静默补发：本周期（本周一 / 本月）未生成且已过当日触发时刻 → 自动补生成一次，仅落盘不弹提醒
- 报告去重按周期键：文件名 `陪伴周报-<本周一>-<今天>.md`、`陪伴月报-<YYYY-MM>-<今天>.md`，手动生成与自动生成互斥（同周期不重复落盘）
- 重构：`stats:report:generate` handler 内联逻辑抽取为 `generateReportFile()`（report.ts），手动/自动共用；报告落盘目录不变（文档/DesktopPet/报告/）
- 「统计」页新增「自动报告」卡片（周报/月报开关、星期/日期选择、时间输入、保存按钮）

修复：
- 生成周报/月报后无 UI 反馈（reportMsg 赋值但未渲染）——「数据管理」卡现显示「已生成：<完整路径>」
- 新增「打开报告文件夹」按钮与 `stats:openReportDir` IPC（主进程 shell.openPath，默认目录「文档/DesktopPet/报告/」）
- 修复 `src/main/index.ts` 重复 import `buildWorkbook` 行（历史遗留）

已知问题：
- 暂无

## v0.6.0806.06 (统计深化：Excel 按年导出 + v0.6 收官，开发版)

Date: 2026-08-06

新增：
- 新增 `stats:exportExcel` IPC（参数 year:number，2000~2100 整数）：按年拉取全年逐日统计（含未来日 present=false），弹出保存对话框导出 xlsx
- 导出文件含两个工作表：每日明细（日期/陪伴秒/五大状态秒/事件数/点击/拖动/说话）、汇总（总陪伴秒/活跃天数/日均秒）；依赖 exceljs
- 「数据管理」卡新增「导出 Excel（〈当前年份〉年）」按钮，成功后显示导出路径

修复：
- 年度热力图加载失败时清空旧数据（不再出现「旧图 + 错误横幅」共存）
- 补齐 `src/preload/index.d.ts` 缺失的 StatsYearResult/StatsExportResult/StatsClearResult 类型导入（历史遗留，skipLibCheck 曾遮盖）

已知问题：
- 暂无

## v0.6 收官记录（v06-complete）

Date: 2026-08-06

- v0.6（统计深化）全部 6 个构建（.01 多角色统计分离 → .06 Excel 按年导出）完成，源码与文档已归档：`backup/backup_20260806_v06-complete/`。
- 路线图 v0.6 状态已更新为「已完成（…v06-complete 已备份）」，下代候选转移为 v0.7 行（如：报告定时自动触发、多设备同步）。

## v0.6.0806.05 (统计深化：趋势对比 + 周报/月报，开发版)

Date: 2026-08-06

新增：
- 新增 `stats:trend` IPC（参数 cStart/cEnd/pStart/pEnd 四段日期）：按角色对比两期 PeriodMetric（陪伴时长、活跃天数、事件总数、互动次数），返回 `changeTotalPercent`（上期为零时返回 null）
- 统计页新增「趋势对比」卡：近7天 / 本月 / 本年三种模式分按钮切换，展示本期/上期陪伴时长、变化百分比、活跃天数（本期/上期）
- 新增 `stats:report:generate` IPC（参数 week|month）：自动生成本期 vs 上期的 Markdown 周报/月报（含统计范围、对比表、事件 Top5），落盘到「文档/DesktopPet/报告/」
- 「数据管理」卡新增「生成周报 / 生成月报」按钮，成功后显示报告路径

修复：
- 暂无

已知问题：
- 暂无

## v0.6.0806.04 (交互重构 + 统计落盘修复，开发版)

Date: 2026-08-06

新增：
- 左键点击默认动作由「打开设置面板」改为「说互动台词」（可配置；设置面板并入右键菜单）
- 右键菜单新增「设置」「换一个」项：设置直达控制中心设置页，换一个循环切换已装角色

修复：
- 互动点击统计失灵：改版后左键触发 speak 动作不再计入 click，现任何左键点击均同时计 click（说话再计 speak），点击统计恢复
- 陪伴记录「关闭后清零 / 当日不更新」：落盘由固定 5000ms 防抖改为 2s 节流（已有定时器合并 + 距上次保存 ≥2s 执行），避免「防抖时长 ≥ tick 间隔」导致定时器被持续重置而永不落盘

已知问题：
- 暂无

## v0.6.0806.03 (统计深化：成就/里程碑，开发版)

Date: 2026-08-06

新增：
- 新增 `stats:achievements` IPC（无参数）：按当前角色计算成就数据（当前/最长连续陪伴天数、累计陪伴时长、等级、徽章解锁状态；等级阈值 10 档与 9 枚徽章阈值为固定常量）
- 统计页新增「成就与里程碑」卡：展示当前/最长连续天数与累计陪伴、等级进度条（含距下一级还需小时数，满级显示「已满级」）、9 枚徽章（连续 7/30/100/365 天、累计 100/500/1000 小时、活跃 30/100 天；未解锁以半透明+锁展示）

修复：
- 暂无

已知问题：
- 暂无

## v0.6.0806.02 (统计深化：整年热力图，开发版)

Date: 2026-08-06

新增：
- 新增 `stats:heatmap` IPC（参数 year:number，2000~2100 整数）：拉取整年逐日记录（不受 `stats:range` 90 天限制；当年未来日期返回 present=false 空统计，不报错）；闰年自动 366 天
- 统计页新增「年度热力图（GitHub 风格）」卡：12 行 × 31 列月行网格展示全年陪伴强度（无记录灰、其余按全年最大值分 4 档绿色），可「‹ ›」切换年份，显示全年总陪伴/活跃天数；点击任意天查看当天明细，可删除该天（二次确认）

修复：
- 暂无

已知问题：
- 暂无

## v0.6.0806.01 (统计深化：多角色分离，开发版)

Date: 2026-08-06

新增：
- 陪伴统计按角色分离：存储由 `stats/*.json` 平铺改为 `stats/<角色id>/*.json`；切换角色后首页/统计页/导出/清空均只反映当前角色
- 旧版平铺统计自动迁移到当前角色子目录（幂等、冲突按 updatedAt 保留较新者）

修复：
- 暂无

已知问题：
- 旧数据无法追溯原属角色，统一归入迁移时的当前角色

## v0.5 收官（存档 + v0.6 候选清单立项）

Date: 2026-08-05

- v0.5（陪伴统计）全部功能完成，源码与文档已归档：`backup/backup_20260805_v05-complete/`。
- 路线图（`docs/架构设计.md` §9）新增 **v0.6（候选，未承诺）**：
  - 月度/年度趋势对比与自动周报、月报（Markdown/HTML 报告）
  - 导出增强：Excel（.xlsx）导出、按年导出
  - 陪伴成就/里程碑：连续陪伴徽章、累计时长等级
  - 整年热力图视图（GitHub 风格，全年单视图）
  - 多角色统计分离（按当前角色分别记录）
- 下一里程碑：v1.0 插件 / API / 第三方接入。

## v0.5.0805.04 (统计增强：热力图 / 24小时分布 / streak / 汇总 / 导出管理，开发版)

Date: 2026-08-05

新增：
- 数据模型：每日统计增加 `hours`（24 小时分段时长），旧文件加载自动补零兼容
- 月度热力图：按月日历格展示陪伴强度（4 档配色），月份自由切换；点击某天查看当天明细并可删除该天（二次确认）
- 24 小时时段分布：所选区间每小时累计时长柱状图（历史日期无时段数据，会显示提示）
- 连续陪伴 streak：首页陪伴统计卡片与统计页年度汇总显示「连续陪伴 X 天」（今天无记录从昨天起算）
- 年度汇总：本年总陪伴 / 活跃天数 / 日均（活跃日口径）/ 最活跃日
- 导出与管理：当前区间导出 CSV（主进程保存对话框）；清空全部统计（二次确认，防误触）
- 新 IPC：`stats:year` / `stats:exportCsv` / `stats:deleteDay` / `stats:clearAll`；`stats:report` 响应新增 `streak`；`stats:range` 校验逻辑抽取为可复用 `validateRange`（行为不变）

修复：
- 暂无

已知问题：
- 历史统计文件不含 `hours`，24 小时时段分布从本版本起记录

## v0.5.0805.03 (修复：新建日程无效 / 统计图可读性，开发版)

Date: 2026-08-05

修复：
- 「新建日程」点击后无任何反应：控制中心打开日程编辑器时，新建模式把 `editingScheduleId` 置为 `null`，与「列表视图」的渲染条件 `editingScheduleId === null` 冲突，导致编辑器永不渲染。改为新建模式使用空字符串哨兵值，编辑模式仍用日程 id
- 统计界面可读性：四个图表（每日陪伴时长 / 状态分布 / 事件趋势 / 互动次数）增加柱顶数值标注（时长图显示紧凑时长如「1分钟」，计数图显示次数）、2 条虚线刻度网格线、柱顶留白；日期标签 10px → 11px；空数据日悬停显示「无记录」

已知问题：
- 暂无

---

## v0.5.0805.02 (统计详情页 + 统计实时刷新 + 市场版本判定，开发版)

Date: 2026-08-05

新增：
- 控制中心新增「统计」页签（`#/stats`）：日期区间选择（任意起止日期 + 近7天/近30天快捷，限 90 天、不可查询未来）+ 总览（区间陪伴时长/活跃天数/互动总数/事件总数）+ 四个图表（每日时长柱状图、状态分布堆叠图、事件趋势柱状图 + 事件类型 Top5、互动次数堆叠图），全部纯 CSS 实现（无第三方图表库）
- 新 IPC `stats:range`（参数校验：格式 / start≤end / ≤90 天 / 不查未来）+ preload `stats.range(start, end)`；`dailyStats` 新增 `iterateDates` / `loadDailyRange`（逐日升序，无记录日 `present=false`）+ 6 例新测试
- 统计实时更新：首页陪伴统计卡片与统计页均支持手动「刷新」按钮 + 15s 自动刷新（主进程 4s 粒度累计），首页卡片新增读取失败提示

修复：
- 「本周陪伴」改为自然周统计（本周一至今天），不再把上周数据算入本周；`stats:report` 返回前先落盘今日内存统计，保证本周聚合含进行中的时长、与磁盘一致
- 市场界面过时问题：条目按钮按版本判定——未安装显示「安装」、已安装且市场版本更新显示「升级到 vX」、已安装且版本相同显示「已安装 vX」（禁用）；市场条目带已安装角色版本（`installedVersion`）；market.json 描述更新为当前功能；页脚版本号 v0.4 → v0.5

已知问题：
- 暂无

---

## v0.5.0805.01 (陪伴统计开发启动，开发版)

Date: 2026-08-05

里程碑：
- v0.4 收官（气泡消息 / 交互配置化 / 电量监控），已备份 `backup/backup_20260804_v04-final/`
- v0.5「陪伴统计」开发启动（规划见 docs/架构设计.md §10）：每日在线时长（按状态细分）、事件次数、互动次数、按天 JSON 存储、控制中心展示

新增：
- 统计模块 `src/main/stats/dailyStats.ts`：`todayStr` / `emptyStats` / `addStateTime` / `countEvent` / `countInteraction` / `totalSeconds` / `dailyStatsPath` / `loadDailyStats` / `saveDailyStats` / `aggregateWeek`（最近 7 天含今天，无记录日不计），按天 JSON 存于 `%APPDATA%/DesktopPet/stats/YYYY-MM-DD.json`；10 个单元测试
- 主进程接入：4s tick 按实际间隔累加当前状态时长（秒）；新增事件类型计数（`pet:speech` 广播同源）；日程触发计数 `schedule`；`recordStats` 防抖 5s 落盘 + 跨日自动切换（`ensureStatsDate`）+ 退出时立即保存
- IPC 新增：`pet:interact`（渲染层上报 click/drag/speak 互动次数）、`stats:report`（返回今日 `DailyStats` + 本周 `WeekSummary`）；preload 暴露 `stats.get()` / `stats.reportInteraction(kind)`
- 渲染层：PetApp 用户主动交互（单击/双击/右键动作、拖动超过阈值、speak 动作）上报互动次数；控制中心首页新增「陪伴统计」卡片（今日陪伴时长 / 本周时长与天数 / 互动次数 / 今日状态分布色带与明细）

修复：
- 暂无

已知问题：
- 暂无

---

## v0.4.0804.07 (电量监控：低电量触发告警事件与气泡通知，开发版)

Date: 2026-08-04

新增：
- 电池监控（v0.2 系统监控预留项落地）：`src/main/monitor/battery.ts`——
  - `readBatteryViaPowerShell`：PowerShell 读取 Win32_Battery（EstimatedChargeRemaining + BatteryStatus），无电池/查询失败返回 null（台式机零开销）
  - `createBatterySampler`：异步轮询缓存（默认 60s），事件 4s tick 只读缓存（PowerShell 查询较重，避免阻塞 tick）；stop 后可停
  - `isBatteryLow`：未充电且电量 ≤ 阈值（默认 20%）判定低电量
- systemMonitor：`SystemSample` 新增 `battery` 字段；`MonitorConfig` 新增 `batteryLowPercent: 20`；低电量注入 `monitor:battery / battery_low` 事件（priority 9，与 cpu_high 同级）→ warning 状态 + 气泡告警台词（warning 池自定义）+ 事件通知
- 9 例新测试（battery 5 / systemMonitor 电池 4）

修复：
- 暂无

已知问题：
- 暂无

---

## v0.4.0804.06 (角色交互配置化：单击/双击/右键可自定义，开发版)

Date: 2026-08-04

新增：
- 交互动作枚举 `InteractionAction`：`show_panel`（快捷面板）/ `open_center`（控制中心）/ `menu`（右键菜单）/ `speak`（说互动台词）/ `none`（无动作），定义于 shared/ipc.ts 并与角色包 config.json 的 `interaction` 字段对接
- PetApp 按角色 `detail.interaction` 分派单击/双击/右键（缺省回退原默认行为）；「说互动台词」从新增的互动回应池随机取词
- 角色编辑器新增「交互动作」区块：三个下拉分别配置单击/双击/右键，保存仅写回涉及字段
- configReader 交互动作值域校验（非法回退默认，不影响加载）；configEditor 支持 `patch.interaction` 写回（缺省值回退默认）
- 消息页新增「互动回应」池（`interact`），可在自定义中编辑
- settingsStore `speech` 深度合并：旧版自定义文件缺失新增池时自动补默认（向后兼容）
- 8 例新测试（configEditor 3 / configReader 2 / settingsStore 2 / speech 1）

修复：
- 暂无

已知问题：
- 暂无

---

## v0.4.0804.05 (事件通知：系统/插件事件驱动气泡说话，开发版)

Date: 2026-08-04

新增：
- 事件通知：主进程 tick 对比活跃事件类型集合，**新增类型**时广播 `pet:speech`（事件类型字符串）；桌宠渲染层按 `EVENT_STATE_MAP` 映射到自定义消息池说话。事件持续期间不重复广播，事件消失后再次出现会重新通知
- `diffEventTypes`（eventCenter.ts）：返回本轮事件类型集合与新增列表，跳过 `schedule:` 来源（日程通知由 schedule:fired 气泡承担）；3 例测试
- preload 新增 `events.onPetSpeech(cb)` 订阅；PetApp 说话逻辑从「状态驱动」改为「事件驱动」——`pet:state` 仅驱动动画状态，`pet:speech` 驱动气泡
- 覆盖范围：cpu_high / memory_warning / battery_low / network_error / warning / error → 警告池；complete / success / reward → 开心池；user_idle / sleep / away / lock_screen → 困倦池；focus 类事件不打扰

修复：
- 日程触发气泡被覆盖：原实现中 schedule:fired 的 8 秒标题气泡会被随后的 warning 状态台词（4 秒）覆盖；现日程注入的 alarm 事件不再触发 pet:speech，标题气泡完整保留
- scheduler.ts 缺少 `ScheduleInput` 类型导入导致 typecheck 报错（2 处）

已知问题：
- 暂无

---

## v0.4.0804.04 (日志落盘 + 角色覆盖导入 + electron-builder 打包 + 插件系统骨架，开发版)

Date: 2026-08-04

新增：
- 日志落盘：`src/main/logging/logger.ts`——主进程日志同步写入 `%APPDATA%/DesktopPet/logs/main-YYYY-MM-DD.log`，按日期轮转，同时输出 console。包装所有 `console.log/warn` 为 `log('info'/'warn'/'error', ...)`。8 例测试
- 角色覆盖导入：`importPetArchive` 新增 `options.overwrite` 参数——重复 id 时备份旧目录 → 导入新包 → 成功删备份 / 失败自动恢复旧版。`ImportResult` 新增 `overwritten` 字段。市场安装始终 overwrite=true（支持升级）；手动导入弹 confirm 确认后覆盖。3 例新测试
- electron-builder 打包发布：`electron-builder.yml` 配置（NSIS 安装器 + 桌面快捷方式），`build/icon.png` 应用图标，`characters/` + `plugins/` 作为 extraResources 打包。生产模式 `charactersRoot()`/`pluginsDir()` 指向 `userData/`（可写），首次启动 `seedDefaultCharacters()`/`seedDefaultPlugins()` 从 extraResources 复制默认内容。`npm run dist` 生成安装包，`npm run dist:dir` 生成免安装目录。已验证 `release/win-unpacked/DesktopPet.exe` + `resources/characters/` 正确生成
- 插件系统骨架（v1.0 预留项落地）：`src/main/plugin/pluginHost.ts`——`loadPlugins(pluginsDir)` 扫描 `plugins/*/plugin.json` manifest（校验 id/name/version/events），`pluginEventsToPetEvents` 将声明事件转为 PetEvent 注入事件中心（source=`plugin:<id>`）。tick 中每轮刷新插件事件（清除旧 `plugin:*` → 注入新的），保持持续活跃。`plugin:list` IPC 返回 PluginInfo 列表。首页新增「插件」卡片展示已加载插件。`plugins/sample/plugin.json` 示例插件（注入 `working` 事件使桌宠进入 focus 状态）。11 例测试

修复：
- 暂无

已知问题：
- 暂无

---

## v0.4.0804.03 (事件中心 UI + window:quit + 本地角色市场，开发版)

Date: 2026-08-04

新增：
- 事件中心 UI（v0.2 遗留项落地）：控制中心首页「事件中心」卡片从占位文本改为实时数据——当前状态 Badge + 原因 + 活跃事件列表（type/source/priority/age 秒）。主进程 tick 每 4s 构造 EventSnapshot 广播给控制中心（pet:events），并暴露 events:snapshot IPC 供初次 mount 拉取；preload 新增 events.onPetEvents(cb) 订阅与 events.snapshot() 拉取
- window:quit IPC：主进程 app.quit()；preload window.quit()；设置页「操作」卡片新增「退出桌宠」按钮（API设计.md 中列出但未实现，现已补齐）
- 本地角色市场页（v0.3 市场基础）：catalog 驱动的本地市场——characters/market/market.json manifest + rabbit.pet（仅含 config.json/avatar.png/preview.jpg 的精简包）。控制中心新增「市场」Tab，grid 卡片展示 name/author/desc/version/preview + 「安装」按钮（已安装则显「已安装」禁用）
  - src/main/market/catalog.ts 纯逻辑：readMarketCatalog（读 manifest + 校验字段 + source 路径穿越防护）/ installMarketEntry（解析 source → 复用 importPetArchive 安全导入），11 例测试
  - market:catalog IPC 返回每项含 installed 布尔（对比 character:list）与 previewDataUrl（base64，sandbox 渲染层直接显示）；market:install 调 installMarketEntry

修复：
- 事件中心/市场加载失败静默吞错：loadMarket 加 try/catch 显示错误信息；snapshot() 加 .catch 控制台日志；主进程 events:snapshot / market:catalog 加 console.log 诊断日志，便于排查 dev 模式下主进程未重启导致的 IPC handler 缺失问题

已知问题：
- 暂无

---

## v0.4.0804.02 (气泡消息自定义 UI + 全局快捷键，开发版)

Date: 2026-08-04

新增：
- 气泡消息自定义 UI：控制中心新增「消息」页，9 个场景（启动欢迎/早安/午安/下午好/晚上好/深夜/困倦睡眠/开心/警告）各一个 textarea，一行一条消息，空行自动忽略，清空某场景则该场景不说话；修改后防抖 200ms 自动保存到 settings.speech，桌宠下次说话即生效
- 全局快捷键：Ctrl+Shift+P 显示/隐藏桌宠、Ctrl+Shift+C 打开控制中心；Settings 新增 shortcutsEnabled 字段（默认开启），设置页「全局快捷键」卡片可一键开关；settings:set 中 shortcutsEnabled 变化时即时重新注册/注销；app.on('will-quit') 注销全部
- settings:filePath IPC：主进程暴露 settings 文件路径查询，preload 暴露 settings.filePath()（便于后续备份/导出设置）

修复：
- 暂无

已知问题：
- 暂无

---

## v0.4.0804.01 (气泡消息系统，开发版)

Date: 2026-08-04

新增：
- 气泡消息：桌宠启动约 1.2s 后欢迎语；时段切换时问候（早上/中午/下午/晚上/深夜 5 个时段，跨天不重复）；进入 sleep/happy/warning 状态时说状态台词
- 消息显示 4 秒自动消失，淡入动画；气泡 pointer-events 穿透不挡点击；消息池随机挑选并避免与上一条重复
- speech 纯函数（时段判定/随机挑选/状态台词/欢迎语，7 例测试）

修复：
- 暂无

已知问题：
- 暂无

---

## v0.3.0804.08 (编辑器夜间叠加层开关，开发版)

Date: 2026-08-04

修复：
- 编辑器保存会无条件写入夜间叠加层：无 overlays 的角色仅改名称也会凭空获得夜间变暗效果。新增「夜间叠加层」开关（按角色现有配置初始化勾选），关闭时保存不提交 overlays，原有配置保留

已知问题：
- 暂无

---

## v0.3.0804.07 (编辑器进阶：多状态+夜间叠加层，开发版)

Date: 2026-08-04

新增：
- 角色编辑器进阶：
  - 状态动画编辑支持任意状态：状态下拉切换（idle/sleep/happy/warning…），每状态独立编辑呼吸/浮动参数，不存在的状态自动创建模板节点
  - 夜间叠加层编辑：开始/结束小时（0-23 取模）、夜间亮度（10%-100%）、呼吸缩放、浮动缩放、动画速度（20%-200%），无 overlays 时自动创建 night 节点
- CharacterPatch 扩展：新增 states（按状态名）与 overlays.night；idle 字段保留兼容
- configEditor 5 例新测试（多状态、自动建节点、夜间时间与强度、取模钳制），合计 13 例

修复：
- configEditor 空模板对象不再写入 config（无 breathe/float 字段时不留空节点）

已知问题：
- 暂无

---

## v0.3.0804.06 (代码审查修复，开发版)

Date: 2026-08-04

修复：
- [安全] pet:// 协议路径穿越：`pet://../xxx` 的 host 可解析为 `..`，resolvePetPath 未校验角色目录在仓库内即可读取 characters 外层文件。已加 isWithinRoot 防线 + 2 例穿越测试
- [健壮] 托盘图标硬编码 rabbit：rabbit 被删除后 createFromPath 返回空图。改为候选列表（rabbit → 全部角色主图）逐项尝试，全部失败回退内置 1px 图标
- [健壮] window:setSize 与 settings:set 未钳制 size/opacity：渲染层被绕过可写非法值。主进程统一钳制 96~512 / 0.3~1
- [性能] 控制中心设置滑块拖动高频写盘：updateSettings 防抖 200ms 合并增量提交
- [清理] main/index.ts 未用 sep import；configEditor.test 的 require('fs') 统一为顶部 import

已知问题：
- 暂无

---

## v0.3.0804.05 (角色编辑器基础版，开发版)

Date: 2026-08-04

新增：
- 角色编辑器（基础版）：控制中心「角色」页卡片「编辑」按钮 → 编辑视图，可改名称/版本/默认大小/允许缩放/呼吸幅度与时长/浮动高度与时长，滑块实时预览数值
- updateCharacterConfig 纯逻辑：读 config.json → 合并补丁（未涉及字段保留，缩进 2 写回）→ 数值范围钳制（大小 96~512、呼吸幅度 0~50%、时长 500~10000ms）→ 空名称/版本拒绝、损坏文件拒绝，8 例测试
- character:update IPC + preload character.update；保存成功广播 character:changed，桌宠窗口即时重载新动画参数
- 无 idle 动画结构的角色也能通过编辑自动补全模板字段

修复：
- 暂无

已知问题：
- 暂无

---

## v0.3.0804.04 (角色导出，开发版)

Date: 2026-08-04

新增：
- 角色导出：控制中心「角色」页卡片带「导出」按钮 → 保存对话框（默认名 `<id>-v<version>.pet`）→ 打包为 .pet 压缩包（config.json 位于根，可直接分发/再次导入）
- exportPetArchive 纯逻辑（zip 打包 / id 校验 / 缺 config 拒绝）+ suggestPackFileName 包名生成（版本号安全化），7 例测试含「导出→删除→重新导入」往返一致
- ImportResult 增加可选 path 字段（导出路径）

修复：
- 暂无

已知问题：
- 暂无

---

## v0.3.0804.03 (设置页使用说明，开发版)

Date: 2026-08-04

新增：
- 控制中心「设置」页新增「使用说明」折叠卡片：交互方式 / 点击穿透 / 状态系统 / 叠加层（夜间模式）/ 性能自检 / 多显示器 / 角色导入与删除 / 托盘与单实例，一次展开一项
- 应用内即可查看全部功能说明，与 docs/使用说明.md 内容同步

修复：
- 暂无

已知问题：
- 暂无

---

## v0.3.0804.02 (角色删除+功能说明，开发版)

Date: 2026-08-04

新增：
- 角色删除：控制中心「角色」页卡片带「删除」按钮（confirm 确认，可恢复性提示）；删除当前激活角色时自动回退到剩余第一个角色并广播切换
- deletePetArchive 纯逻辑（id 校验 / 不存在报错 / 不影响其他角色，4 例测试）
- 使用说明全面重写为「功能说明」章节：桌宠本体、交互、点击穿透、状态系统、叠加层、控制中心、托盘与单实例、性能自检、角色系统与导入、多显示器
- 控制中心订阅 character:changed 广播，角色切换/回退后列表与激活态即时同步

修复：
- 暂无

已知问题：
- 暂无

---

## v0.3.0804.01 (角色包导入，开发版)

Date: 2026-08-04

新增：
- 角色包导入：控制中心「角色」页「导入角色包」按钮 → 系统文件选择（.pet/.zip）→ 安全解压并移入角色仓库，成功后列表即时刷新
- importPetArchive 导入流水线：临时目录安全解压（拒绝 ../ 穿越/绝对路径/空段）→ 校验根目录 config.json（id/name/动画）→ id 合法性（小写字母/数字/下划线/短横线）→ 重复 id 拒绝 → rename 移入（失败 copyTree 兜底）
- 手工构造原始 ZIP 的测试工具 buildZipRaw（EOCD 条目数 bug 修复后 10/10）：校验 zip-slip 攻击包（含 `../evil.txt` 原始条目名）被拒
- 新增 IPC：character:pick（主进程 dialog 选文件，适配 sandbox 渲染层）、character:import（返回 ImportResult）；preload 暴露 character.pick / character.import

修复：
- 暂无

已知问题：
- 暂无

---

## v0.2.0804.11 (性能自检，开发版)

Date: 2026-08-04

新增：
- 性能自检：控制中心首页按钮，5s×1Hz 采样主进程 CPU%（process.cpuUsage 帧差）/RSS、渲染进程工作集（app.getAppMetrics）、兔兔窗口动画帧率（rAF 计数每秒上报）
- summarizePerf 纯函数汇总（均值/峰值，3 例测试）；preload perf.start / perf.report
- 采样期间 UI 显示「采集中（5 秒）…」，结果即时展示

修复：
- 暂无

已知问题：
- 暂无

---

## v0.2.0804.10 (穿透改直绘取 alpha，开发版)

Date: 2026-08-04

修复：
- 点击穿透取 alpha 改为直接绘制已加载 <img>（crossOrigin="anonymous" + pet:// CORS 头）到 64px 位图，不再依赖 fetch/blob/createImageBitmap 链；位图就绪即打日志 [pet-hit]
- 位图就绪前 content 矩形立即生效（透明侧边可先穿透）
- 主进程 setIgnoreMouseEvents 加 [pet-hit] 诊断日志，便于定位穿透链路断点

已知问题：
- 暂无

---

## v0.2.0804.09 (穿透精准化+设置直达，开发版)

Date: 2026-08-04

新增：
- 面板"设置"按钮直达控制中心设置页：center:open 支持 tab 参数，中心窗口按 hash（#/center/settings）定位页签，已开窗则动态切 tab

修复：
- 命中 alpha 阈值 16→32：半透明阴影/羽化边缘不再可点，只有兔兔实体像素可交互，其余全部穿透

已知问题：
- 暂无

---

## v0.2.0804.08 (修复点击穿透失效：pet:// CORS，开发版)

Date: 2026-08-04

修复：
- 点击穿透完全失效根因：渲染层 fetch(pet://...) 属跨源请求，协议响应无 Access-Control-Allow-Origin → CORS 拦截 → 命中位图永不加载。协议响应统一加 `Access-Control-Allow-Origin: *`（顺带修复后续所有 pet:// fetch 场景）
- 位图未就绪时按内容矩形兜底：内容矩形外（透明侧边）立即穿透，矩形内暂保持可交互
- fetch 失败重试节流（2s 一次），避免每帧请求风暴

已知问题：
- 暂无

---

## v0.2.0804.07 (动画叠加层+新兔图，开发版)

Date: 2026-08-04

新增：
- 叠加层系统（角色包 schema 向后兼容新增 overlays 字段）：环境条件 → 动画倍率因子，不改变主状态，多层相乘
- 时间条件：跨天区间/永不命中/无条件恒生效；因子：opacity/breatheScale/floatY/speed（template 时长与 sequence fps 都生效）
- 渲染层每 60s 重评条件（overlay.ts 纯函数 11 例测试 + configReader 叠加层解析/夹取/丢弃 2 例测试）
- 兔兔 v1.2：夜间（22-06）变暗 65%、呼吸浮动放缓；主图更换为透明底高清图（1830×1538）

修复：
- 暂无

已知问题：
- 暂无

---

## v0.2.0804.06 (多显示器适配，开发版)

Date: 2026-08-04

新增：
- 位置防丢：启动时校验记录位置，窗口与任一显示器工作区零交集时自动回落主屏右上角（placement.ts 纯函数，9 例测试）
- 显示器热插拔/分辨率变更（display-metrics-changed）时同样校验并纠正
- 位置按屏幕坐标记忆，跨屏拖动天然支持

修复：
- 暂无

已知问题：
- 暂无

---

## v0.2.0804.05 (单实例锁+穿透加固，开发版)

Date: 2026-08-04

新增：
- 单实例锁（app.requestSingleInstanceLock）：重复启动直接退出，二次启动改为唤出控制中心。修复"拖走兔兔后原位置仍挡鼠标"——根因是重复实例留下的第二窗口停在原位

修复：
- 拖拽结束后立即重新命中判定，松开即恢复点击穿透，不再停留在可交互态
- 命中位图为空（加载失败）时保持原状态，避免整窗误判为全透明而无法点击兔兔

已知问题：
- 透明区穿透按图片 alpha 判定：图片角落非全透明时该区域不会穿透（图片本身不透明，属预期行为）

---

## v0.2.0804.04 (透明区点击穿透，开发版)

Date: 2026-08-04

新增：
- 点击穿透：主进程 window:setIgnoreMouseEvents（forward:true），渲染层按精灵像素 alpha 判定可交互区（64×64 位图缓存，序列帧 src 变更自动重采）
- 命中判定纯函数 clickThrough.ts（object-contain 内容矩形计算 / 像素 alpha 查询 / 穿透决策），11 例单元测试
- 面板打开时其区域强制可交互；拖拽过程中强制保持可交互
- preload 新增 window.setIgnoreMouseEvents

修复：
- 暂无

已知问题：
- 暂无

---

## v0.2.0804.03 (修复 GPU 磁盘缓存冲突，开发版)

Date: 2026-08-04

修复：
- 启动时 net\disk_cache "Unable to move the cache: 拒绝访问(0x5)"：多实例/杀软与 userData 的 GPUCache 写盘冲突。主进程加 `disable-gpu-shader-disk-cache`，改用内存缓存，报错消失（功能无影响）

已知问题：
- 暂无

---

## v0.2.0804.02 (修复设置调节失效+新增托盘，开发版)

Date: 2026-08-04

新增：
- 系统托盘：兔兔头像图标 + 右键菜单（显示桌宠/隐藏桌宠/打开控制中心/退出），双击托盘显示桌宠
- applyPetSize：大小调节改为居中缩放窗口，并广播 pet:settings-changed（size+opacity）给渲染层
- preload 新增事件 onSettingsChanged（ipcRenderer.on('pet:settings-changed')）

修复：
- 设置大小/透明度调节"看起来不生效"：窗口尺寸变了但渲染层容器尺寸未同步；透明度仅走原生 setOpacity。现统一：窗口缩放 + 渲染层 CSS 同步（宽高/opacity 状态驱动），任意入口（settings:set / window:setSize / window:setOpacity）都实时生效
- 无托盘时桌宠只能靠右键菜单或任务管理器退出，现托盘可全局控制

已知问题：
- 暂无

---

## v0.2.0804.01 (状态系统+事件中心，开发版)

Date: 2026-08-04

新增：
- 事件中心（src/main/event/eventCenter.ts）：PetEvent 结构、同源去重、过期管理、状态决策（类型+优先级+severity 排序），纯逻辑可测试
- 系统监控（src/main/monitor/systemMonitor.ts）：CPU 采样（os.cpus 帧差）、内存空闲率、用户空闲检测（powerMonitor）→ cpu_high / memory_warning / user_idle 事件
- 主进程每 4s 采样 → 决策 → 广播 pet:state（状态变更才发送）
- 渲染层接入：兔兔 5 状态模板动画（idle/focus/sleep/happy/warning），缺状态自动回退
- 控制中心完整化：shadcn 风格组件（Button/Card/Input/Slider/Switch/Badge）、首页/角色管理/设置页、大小/透明度实时调节、开机启动开关（app.setLoginItemSettings）
- 兔兔角色 v1.1：补充 focus/sleep/happy/warning 状态

新增测试 20 例：事件去重/过期/决策优先级/severity 平级、CPU 帧差、内存百分比、监控事件生成。

优化：
- 文档更新：API设计（pet:state 已实现）、使用说明、README

修复：
- 暂无

已知问题：
- 暂无

---

## v0.1.0803.08 (v0.1 功能完成，开发版)

Date: 2026-08-03

新增：
- 控制中心真实页面（首页/角色管理/设置）
- 设置项接线：大小/透明度实时生效、开机启动开关
- 使用说明文档 docs/使用说明.md、README.md

修复：
- 暂无

已知问题：
- 暂无

---

## v0.1.0803.07 (修复拖拽抽搐，开发版)

Date: 2026-08-03

修复：
- 拖拽抽搐：位移改用屏幕绝对坐标（screenX/Y）计算，消除"窗口移动→窗口内坐标反向变化→反向位移→往复振荡"的反馈环路

已知问题：
- 暂无

---

## v0.1.0803.06 (修复面板无法关闭/拖拽被锁，开发版)

Date: 2026-08-03

修复：
- 面板"无法关闭"根因：关闭点击的 pointerup 冒泡到桌宠根节点，被当作新的单击，260ms 后重新弹开面板
- 面板改为浮动小卡片（右上角 ✕ 关闭），不再整窗遮罩，面板打开时兔兔区域仍可拖拽
- 拖动开始时自动收起面板

优化：
- 双击打开控制中心时同步收起面板

已知问题：
- 暂无

---

## v0.1.0803.05 (桌宠交互完成，开发版)

Date: 2026-08-03

新增：
- 单击兔兔弹出快捷面板（名称/状态/设置/换一个/收起）
- 双击打开控制中心；右键原生菜单（控制中心/隐藏/切换角色/暂停动画/退出）
- 手动拖拽移动（区分点击与拖拽阈值，位置记忆已防抖保存）
- 动画回退链落地：请求状态→default→首状态→静态主图（resolveAnimationState）
- 模板动画参数化（呼吸幅度/浮动距离可配置）；序列帧播放器（按 fps 循环，404 自动收敛）
- 角色切换事件 character:changed / 暂停事件 pet:toggle-pause

优化：
- 移动保存防抖（300ms），避免拖拽时高频写盘

修复：
- clampFps(0) 语义修正为夹到最小值 1

已知问题：
- 暂无

---

## v0.1.0803.04 (修复 pet:// 图片加载，开发版)

Date: 2026-08-03

修复：
- pet:// 协议 URL 解析错误导致角色图片永远 400：standard 协议下首段为 host，之前误当 path 段。现改为 `pet://<id>/<path>`（id 放 host，path 为路径段）
- 安全加固：资源解析限制在**本角色包目录内**（原先仅限角色仓库根，可跨包读文件）

新增：
- resolvePetPath 纯函数 + 测试覆盖（越界/空 host/跨包读取均拦截）

已知问题：
- 暂无

---

## v0.1.0803.03 (启动与测试体系，开发版)

Date: 2026-08-03

新增：
- 抽取核心纯逻辑为可测试模块：角色读取 configReader / 设置存储 settingsStore
- 引入 vitest，单元测试 9 例（角色解析、路径安全、设置合并/持久化）
- Windows 一键脚本：启动.bat / 自检.bat / 构建验证.bat
- npm scripts：test（vitest run）

优化：
- pet:// 协议路径校验统一走 safeResolve（越界拦截有测试覆盖）

修复：
- 暂无

已知问题：
- 暂无

---

## v0.1.0803.02 (环境就绪，开发版)

Date: 2026-08-03

新增：
- npm 工程化脚手架：Electron 37 + electron-vite + React 19 + TypeScript + Vite 6 + Tailwind v4
- .npmrc 镜像加速；electron-vite/tsconfig/shadcn components.json 配置
- 最小可运行链路：透明置顶桌宠窗口 + pet:// 资源协议 + 角色列表 + 设置 JSON 存储
- 示例角色「兔兔」idle 模板动画（呼吸+浮动）

优化：
- 渲染进程 sandbox 开启，遵循《架构设计》安全隔离约定

修复：
- 暂无

已知问题：
- 控制中心为占位页，shadcn UI 组件未初始化，下一阶段接入

---

## v0.1.0803.01 (设计文档基线)

Date: 2026-08-03

新增：
- 项目定位为「桌面角色平台」：角色=资源包，核心引擎与角色解耦
- 确定技术栈：Electron + React + TypeScript + Vite + shadcn/ui + Tailwind CSS
- 建立文档体系：架构设计、角色包规范、API设计
- 创建项目目录骨架

优化：
- 明确 v0.1 交付边界（仅透明窗口/角色加载/idle动画/基础交互/基础设置）

已知问题：
- 暂无