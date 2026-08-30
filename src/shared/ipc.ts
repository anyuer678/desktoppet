import type { SpeechPools } from './speech'

export interface Settings {
  position: { x: number; y: number }
  size: number
  opacity: number
  autoLaunch: boolean
  activeCharacterId: string
  /** 气泡消息池（可自定义，空池表示该场景不说话） */
  speech: SpeechPools
  /** 全局快捷键开关（Ctrl+Shift+P 显示/隐藏、Ctrl+Shift+C 控制中心） */
  shortcutsEnabled: boolean
}

export interface CharacterSummary {
  id: string
  name: string
  version: string
  preview: string
  supportedStates: string[]
}

export interface AnimationTemplateConfig {
  breathe?: { scale?: number; duration?: number }
  float?: { y?: number; duration?: number }
  bounce?: { y?: number; duration?: number; ease?: string }
  swing?: { angle?: number; duration?: number }
}

export interface AnimationStateConfig {
  type: 'sequence' | 'template'
  path?: string
  loop?: boolean
  fps?: number
  template?: AnimationTemplateConfig
}

export interface OverlayTimeCondition {
  start: number
  end: number
}

export interface OverlayApplyConfig {
  opacity?: number
  template?: {
    breatheScale?: number
    floatY?: number
    speed?: number
  }
}

export interface OverlayConfig {
  condition?: { time?: OverlayTimeCondition }
  apply: OverlayApplyConfig
}

/** 交互动作枚举：open_center=控制中心 / menu=右键菜单 / speak=说互动台词 / none=无动作 */
export const INTERACTION_ACTIONS = ['open_center', 'menu', 'speak', 'none'] as const
export type InteractionAction = (typeof INTERACTION_ACTIONS)[number]

export interface CharacterInteraction {
  click: InteractionAction
  doubleClick: InteractionAction
  rightClick: InteractionAction
}

export interface CharacterDetail {
  id: string
  name: string
  version: string
  avatarMain: string
  avatarPreview?: string
  defaultState: string
  supportedStates: string[]
  animation: Record<string, AnimationStateConfig>
  overlays?: Record<string, OverlayConfig>
  interaction: CharacterInteraction
  settings: { defaultSize: number; allowResize: boolean }
}

export interface CharacterLoaded {
  id: string
  ok: boolean
  error?: string
}

/** 状态模板动画补丁（数值范围由主进程钳制） */
export interface StateTemplatePatch {
  breatheScale?: number
  breatheDuration?: number
  floatY?: number
  floatDuration?: number
}

/** 角色配置编辑补丁（仅可编辑字段；数值范围由主进程钳制） */
export interface CharacterPatch {
  name?: string
  version?: string
  defaultSize?: number
  allowResize?: boolean
  idle?: StateTemplatePatch
  /** 按状态名编辑模板动画，key 与 config animation.states 对齐 */
  states?: Record<string, StateTemplatePatch>
  /** 交互动作（未涉及的按键保留原配置；值域非法由主进程回退默认） */
  interaction?: Partial<CharacterInteraction>
  /** 夜间叠加层（overlays.night）：时间与强度 */
  overlays?: {
    night?: {
      start?: number
      end?: number
      opacity?: number
      breatheScale?: number
      floatY?: number
      speed?: number
    }
  }
}

export interface ImportResult {
  ok: boolean
  id?: string
  name?: string
  path?: string
  error?: string
  /** 覆盖导入成功时为 true（旧版已替换） */
  overwritten?: boolean
}

export interface PerfSample {
  cpuPercent: number
  rssMB: number
  rendererMB: number
  fps: number
}

export interface PerfReport {
  samples: PerfSample[]
  avgCpu: number
  maxCpu: number
  avgRssMB: number
  avgRendererMB: number
  avgFps: number
}

/** 事件中心：单条事件信息（主进程 → 控制中心） */
export interface PetEventInfo {
  source: string
  type: string
  priority: number
  durationMs: number
  occurredAt: number
}

/** 事件历史：初始化拉取结果（主进程 → 控制中心） */
export interface EventHistoryResult {
  ok: boolean
  events: PetEventInfo[]
}

/** 事件历史：新增记录时广播的全量快照 */
export interface HistoryChanged {
  events: PetEventInfo[]
}

/** 本地角色市场：目录项（manifest 文件字段） */
export interface MarketEntry {
  id: string
  name: string
  author: string
  description: string
  version: string
  preview: string
  source: string
}

/** 市场目录项 + 安装状态 + 预览图（data URL，便于 sandbox 渲染层直接显示） */
export interface MarketEntryWithStatus extends MarketEntry {
  installed: boolean
  /** 已安装角色的版本（未安装则缺省），供渲染层判断「已安装 / 可升级」 */
  installedVersion?: string
  previewDataUrl: string
}

/** 插件事件声明（manifest 中静态声明，插件加载后注入事件中心） */
export interface PluginEventDecl {
  type: string
  priority: number
  durationMs: number
}

/** 插件 manifest（plugin.json） */
export interface PluginManifest {
  id: string
  name: string
  version: string
  description: string
  events: PluginEventDecl[]
}

/** 插件信息（IPC 返回，含加载状态） */
export interface PluginInfo {
  id: string
  name: string
  version: string
  description: string
  eventCount: number
  enabled: boolean
}

/** 日程触发类型：once=单次（指定时刻触发一次后自动禁用）；daily=每天；weekly=每周指定周几 */
export type ScheduleType = 'once' | 'daily' | 'weekly'

/** 日程条目（持久化于 userData/schedules.json） */
export interface ScheduleItem {
  /** 稳定唯一 id（timestamp-base36） */
  id: string
  /** 日程标题（必填，气泡中显示） */
  title: string
  /** 可选备注（气泡副文本） */
  message: string
  /** 触发类型 */
  type: ScheduleType
  /** once：YYYY-MM-DDTHH:mm:00（本地时区 ISO）；daily/weekly：HH:mm（24h） */
  trigger: string
  /** weekly 类型生效：周日=0..周六=6；空数组视为不触发 */
  daysOfWeek: number[]
  /** 是否启用（触发后 once 类型自动置 false） */
  enabled: boolean
  /** 上次触发时间戳（ms），用于同一分钟内防重复触发 */
  lastFiredAt: number | null
  /** 创建时间戳（ms） */
  createdAt: number
}

/** 创建/更新日程时的输入（id 由主进程分配，lastFiredAt/createdAt 由主进程维护） */
export interface ScheduleInput {
  title: string
  message: string
  type: ScheduleType
  trigger: string
  daysOfWeek: number[]
  enabled: boolean
}

/** 日程触发事件（主进程 → 渲染层，桌宠气泡 + 状态变化） */
export interface ScheduleFired {
  id: string
  title: string
  message: string
  firedAt: number
}

/** 通用操作结果 */
export interface OpResult {
  ok: boolean
  error?: string
}

/** 互动类型（渲染层上报，计入陪伴统计） */
export type InteractionKind = 'click' | 'drag' | 'speak'

/** 单日陪伴统计（持久化于 userData/stats/YYYY-MM-DD.json） */
export interface DailyStats {
  date: string
  /** 各状态时长（秒） */
  secondsByState: Record<string, number>
  /** 当日每小时累计陪伴秒数（24 长度；旧文件缺省 → 补零） */
  hours: number[]
  /** 事件类型计数（cpu_high/battery_low/schedule 等） */
  events: Record<string, number>
  interactions: Record<InteractionKind, number>
  updatedAt: number
}

/** 最近 7 天聚合（含今天；无文件的天不计入 days） */
export interface WeekSummary {
  days: number
  totalSeconds: number
  events: Record<string, number>
  interactions: Record<InteractionKind, number>
}

export interface StatsReport {
  today: DailyStats
  week: WeekSummary
  /** 当前连续陪伴天数（今天无记录则从昨天起算） */
  streak: number
}

/** 统计区间查询：单日记录（present=false 表示该日无记录文件） */
export interface RangeDay {
  date: string
  present: boolean
  stats: DailyStats
}

/** stats:range 返回（含参数校验结果；区间限 90 天） */
export interface StatsRangeResult {
  ok: boolean
  error?: string
  days?: RangeDay[]
}

/** 年度汇总（activeDays = 有记录的天数；avg 为日均活跃口径） */
export interface YearSummary {
  year: number
  totalSeconds: number
  activeDays: number
  avgSecondsPerActiveDay: number
  bestDay: { date: string; seconds: number } | null
}

export interface StatsYearResult {
  ok: boolean
  error?: string
  summary?: YearSummary | null
}

/** stats:heatmap 返回（全年逐日；未来日期 present=false） */
export interface StatsHeatmapResult {
  ok: boolean
  error?: string
  days?: RangeDay[]
}

export interface StatsExportResult {
  ok: boolean
  error?: string
  /** 用户取消保存对话框 */
  canceled?: boolean
  /** 成功时保存路径 */
  path?: string
}

export interface StatsClearResult {
  ok: boolean
  error?: string
  deleted?: number
}

export interface AchievementLevel {
  no: number
  label: string
  nextHours: number | null
}

export interface AchievementBadge {
  id: string
  label: string
  unlocked: boolean
}

export interface Achievements {
  charId: string
  streak: number
  bestStreak: number
  totalSeconds: number
  level: AchievementLevel
  badges: AchievementBadge[]
}

/** stats:achievements 返回（等级 + 徽章 + 连续天数） */
export interface StatsAchievementsResult {
  ok: boolean
  error?: string
  achievements?: Achievements
}

/** 周期指标（趋势对比 / 报告用；单期聚合） */
export interface PeriodMetric {
  totalSeconds: number
  activeDays: number
  events: number
  interactions: number
}

/** 两期对比结果 */
export interface PeriodCompareResult {
  current: PeriodMetric
  previous: PeriodMetric
  /** 本期相对上期时长变化百分比（上期为零 → null） */
  changeTotalPercent: number | null
}

/** stats:trend 返回（近7天/本月/本年与上期对比） */
export interface StatsTrendResult {
  ok: boolean
  error?: string
  compare?: PeriodCompareResult
}

/** stats:report:generate 返回（周报/月报 Markdown 落盘路径） */
export interface StatsReportGenerateResult {
  ok: boolean
  error?: string
  path?: string
}

/** stats:exportExcel 返回（按年导出 xlsx；canceled=用户取消保存对话框） */
export interface StatsSpreadsheetResult {
  ok: boolean
  error?: string
  canceled?: boolean
  path?: string
}

/** 自动报告单条规则（周报用 dayOfWeek，月报用 dayOfMonth） */
export interface AutoReportRule {
  enabled: boolean
  /** 周报：0=周日..6=周六（JS getDay 惯例） */
  dayOfWeek: number
  /** 月报：1..31 */
  dayOfMonth: number
  /** HH:mm（24h，前导 0 必填） */
  time: string
}

/** 自动报告配置（持久化于 userData/autoReports.json） */
export interface AutoReportConfig {
  weekly: AutoReportRule
  monthly: AutoReportRule
}

/** autoReport:fired 事件（主进程 → 渲染层，气泡展示） */
export interface AutoReportFired {
  type: 'week' | 'month'
  title: string
  body: string
}

/** autoReport:get 返回 */
export interface AutoReportGetResult {
  ok: boolean
  error?: string
  config?: AutoReportConfig
}

/** autoReport:set 返回 */
export interface AutoReportSetResult {
  ok: boolean
  error?: string
}

/** 推送 API 配置（持久化于 userData/pushApi.json；token 32 位十六进制）
 * @note enabled=false 时服务不启动；token 为空时首次启动惰性生成 */
export interface PushApiConfig {
  enabled: boolean
  token: string
  /** 推送服务监听端口（启动后由运行时写入，关闭时删除） */
  port?: number
}

/** pushApi:get 返回的摘要信息（port=当前实际端口，未启动为 0） */
export interface PushApiInfo {
  enabled: boolean
  port: number
  token: string
}

/** pushApi:get 返回 */
export interface PushApiGetResult {
  ok: boolean
  error?: string
  info?: PushApiInfo
}

/** pushApi:setEnabled 返回 */
export interface PushApiSetEnabledResult {
  ok: boolean
  error?: string
}

/** pushApi:resetToken 返回 */
export interface PushApiResetTokenResult {
  ok: boolean
  error?: string
  token?: string
}

/** pushApi:test 返回 */
export interface PushApiTestResult {
  ok: boolean
  error?: string
}

/** push:fired 事件（主进程 → 渲染层，气泡展示） */
export interface PushApiFired {
  /** 来源：push=第三方推送通道；passive=被动数据源 */
  kind?: 'push' | 'passive'
  /** 台词池 key（见 speech.ts SpeechPoolKey） */
  reaction?: string
  /** 简短占位片段（域名/文件名/应用名/推送标题） */
  placeholder?: string
  title?: string
  body?: string
  type?: string
}

/** 剪贴板被动数据源配置（enabled=false 时停止轮询；onlyPatterns 非空时仅收集匹配项） */
export interface PassiveClipboardConfig {
  enabled: boolean
  /** 轮询间隔（毫秒），正整数 */
  pollMs: number
  /** 仅收集匹配这些正则（空数组表示全部收集） */
  onlyPatterns: string[]
  /** 忽略匹配这些正则的内容 */
  ignorePatterns: string[]
  /** 单条内容最大长度，正整数 */
  maxLen: number
}

/** 文件夹被动数据源配置（dir 为空字符串表示未启用路径） */
export interface PassiveFolderConfig {
  enabled: boolean
  /** 监听目录绝对路径，可为空字符串 */
  dir: string
  /** 匹配的文件名 glob 模式，如 ['*.txt'] */
  patterns: string[]
  /** 文件变化防抖（毫秒），正整数 */
  debounceMs: number
}

/** 前台窗口被动数据源配置（mappings 决定哪些进程需要关注） */
export interface PassiveForegroundConfig {
  enabled: boolean
  /** 前台进程轮询间隔（毫秒），正整数 */
  pollMs: number
  /** 进程映射表，process 为进程名（非空），state 为关注/忽略 */
  mappings: { process: string; state: 'focus' | 'ignore' }[]
}

/** 被动数据源统一配置（持久化于 userData/passiveSources.json） */
export interface PassiveSourcesConfig {
  clipboard: PassiveClipboardConfig
  folder: PassiveFolderConfig
  foreground: PassiveForegroundConfig
}

/** passive:get 返回（config=当前生效的被动数据源配置） */
export interface PassiveGetResult {
  ok: boolean
  error?: string
  config?: PassiveSourcesConfig
}

/** passive:set 返回 */
export interface PassiveSetResult {
  ok: boolean
  error?: string
}

/** passive:test 返回（手动触发某源一次，校验链路是否正常） */
export interface PassiveTestResult {
  ok: boolean
  error?: string
}
